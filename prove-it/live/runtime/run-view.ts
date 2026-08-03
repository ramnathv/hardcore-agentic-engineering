// events.jsonl ──reduce──> LiveRunView. The view is disposable; the log is the
// truth. Rebuilding after a crash is the same code path as building during a
// run, which is why a restart cannot land on a different state than the one
// the run was in.
//
// The canonical conversation is derived here too. That is deliberate: the
// history a resumed provider process receives comes from the durable events,
// never from a provider's private session record.
import type {
  ConversationItem,
  Lane,
  LiveEvent,
  LiveToolResult,
  ToolRequest,
} from './protocol.ts';

export interface PendingAction {
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  idempotencyKey: string | null;
  eventId: number;
  dispatchedAt: string;
}

export type LiveStatus =
  | 'none'
  | 'running'
  | 'interrupted'
  | 'needs_reconcile'
  | 'needs_evidence'
  | 'failed'
  | 'completed';

export interface LiveRunView {
  run: string;
  lane: Lane;
  status: LiveStatus;
  provider: string | null;
  model: string | null;
  sessionIds: string[];
  contract: string | null;
  workspaceAtRequest: string | null;
  turns: number;
  budget: { maxTurns: number; turnsUsed: number };
  // An effectful action the harness committed to and never recorded a result
  // for. Non-null means the world may have moved without the log.
  pending: PendingAction | null;
  // Calls the agent asked for that the harness never committed to. The log
  // proves nothing happened, so a restart can close them itself — but it must
  // close them: no provider will accept a conversation with a dangling call.
  unansweredCalls: ToolRequest[];
  toolCalls: number;
  toolFailures: number;
  toolRefusals: number;
  lastObservation: string | null;
  claimedDone: boolean;
  gateAccepted: boolean;
  failure: { code: string; detail: string } | null;
  conversation: ConversationItem[];
}

function emptyView(): LiveRunView {
  return {
    run: '',
    lane: 'shared',
    status: 'none',
    provider: null,
    model: null,
    sessionIds: [],
    contract: null,
    workspaceAtRequest: null,
    turns: 0,
    budget: { maxTurns: 0, turnsUsed: 0 },
    pending: null,
    unansweredCalls: [],
    toolCalls: 0,
    toolFailures: 0,
    toolRefusals: 0,
    lastObservation: null,
    claimedDone: false,
    gateAccepted: false,
    failure: null,
    conversation: [],
  };
}

// A tool request must reach the conversation attached to the message that made
// it. Providers that stream calls after the message text — most of them — land
// here rather than in the message.completed branch.
function attachCall(conversation: ConversationItem[], call: ToolRequest): void {
  const last = conversation.at(-1);
  if (last && last.kind === 'agent') {
    if (!last.calls.some((c) => c.callId === call.callId)) last.calls.push(call);
    return;
  }
  conversation.push({ kind: 'agent', text: '', calls: [call] });
}

export function reduce(events: LiveEvent[]): LiveRunView {
  const v = emptyView();
  const dispatched = new Map<string, PendingAction>();
  const requested = new Map<string, ToolRequest>();
  const answered = new Set<string>();

  for (const e of events) {
    v.run = e.run;
    v.lane = e.lane;
    const d = e.data as Record<string, any>;

    switch (e.type) {
      case 'run.requested': {
        v.status = 'running';
        v.provider = d.provider ?? null;
        v.contract = d.contract_sha256 ?? null;
        v.workspaceAtRequest = d.workspace_tree ?? null;
        v.budget.maxTurns = d.max_turns ?? 0;
        if (typeof d.system === 'string') v.conversation.push({ kind: 'system', text: d.system });
        if (typeof d.brief === 'string') v.conversation.push({ kind: 'brief', text: d.brief });
        break;
      }
      case 'provider.session.started': {
        v.model = d.model ?? v.model;
        if (typeof d.session_id === 'string' && !v.sessionIds.includes(d.session_id))
          v.sessionIds.push(d.session_id);
        break;
      }
      case 'turn.started': {
        v.turns = d.turn ?? v.turns + 1;
        v.budget.turnsUsed = v.turns;
        break;
      }
      case 'message.completed': {
        v.conversation.push({
          kind: 'agent',
          text: String(d.text ?? ''),
          calls: (d.calls ?? []) as ToolRequest[],
        });
        break;
      }
      case 'tool.requested': {
        v.toolCalls += 1;
        const request: ToolRequest = {
          callId: String(d.call_id),
          tool: String(d.tool),
          args: (d.args ?? {}) as Record<string, unknown>,
        };
        requested.set(request.callId, request);
        attachCall(v.conversation, request);
        break;
      }
      case 'tool.refused': {
        v.toolRefusals += 1;
        answered.add(String(d.call_id));
        const result: LiveToolResult = {
          status: 'refused',
          policy: String(d.policy ?? 'refused by policy'),
          next: String(d.next ?? ''),
        };
        v.lastObservation = result.policy;
        v.conversation.push({
          kind: 'tool_result',
          callId: String(d.call_id),
          tool: String(d.tool),
          result,
        });
        break;
      }
      case 'tool.dispatched': {
        dispatched.set(String(d.call_id), {
          callId: String(d.call_id),
          tool: String(d.tool),
          args: (d.args ?? {}) as Record<string, unknown>,
          idempotencyKey: d.idempotency_key ?? null,
          eventId: e.id,
          dispatchedAt: e.ts,
        });
        break;
      }
      case 'tool.result':
      case 'tool.reconciled': {
        const callId = String(d.call_id);
        dispatched.delete(callId);
        answered.add(callId);
        const result = d.result as LiveToolResult;
        if (result?.status === 'failed') v.toolFailures += 1;
        v.lastObservation =
          result?.status === 'refused'
            ? result.policy
            : ((result as any)?.summary ?? null);
        v.conversation.push({
          kind: 'tool_result',
          callId,
          tool: String(d.tool),
          result,
        });
        // The operator's observed outcome is part of the history the resumed
        // agent reads, and it is labeled as the operator's, not the tool's.
        if (e.type === 'tool.reconciled')
          v.conversation.push({
            kind: 'operator',
            text: `Reconciled ${d.tool} (${callId}) as ${result?.status}.`,
          });
        break;
      }
      case 'run.interrupted': {
        v.status = 'interrupted';
        break;
      }
      case 'run.resumed': {
        v.status = 'running';
        if (typeof d.instruction === 'string')
          v.conversation.push({ kind: 'operator', text: d.instruction });
        break;
      }
      case 'worker.claimed_done': {
        // An opinion, recorded as one. Only the gate closes a run.
        v.claimedDone = true;
        v.status = 'needs_evidence';
        break;
      }
      case 'gate.result': {
        v.gateAccepted = d.accepted === true;
        v.conversation.push({
          kind: 'gate',
          accepted: v.gateAccepted,
          text: String(d.detail ?? ''),
        });
        break;
      }
      case 'run.completed': {
        v.status = 'completed';
        break;
      }
      case 'run.failed': {
        v.status = 'failed';
        v.failure = { code: String(d.code ?? 'unknown'), detail: String(d.detail ?? '') };
        break;
      }
    }
  }

  // A committed action with no recorded result means the side effect may have
  // happened. No resume, no retry, no guess — an operator decides.
  const stillPending = [...dispatched.values()].filter((p) => !answered.has(p.callId));
  v.pending = stillPending.at(-1) ?? null;
  if (v.pending && (v.status === 'running' || v.status === 'interrupted'))
    v.status = 'needs_reconcile';

  // Asked for, never committed to. The log itself proves nothing happened,
  // which is why these do not need an operator — only an honest result.
  v.unansweredCalls = [...requested.values()].filter(
    (r) => !answered.has(r.callId) && !dispatched.has(r.callId),
  );

  return v;
}

// The history a provider process is started with. The system instruction is
// passed separately in AgentInput, so it is stripped here.
export function conversationFor(view: LiveRunView): ConversationItem[] {
  return view.conversation.filter((item) => item.kind !== 'system');
}

export function systemFor(view: LiveRunView): string {
  const first = view.conversation.find((item) => item.kind === 'system');
  return first && first.kind === 'system' ? first.text : '';
}
