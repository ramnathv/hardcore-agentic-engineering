// The deterministic adapter. It tests harness plumbing, not model capability:
// no key, no network, no subprocess, same events every time.
//
// It is not a recording. Every script decides what to do next from the tool
// results the harness handed back, so a runtime that forgets to return a
// result produces a visibly different run rather than the same one. That is
// the only honest way to prove the loop is closed.
//
// Deciding from history rather than a turn counter also makes the adapter
// restart-correct: a new process rebuilds what it already asked for from the
// durable conversation, so it resumes instead of starting over.
import type {
  AgentInput,
  ConversationItem,
  LiveToolResult,
  ProviderEvent,
} from '../runtime/protocol.ts';
import type { ProviderOptions, ProviderSession } from './provider.ts';

export type SmokeScript = 'slugify' | 'payment' | 'refusal' | 'failure';

const NAIVE = `export function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
`;

const CORRECT = `export function slugify(title) {
  return title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
`;

interface Step {
  text: string;
  calls?: Array<{ tool: string; args: Record<string, unknown> }>;
  done?: true;
}

export interface SmokeSession extends ProviderSession {
  // What the harness actually handed back. Tests assert on this: it is the
  // evidence that every tool result completed the round trip.
  readonly observed: Array<{ tool: string; result: LiveToolResult }>;
}

export function smokeProvider(
  script: SmokeScript,
  options?: Partial<ProviderOptions>,
): SmokeSession {
  const raw = options?.raw ?? (() => {});
  const observed: Array<{ tool: string; result: LiveToolResult }> = [];
  const asked = new Map<string, number>();
  let callSeq = 0;

  const timesAsked = (tool: string): number => asked.get(tool) ?? 0;
  const saw = (tool: string, status: LiveToolResult['status']): boolean =>
    observed.some((o) => o.tool === tool && o.result.status === status);

  function step(): Step | null {
    if (script === 'failure') return null;

    if (script === 'refusal') {
      if (timesAsked('read_file') === 0)
        return {
          text: 'Checking whether the gate key is readable from here.',
          calls: [{ tool: 'read_file', args: { path: '../control/gate.key' } }],
        };
      if (saw('read_file', 'refused') && timesAsked('read_file') === 1)
        return {
          text: 'That path is refused. Reading the brief inside the workspace instead.',
          calls: [{ tool: 'read_file', args: { path: 'working/BRIEF.md' } }],
        };
      return {
        text: saw('read_file', 'refused')
          ? 'The refusal reached me and I worked inside the allowed path.'
          : 'Nothing refused that read, which the policy requires.',
        done: true,
      };
    }

    if (script === 'payment') {
      // Retry on the same key, never a fresh one. A repeat is safe by
      // construction; inventing a second key is how one intent gets paid
      // twice, which is the mistake S3 exists to show rather than to make.
      const paid = saw('send_payment', 'ok');
      if (!paid && timesAsked('send_payment') < 2)
        return {
          text: 'Sending the payment for invoice-4021.',
          calls: [
            {
              tool: 'send_payment',
              args: {
                intent: 'invoice-4021',
                amount: 250,
                currency: 'USD',
                idempotency_key: 'invoice-4021-attempt-1',
              },
            },
          ],
        };
      // A restart lands here rather than on a second payment: the durable
      // conversation already says the first one was asked for.
      if (timesAsked('inspect_ledger') === 0)
        return {
          text: 'Confirming what the ledger holds for that intent before doing anything else.',
          calls: [{ tool: 'inspect_ledger', args: { intent: 'invoice-4021' } }],
        };
      return { text: 'The ledger is consistent with one payment. I am done.', done: true };
    }

    // slugify
    if (timesAsked('read_file') === 0)
      return {
        text: 'Reading the current implementation before I change it.',
        calls: [{ tool: 'read_file', args: { path: 'working/src/slugify.mjs' } }],
      };
    if (timesAsked('run_check') === 0)
      return {
        text: 'Writing a first implementation and running the named check.',
        calls: [
          { tool: 'write_file', args: { path: 'working/src/slugify.mjs', content: NAIVE } },
          { tool: 'run_check', args: {} },
        ],
      };
    // The branch that proves the loop is closed. If the failed check never
    // comes back, this run stops with the naive implementation still on disk,
    // and the runtime test says so.
    if (saw('run_check', 'failed') && timesAsked('run_check') === 1)
      return {
        text: 'The check failed on the ampersand case. Fixing it and re-running.',
        calls: [
          { tool: 'write_file', args: { path: 'working/src/slugify.mjs', content: CORRECT } },
          { tool: 'run_check', args: {} },
        ],
      };
    return {
      text: saw('run_check', 'ok')
        ? 'The named check passes in my workspace. I believe this is done — the gate decides.'
        : 'No failing check reached me, so I am stopping with the first implementation.',
      done: true,
    };
  }

  async function* emit(current: Step | null): AsyncGenerator<ProviderEvent> {
    if (script === 'failure') {
      yield send({
        type: 'provider.failed',
        code: 'smoke_scripted_failure',
        detail: 'the failure script exists to exercise the terminal path',
      });
      return;
    }
    if (!current) return;

    const requests = (current.calls ?? []).map((c) => {
      asked.set(c.tool, timesAsked(c.tool) + 1);
      return { callId: `smoke-${++callSeq}`, tool: c.tool, args: c.args };
    });

    // Deltas exist so the raw artifact and the screen see streaming text; the
    // durable log records only the completed message.
    for (const chunk of current.text.split(/(?<=\. )/))
      yield send({ type: 'message.delta', text: chunk });

    yield send({
      type: 'message.completed',
      message: { kind: 'agent', text: current.text, calls: requests },
    });

    for (const request of requests)
      yield send({
        type: 'tool.requested',
        callId: request.callId,
        tool: request.tool,
        args: request.args,
      });

    yield send({
      type: 'turn.completed',
      stopReason: current.done ? 'end_turn' : 'tool_use',
    });
  }

  // Every event is written raw before it leaves the adapter, the same
  // obligation a real adapter carries for every line its process prints.
  function send(event: ProviderEvent): ProviderEvent {
    raw(JSON.stringify(event));
    return event;
  }

  function replay(item: ConversationItem): void {
    if (item.kind === 'agent') {
      for (const call of item.calls) asked.set(call.tool, timesAsked(call.tool) + 1);
      // Call ids must stay unique across processes: the tool artifacts of a
      // crashed call are the evidence an operator reconciles against, and a
      // restart that reused the id would write over them.
      callSeq += item.calls.length;
    }
    if (item.kind === 'tool_result') observed.push({ tool: item.tool, result: item.result });
  }

  return {
    provider: 'smoke',
    sessionId: `smoke-${script}`,
    observed,

    async *start(input: AgentInput) {
      // A restart replays the durable conversation into a new process. What
      // this process never saw itself, it reads from the log.
      for (const item of input.conversation) replay(item);
      yield send({
        type: 'session.started',
        sessionId: `smoke-${script}`,
        model: options?.model ?? 'smoke-deterministic',
      });
      yield* emit(step());
    },

    async *continue(items: ConversationItem[]) {
      for (const item of items) replay(item);
      yield* emit(step());
    },

    async stop() {
      // Nothing to tear down: there is no process.
    },
  };
}
