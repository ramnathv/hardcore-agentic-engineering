// The durable agent-and-tool loop. One turn is: ask the provider, record what
// it said, and for every tool it named — apply policy, commit, execute, record.
//
// The order inside that last clause is the whole design:
//
//   tool.requested   the agent asked (an opinion, recorded as one)
//   policy           refuse here, before anything happens
//   tool.dispatched  flushed to disk BEFORE the effect
//   execute          the world may change now
//   tool.result      flushed to disk AFTER the effect
//
// A process that dies between dispatch and result leaves a log that says an
// action was committed and never says what came of it. That is not a bug to be
// smoothed over on restart — it is the state an operator has to resolve, and
// every path back to a running agent goes through them.
import { appendFileSync, existsSync } from 'node:fs';
import type { ArtifactSet, LaneArtifacts } from './artifacts.ts';
import { LiveEventLog } from './event-log.ts';
import type {
  ConversationItem,
  Lane,
  LiveToolResult,
  PresentationEvent,
  ToolRequest,
} from './protocol.ts';
import { summarizeResult } from './protocol.ts';
import { assertResumable } from './recovery.ts';
import { conversationFor, reduce, type LiveRunView } from './run-view.ts';
import {
  applyPolicy,
  assertOwnedStage,
  execute,
  idempotencyKeyOf,
  prepareStageState,
  screenSummaryOf,
  toolSpecs,
  type ToolContext,
} from './tool-catalog.ts';
import type { ProviderSession } from '../providers/provider.ts';

export interface EngineOptions {
  runId: string;
  lane: Lane;
  stage: string; // an owned temporary stage; asserted before any tool runs
  repoRoot: string; // the pristine checkout, for lending gate-capable roots
  artifacts: ArtifactSet;
  session: ProviderSession;
  system: string;
  brief: string;
  checkCommand: string;
  tools?: string[]; // a subset of the catalog; default is the whole catalog
  // Stage-relative paths this lane's world does not contain — the sandbox
  // boundary a lesson draws around a worker. See ToolContext.hidden.
  hidden?: string[];
  budget: { maxTurns: number; maxSeconds: number };
  contractSha?: string | null;
  workspaceHash?: string | null;
  // A short instruction handed to a restarted process on top of the durable
  // conversation. recovery.ts builds it; the engine only records it.
  resumeInstruction?: string;
  // The only thing that can complete a run. The engine never decides this and
  // never reaches for the gate itself: the caller supplies the request, so no
  // gate path, key, or process lives in the loop.
  requestGate?(runId: string): GateOutcome;
  onPresent?(event: PresentationEvent): void;
}

export interface GateOutcome {
  accepted: boolean;
  detail: string;
}

// The stop points the recovery matrix walks. Set PROVE_IT_LIVE_CRASH_AT to one
// of these and PROVE_IT_LIVE_CRASH_AT_CALL to the 1-based call number.
export type CrashPoint =
  | 'before_request'
  | 'after_request'
  | 'after_dispatch'
  | 'after_effect'
  | 'after_result'
  | 'during_append';

const CRASH_EXIT = 9;

export async function runLive(options: EngineOptions): Promise<LiveRunView> {
  const stage = assertOwnedStage(options.stage);
  prepareStageState(stage);

  const laneArtifacts = options.artifacts.lane(options.lane);
  const log = new LiveEventLog(laneArtifacts.eventsPath, options.runId, options.lane);
  const specs = toolSpecs(options.tools);

  let view = reduce(log.events());

  if (view.status === 'none') {
    log.append('run.requested', 'operator', {
      provider: options.session.provider,
      system: options.system,
      brief: options.brief,
      contract_sha256: options.contractSha ?? null,
      workspace_tree: options.workspaceHash ?? null,
      max_turns: options.budget.maxTurns,
      max_seconds: options.budget.maxSeconds,
      tools: specs.map((s) => s.name),
      check_command: options.checkCommand,
      ...(options.hidden?.length ? { hidden_paths: options.hidden } : {}),
    });
    // The manifest and the log must not be able to disagree about what this
    // run was bound to, so the same values are written from the same place.
    options.artifacts.updateManifest({
      run_id: options.runId,
      contract_sha256: options.contractSha ?? null,
      workspace_tree_start: options.workspaceHash ?? null,
    });
  } else {
    // Throws on a pending action. There is no argument that gets past this.
    assertResumable(view);
    // Calls the previous process asked for and never committed to. The log
    // proves they did not run, so the harness answers them itself — truthfully,
    // and retryable, because re-asking is safe when nothing happened. Leaving
    // them dangling would hand the next process a conversation no provider
    // accepts and no reader could trust.
    for (const call of view.unansweredCalls)
      log.append('tool.result', 'harness', {
        call_id: call.callId,
        tool: call.tool,
        result: {
          status: 'failed',
          retryable: true,
          summary:
            'the harness stopped before this call was dispatched, so it never ran; ' +
            'asking again is safe',
        },
      });
    log.append('run.resumed', 'operator', {
      from_turn: view.turns,
      ...(options.resumeInstruction ? { instruction: options.resumeInstruction } : {}),
    });
  }
  view = reduce(log.events());

  const present = (event: PresentationEvent): void => {
    options.onPresent?.(event);
    laneArtifacts.present(presentationLine(event));
  };

  const deadline = Date.now() + options.budget.maxSeconds * 1000;
  let callNumber = 0;
  let feed: ConversationItem[] | null = null;
  let processStarted = false;

  try {
    while (true) {
      if (view.turns >= options.budget.maxTurns) {
        fail(log, present, 'budget_turns', `turn budget of ${options.budget.maxTurns} reached`);
        break;
      }
      if (Date.now() > deadline) {
        fail(log, present, 'budget_seconds', `lane budget of ${options.budget.maxSeconds}s reached`);
        break;
      }

      const turn = view.turns + 1;
      log.append('turn.started', 'harness', { turn });

      const stream = processStarted
        ? options.session.continue(feed ?? [])
        : options.session.start({
            system: options.system,
            conversation: conversationFor(view),
            tools: specs,
          });
      processStarted = true;

      const results: ConversationItem[] = [];
      let providerFailed = false;
      let sawAnything = false;
      let lastMessage = '';

      for await (const event of stream) {
        sawAnything = true;
        switch (event.type) {
          case 'session.started': {
            log.append('provider.session.started', 'harness', {
              session_id: event.sessionId,
              model: event.model,
              provider: options.session.provider,
            });
            options.artifacts.noteSession(event.sessionId, event.model);
            break;
          }
          case 'message.delta': {
            // Deltas live in the raw artifact only. The durable log records
            // complete messages, because half a sentence recovers nothing.
            break;
          }
          case 'message.completed': {
            const message = event.message;
            if (message.kind !== 'agent') break;
            lastMessage = message.text;
            log.append('message.completed', 'worker', {
              text: message.text,
              calls: message.calls,
            });
            if (message.text.trim()) present({ kind: 'agent', text: message.text });
            break;
          }
          case 'tool.requested': {
            callNumber += 1;
            const request: ToolRequest = {
              callId: event.callId,
              tool: event.tool,
              args: (event.args ?? {}) as Record<string, unknown>,
            };
            crashPoint('before_request', callNumber, log, request.tool);
            const result = handleTool(request, callNumber, {
              stage,
              repoRoot: options.repoRoot,
              checkCommand: options.checkCommand,
              allowed: options.tools,
              hidden: options.hidden,
              log,
              laneArtifacts,
              present,
            });
            results.push({
              kind: 'tool_result',
              callId: request.callId,
              tool: request.tool,
              result,
            });
            break;
          }
          case 'turn.completed': {
            break;
          }
          case 'provider.failed': {
            providerFailed = true;
            fail(log, present, event.code, event.detail);
            break;
          }
        }
      }

      view = reduce(log.events());
      if (providerFailed) break;

      if (!sawAnything) {
        // The process exited without saying anything. Naming it as a provider
        // failure keeps it out of the lesson's surprise budget.
        fail(log, present, 'empty_stream', 'the provider process ended without emitting an event');
        break;
      }

      if (results.length === 0) {
        // No tools this turn: the agent thinks it is finished. It is not, and
        // the log says so — only a gate-accepted receipt completes a run.
        log.append('worker.claimed_done', 'worker', { text: lastMessage });
        present({
          kind: 'state',
          lines: [
            'The agent stated its work is complete.',
            'That is a claim. The gate decides.',
          ],
        });
        view = reduce(log.events());

        if (interruptAtClaim(log, present)) break;
        const gate = askGate(options, log, present);
        if (!gate) break; // no gate wired: the run stops at the claim
        view = reduce(log.events());
        if (gate.accepted) break;

        // A refusal is evidence, and the agent gets to act on it. This is the
        // whole S1 lesson: the claim was not the end, and the run is still open.
        feed = [{ kind: 'gate', accepted: false, text: gate.detail }];
        continue;
      }

      feed = results;
    }
  } finally {
    await options.session.stop('engine finished');
  }

  return reduce(log.events());
}

// ---------------------------------------------------------------------------

// The second shape a live run can take. Claude Code runs its own turn loop, so
// the harness cannot be the thing that hands back each tool result — the
// provider does that internally. What the harness keeps is everything that
// matters: it supplies the only tools in the room, applies policy, performs
// every effect, and owns the durable record.
//
// `runLive` above drives the loop. This drives the recording. Both produce the
// same events and reduce to the same view, which is why one renderer and one
// reducer serve both.
export async function runProviderDriven(
  options: EngineOptions & { startBridge(deps: ToolDeps): { close(): Promise<void> } },
): Promise<LiveRunView> {
  const stage = assertOwnedStage(options.stage);
  prepareStageState(stage);

  const laneArtifacts = options.artifacts.lane(options.lane);
  const log = new LiveEventLog(laneArtifacts.eventsPath, options.runId, options.lane);
  const specs = toolSpecs(options.tools);
  let view = reduce(log.events());

  if (view.status === 'none') {
    log.append('run.requested', 'operator', {
      provider: options.session.provider,
      system: options.system,
      brief: options.brief,
      contract_sha256: options.contractSha ?? null,
      workspace_tree: options.workspaceHash ?? null,
      max_turns: options.budget.maxTurns,
      max_seconds: options.budget.maxSeconds,
      tools: specs.map((s) => s.name),
      check_command: options.checkCommand,
      ...(options.hidden?.length ? { hidden_paths: options.hidden } : {}),
      driver: 'provider',
    });
    options.artifacts.updateManifest({
      run_id: options.runId,
      contract_sha256: options.contractSha ?? null,
      workspace_tree_start: options.workspaceHash ?? null,
    });
  } else {
    assertResumable(view);
    log.append('run.resumed', 'operator', {
      from_turn: view.turns,
      ...(options.resumeInstruction ? { instruction: options.resumeInstruction } : {}),
    });
  }
  view = reduce(log.events());

  const present = (event: PresentationEvent): void => {
    options.onPresent?.(event);
    laneArtifacts.present(presentationLine(event));
  };

  // The bridge executes tools on this process's log, so a tool call arriving
  // from the provider's MCP child is recorded exactly like one the harness
  // asked for itself.
  let interruptedHere = false;
  const bridge = options.startBridge({
    stage,
    repoRoot: options.repoRoot,
    checkCommand: options.checkCommand,
    allowed: options.tools,
    hidden: options.hidden,
    log,
    laneArtifacts,
    present,
    onInterrupt: () => {
      interruptedHere = true;
      void options.session.stop('interrupted at a declared point');
    },
  });

  log.append('turn.started', 'harness', { turn: view.turns + 1 });

  let failed = false;
  let lastMessage = '';

  try {
    for await (const event of options.session.start({
      system: options.system,
      conversation: conversationFor(view),
      tools: specs,
    })) {
      switch (event.type) {
        case 'session.started':
          log.append('provider.session.started', 'harness', {
            session_id: event.sessionId,
            model: event.model,
            provider: options.session.provider,
          });
          options.artifacts.noteSession(event.sessionId, event.model);
          break;
        case 'message.completed': {
          if (event.message.kind !== 'agent') break;
          lastMessage = event.message.text;
          log.append('message.completed', 'worker', {
            text: event.message.text,
            calls: event.message.calls,
          });
          if (event.message.text.trim()) present({ kind: 'agent', text: event.message.text });
          break;
        }
        case 'provider.failed':
          failed = true;
          fail(log, present, event.code, event.detail);
          break;
        case 'message.delta':
        case 'tool.requested':
        case 'turn.completed':
          break;
      }
    }
  } finally {
    await options.session.stop('run finished');
    await bridge.close();
  }

  if (!failed && !interruptedHere) {
    log.append('worker.claimed_done', 'worker', { text: lastMessage });
    present({
      kind: 'state',
      lines: ['The agent stated its work is complete.', 'That is a claim. The gate decides.'],
    });
    // A refusal here cannot be handed back mid-turn — the provider owned the
    // loop and its process has exited. It lands in the durable conversation
    // instead, which is what a resume gives to the next process.
    if (!interruptAtClaim(log, present)) askGate(options, log, present);
  }

  return reduce(log.events());
}

export interface ToolDeps {
  stage: string;
  repoRoot: string;
  checkCommand: string;
  allowed?: string[];
  hidden?: string[];
  // Set once an interrupt has fired, so a run stops at the first matching
  // event rather than at every one of them.
  interrupted?: boolean;
  // How the harness stops a provider that owns its own loop. Recording the
  // interrupt without stopping the agent would be a note, not an interrupt.
  onInterrupt?(): void;
  log: LiveEventLog;
  laneArtifacts: LaneArtifacts;
  present(event: PresentationEvent): void;
}

// Exported so the socket bridge can reuse the exact ordering a provider-driven
// run needs. There is one implementation of "the harness executes a tool", and
// this is it.
export function handleTool(
  request: ToolRequest,
  callNumber: number,
  deps: ToolDeps,
): LiveToolResult {
  const { log, laneArtifacts, present } = deps;

  log.append('tool.requested', 'worker', {
    call_id: request.callId,
    tool: request.tool,
    args: request.args,
  });
  // The exact request is on disk before anything acts on it, so a crash mid-
  // tool still leaves an operator the arguments to reconcile against.
  laneArtifacts.writeArgs(request.callId, request.args);
  crashPoint('after_request', callNumber, log, request.tool);

  present({
    kind: 'tool',
    tool: request.tool,
    summary: screenSummaryOf(request.tool, request.args),
    args: request.args,
  });

  const ctx: ToolContext = {
    stage: deps.stage,
    repoRoot: deps.repoRoot,
    checkCommand: deps.checkCommand,
    allowed: deps.allowed,
    hidden: deps.hidden,
    callId: request.callId,
    writeArtifact: laneArtifacts.toolWriter(request.callId),
  };

  const refusal = applyPolicy(request.tool, request.args, ctx);
  if (refusal) {
    log.append('tool.refused', 'harness', {
      call_id: request.callId,
      tool: request.tool,
      policy: refusal.status === 'refused' ? refusal.policy : 'refused',
      next: refusal.status === 'refused' ? refusal.next : '',
    });
    laneArtifacts.writeResult(request.callId, refusal);
    present(resultEvent(request.tool, refusal));
    return refusal;
  }

  log.append('tool.dispatched', 'harness', {
    call_id: request.callId,
    tool: request.tool,
    args: request.args,
    idempotency_key: idempotencyKeyOf(request.tool, request.args),
  });
  crashPoint('after_dispatch', callNumber, log, request.tool);

  const result = execute(request.tool, request.args, ctx);

  // Everything past this line is bookkeeping about an effect that already
  // happened. Dying here is the S3 lesson, not a fixture.
  crashPoint('after_effect', callNumber, log, request.tool);

  laneArtifacts.writeResult(request.callId, result);
  // The nastiest boundary: the crash lands mid-write, leaving a torn record.
  // The reader drops it, so the state is the same pending state as a crash one
  // instruction earlier — which is exactly what the recovery matrix asserts.
  crashPoint('during_append', callNumber, log, request.tool);
  log.append('tool.result', 'tool', {
    call_id: request.callId,
    tool: request.tool,
    result,
  });
  crashPoint('after_result', callNumber, log, request.tool);

  present(resultEvent(request.tool, result));

  // An interrupt is not a crash. The tool finished, the result is recorded, and
  // the run stops at a point the log can name — the first successful write, say.
  // Pinning it to an event rather than a wall clock is what makes it a lesson
  // condition instead of a race.
  if (
    process.env.PROVE_IT_LIVE_INTERRUPT_AT_TOOL === request.tool &&
    result.status === 'ok' &&
    !deps.interrupted
  ) {
    deps.interrupted = true;
    log.append('run.interrupted', 'operator', {
      after_tool: request.tool,
      call_id: request.callId,
      reason: 'the operator stopped the run at a known point',
    });
    present({
      kind: 'state',
      lines: [
        `The run was stopped after ${request.tool} succeeded.`,
        'Everything up to here is durable.',
      ],
    });
    deps.onInterrupt?.();
  }
  return result;
}

function resultEvent(tool: string, result: LiveToolResult): PresentationEvent {
  return {
    kind: 'tool.result',
    tool,
    status: result.status,
    line: summarizeResult(result),
    ...('artifact' in result && result.artifact ? { artifact: result.artifact } : {}),
  };
}

// The S1 checkpoint. The claim is on the record and nothing has judged it yet;
// both lanes fork from this exact point, so the completion authority — accept
// the claim, or ask the gate — is the one thing that differs after the split.
// Set PROVE_IT_LIVE_INTERRUPT_AT_CLAIM to stop here instead of asking the gate.
function interruptAtClaim(
  log: LiveEventLog,
  present: (event: PresentationEvent) => void,
): boolean {
  if (!process.env.PROVE_IT_LIVE_INTERRUPT_AT_CLAIM) return false;
  log.append('run.interrupted', 'operator', {
    after: 'worker.claimed_done',
    reason: 'the operator stopped the run at the claim, before anything judged it',
  });
  present({
    kind: 'state',
    lines: ['The run was stopped at the claim.', 'Nothing has judged it yet.'],
  });
  return true;
}

// Ask the gate, record what it said, and complete the run only if it accepted.
// Returns null when no gate is wired, which is an honest "nobody has judged
// this" rather than a pass.
function askGate(
  options: EngineOptions,
  log: LiveEventLog,
  present: (event: PresentationEvent) => void,
): GateOutcome | null {
  if (!options.requestGate) return null;
  const outcome = options.requestGate(options.runId);
  log.append('gate.result', 'gate', { accepted: outcome.accepted, detail: outcome.detail });
  present({
    kind: 'state',
    lines: outcome.accepted
      ? ['The gate ran the named checks against the pinned tree and issued a receipt.']
      : ['The gate refused the evidence.', 'The run stays open, and the agent is told why.'],
  });
  if (outcome.accepted) {
    log.append('run.completed', 'harness', { via: 'dr-gate check' });
    present({ kind: 'state', lines: ['A verified receipt completed the run.'] });
  }
  return outcome;
}

function fail(
  log: LiveEventLog,
  present: (event: PresentationEvent) => void,
  code: string,
  detail: string,
): void {
  log.append('run.failed', 'harness', { code, detail });
  present({ kind: 'error', code, detail });
}

// A stop point, not a simulation: the process really does die here, mid-run,
// with exactly the events it had managed to flush.
//
// Targeting by tool name matters once a real agent is driving. A live agent
// decides its own order — the one below checked the ledger before paying — so
// "the second call" is not a stable place to stand. The tool is.
function crashPoint(
  point: CrashPoint,
  callNumber: number,
  log: LiveEventLog,
  tool?: string,
): void {
  if (process.env.PROVE_IT_LIVE_CRASH_AT !== point) return;
  const targetTool = process.env.PROVE_IT_LIVE_CRASH_AT_TOOL;
  if (targetTool) {
    if (tool !== targetTool) return;
  } else if (callNumber !== Number(process.env.PROVE_IT_LIVE_CRASH_AT_CALL ?? '1')) return;
  if (point === 'during_append' && existsSync(log.path))
    appendFileSync(log.path, '{"id":9999,"type":"tool.res'); // a torn record
  console.error(`live/engine: stopping at '${point}' before call ${callNumber} finished`);
  process.exit(CRASH_EXIT);
}

// One line per presentation event for the retained transcript. The screen
// renderer in Phase 3 formats these properly; this keeps the artifact honest
// in the meantime.
export function presentationLine(event: PresentationEvent): string {
  // One line per event, always: a transcript where one event can span lines is
  // a transcript nothing can read back.
  const flat = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim();
  switch (event.kind) {
    case 'agent':
      return `AGENT ${flat(event.text)}`;
    case 'tool':
      return `TOOL ${event.tool}${event.summary ? ` · ${event.summary}` : ''}`;
    case 'tool.result':
      return `RESULT ${event.tool} ${flat(event.line)}${event.artifact ? ` [${event.artifact}]` : ''}`;
    case 'state':
      return `STATE ${flat(event.lines.join(' '))}`;
    case 'error':
      return `ERROR ${event.code} ${flat(event.detail)}`;
  }
}
