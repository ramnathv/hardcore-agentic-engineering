// The canonical vocabulary of the live runtime. Every provider-specific shape
// stops at the adapter; the event log, the reducer, the tool bridge, and the
// screen all speak the types in this file and nothing else.
//
// Read this file first. The rest of live/runtime/ is machinery around it.

export const RUNTIME_VERSION = '0.1.0';

export type Lane = 'shared' | 'left' | 'right';

// 'tool' is the harness executing an action; 'worker' is the agent asking for
// one. Keeping them apart is the whole point: an agent request is an opinion,
// a tool result is a fact.
export type Actor = 'operator' | 'worker' | 'harness' | 'tool' | 'gate';

// ---------------------------------------------------------------------------
// Durable events
// ---------------------------------------------------------------------------

// The append-only record of what happened. Every view — run state, canonical
// conversation, screen transcript — is derived from these and nothing else.
export interface LiveEvent {
  id: number;
  run: string;
  lane: Lane;
  ts: string;
  type: LiveEventType;
  actor: Actor;
  data: Record<string, unknown>;
}

export type LiveEventType =
  | 'run.requested' // contract, workspace identity, provider, and budget are locked
  | 'provider.session.started' // provider and model identity are known
  | 'turn.started' // one provider turn began
  | 'message.completed' // one complete agent message entered the conversation
  | 'tool.requested' // the agent asked for a named tool with structured arguments
  | 'tool.refused' // policy refused the request before dispatch
  | 'tool.dispatched' // the harness committed to an effectful action
  | 'tool.result' // the harness recorded the result and its artifact reference
  | 'run.interrupted' // the process stopped at a known point
  | 'tool.reconciled' // an operator recorded the observed result of a pending action
  | 'run.resumed' // a new process resumed from the durable conversation
  | 'worker.claimed_done' // the agent stated that its work was complete
  | 'gate.result' // the gate accepted or refused the evidence
  | 'run.completed' // a gate-accepted receipt authorized completion
  // Not in the lesson table, but the failure contract needs a terminal state
  // that is honestly not a lesson surprise: a lane that died on its own.
  | 'run.failed';

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface ToolRequest {
  callId: string; // survives the crash; the tool result is bound back by this
  tool: string;
  args: Record<string, unknown>;
}

// The same five statuses the student harness teaches in src/tools.ts. Live
// results carry a call id and artifact references, so the union is declared
// here rather than imported — the student vocabulary must not drift under the
// live runtime, and the live runtime must not force fields into the starter.
export type LiveToolResult =
  | { status: 'ok'; summary: string; artifact?: string; changed?: string[] }
  | { status: 'failed'; summary: string; retryable: boolean; artifact?: string }
  | { status: 'in_doubt'; summary: string; reconcile: string; artifact?: string }
  | { status: 'refused'; policy: string; next: string }
  | { status: 'pending'; approvalId: string; summary: string };

export type ToolStatus = LiveToolResult['status'];

// What the agent is told a tool does. The adapter renders this into whatever
// tool-declaration format its provider wants.
export interface ToolSpec {
  name: string;
  description: string;
  schema: Record<string, unknown>; // JSON Schema for the arguments
}

export function summarizeResult(r: LiveToolResult): string {
  if (r.status === 'refused') return `refused — ${r.policy}`;
  if (r.status === 'pending') return `pending — ${r.summary}`;
  return `${r.status} — ${r.summary}`;
}

// ---------------------------------------------------------------------------
// The canonical conversation
// ---------------------------------------------------------------------------

// Provider-neutral history. It is never stored directly: run-view.ts rebuilds
// it from the durable events, so a crash cannot lose a turn the log recorded,
// and a provider's private resume record is never the authority.
export type ConversationItem =
  | { kind: 'system'; text: string }
  | { kind: 'brief'; text: string }
  | { kind: 'agent'; text: string; calls: ToolRequest[] }
  | { kind: 'tool_result'; callId: string; tool: string; result: LiveToolResult }
  | { kind: 'operator'; text: string }
  | { kind: 'gate'; accepted: boolean; text: string };

// What a provider process is started with. A fresh run and a post-crash resume
// use the same shape; only the conversation is longer the second time.
export interface AgentInput {
  system: string;
  conversation: ConversationItem[];
  tools: ToolSpec[];
}

// ---------------------------------------------------------------------------
// Provider events
// ---------------------------------------------------------------------------

// The adapter's whole output surface. An adapter that needs a new event type
// here is an adapter leaking provider detail into the runtime.
export type ProviderEvent =
  | { type: 'session.started'; sessionId: string; model: string }
  | { type: 'message.delta'; text: string }
  | { type: 'message.completed'; message: ConversationItem }
  | { type: 'tool.requested'; callId: string; tool: string; args: unknown }
  | { type: 'turn.completed'; stopReason: string }
  | { type: 'provider.failed'; code: string; detail: string };

// ---------------------------------------------------------------------------
// Presentation events
// ---------------------------------------------------------------------------

// What the screen consumes. The renderer never sees a LiveEvent and never sees
// provider JSON: it sees these, already normalized and already summarized.
export type PresentationEvent =
  | { kind: 'agent'; text: string }
  | { kind: 'tool'; tool: string; summary: string; args: Record<string, unknown> }
  | {
      kind: 'tool.result';
      tool: string;
      status: ToolStatus;
      line: string;
      artifact?: string;
    }
  | { kind: 'state'; lines: string[] }
  | { kind: 'error'; code: string; detail: string };
