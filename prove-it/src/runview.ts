// events.jsonl ──reduce──> RunView. The view is disposable: rebuild it from the log.
// Model-facing observations and operator interfaces must project from the same events.
import type { Ev } from './events.ts';

export interface Pending {
  tool: string;
  args: Record<string, unknown>;
  eventId: number;
}

export interface RunView {
  run: string;
  status:
    | 'none'
    | 'running'
    | 'interrupted'
    | 'cancelled'
    | 'needs_evidence'
    | 'needs_reconcile'
    | 'completed';
  turns: number;
  planVersion: number;
  pending: Pending | null;
  lastObservation: string | null;
  toolFailures: number;
  budgets: { attempts: number; used: number };
  contract: string | null;
  // Pinned at request time, before any turn ran. The gate re-hashes at check
  // time, so a receipt's candidate_tree is expected to differ from this one.
  candidate_at_request: string | null;
  receiptVerified: boolean;
}

export function reduce(events: Ev[]): RunView {
  const v: RunView = {
    run: '',
    status: 'none',
    turns: 0,
    planVersion: 0,
    pending: null,
    lastObservation: null,
    toolFailures: 0,
    budgets: { attempts: 0, used: 0 },
    contract: null,
    candidate_at_request: null,
    receiptVerified: false,
  };
  for (const e of events) {
    v.run = e.run;
    const d = e.data as Record<string, any>;
    switch (e.type) {
      case 'run.requested':
        v.status = 'running';
        v.contract = d.contract_sha256 ?? null;
        v.candidate_at_request = d.candidate_tree ?? null;
        v.budgets.attempts = d.attempts ?? 0;
        break;
      case 'plan.approved':
        v.planVersion += 1;
        break;
      case 'turn.started':
        v.turns = d.turn ?? v.turns + 1;
        break;
      case 'tool.requested':
        v.pending = { tool: d.tool, args: d.args ?? {}, eventId: e.id };
        break;
      case 'tool.result':
        v.pending = null;
        v.lastObservation = d.summary ?? d.policy ?? null;
        if (d.status === 'failed') {
          v.toolFailures += 1;
          v.budgets.used += 1;
        }
        break;
      case 'run.interrupted':
        v.status = 'interrupted';
        break;
      case 'run.resumed':
        v.status = 'running';
        break;
      case 'run.cancelled':
        v.status = 'cancelled';
        break;
      case 'run.stopped':
        // The worker saying "done" is an opinion. Evidence is the gate's job.
        v.status = 'needs_evidence';
        break;
      case 'gate.result':
        v.receiptVerified = d.verified === true;
        break;
      case 'run.completed':
        v.status = 'completed';
        break;
    }
  }
  // A log that ends with a dispatched-but-unrecorded tool means the world may
  // have changed without the log knowing. That demands a deliberate decision.
  if (v.pending && (v.status === 'running' || v.status === 'interrupted'))
    v.status = 'needs_reconcile';
  return v;
}
