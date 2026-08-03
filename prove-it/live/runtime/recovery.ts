// What happens after a process stops in the middle of something. The rules are
// short on purpose:
//
//   1. A committed action with no recorded result blocks the run.
//   2. A bare resume fails. It does not retry, and it does not guess.
//   3. Only an operator can say what the world actually did.
//   4. The decision enters the log, then the agent is told about it.
//
// This is the S3 lesson expressed as code the runtime obeys everywhere.
import type { LiveEventLog } from './event-log.ts';
import type { LiveToolResult } from './protocol.ts';
import type { LiveRunView, PendingAction } from './run-view.ts';

export const RECONCILIATIONS = ['ok', 'failed', 'in_doubt'] as const;
export type Reconciliation = (typeof RECONCILIATIONS)[number];

export function isReconciliation(value: string): value is Reconciliation {
  return (RECONCILIATIONS as readonly string[]).includes(value);
}

export class ResumeBlocked extends Error {
  readonly pending: PendingAction;
  constructor(message: string, pending: PendingAction) {
    super(message);
    this.name = 'ResumeBlocked';
    this.pending = pending;
  }
}

// The screen text for a blocked resume. It names the tool, the exact arguments,
// and the idempotency key, because those are what an operator needs to go and
// look at the world.
export function pendingReport(pending: PendingAction): string[] {
  return [
    'The harness dispatched an action and never recorded its result.',
    'The side effect may or may not have happened.',
    `tool: ${pending.tool}`,
    `args: ${JSON.stringify(pending.args)}`,
    `idempotency key: ${pending.idempotencyKey ?? '(none recorded)'}`,
    `dispatched at: ${pending.dispatchedAt}`,
    'Inspect the world, then record what you found:',
    `  --reconcile ${RECONCILIATIONS.join('|')}`,
  ];
}

// Called before any resume path starts a provider. Throwing here is the point:
// there is no code path from needs_reconcile to a running agent that does not
// pass through an operator decision.
export function assertResumable(view: LiveRunView): void {
  if (view.status === 'needs_reconcile' && view.pending)
    throw new ResumeBlocked(pendingReport(view.pending).join('\n'), view.pending);
  if (view.status === 'completed' || view.status === 'failed')
    throw new Error(`run is ${view.status}; nothing to resume`);
}

// The operator's observation becomes the tool's result. It is recorded as
// `tool.reconciled` rather than `tool.result` so the log never claims the
// harness saw something it did not.
export function recordReconciliation(
  log: LiveEventLog,
  pending: PendingAction,
  decision: Reconciliation,
  note: string,
): LiveToolResult {
  const result = resultFor(pending, decision, note);
  log.append('tool.reconciled', 'operator', {
    call_id: pending.callId,
    tool: pending.tool,
    decision,
    note,
    dispatched_event: pending.eventId,
    result,
  });
  return result;
}

function resultFor(
  pending: PendingAction,
  decision: Reconciliation,
  note: string,
): LiveToolResult {
  const observed = note.trim() || 'the operator inspected the world by hand';
  if (decision === 'ok')
    return {
      status: 'ok',
      summary: `operator confirmed ${pending.tool} completed: ${observed}`,
    };
  if (decision === 'failed')
    return {
      status: 'failed',
      retryable: true,
      summary: `operator confirmed ${pending.tool} did not take effect: ${observed}`,
    };
  return {
    status: 'in_doubt',
    summary: `${pending.tool} left the world in an unknown state`,
    reconcile: observed,
  };
}

// The short instruction a new provider process receives on top of the
// reconstructed conversation. It states the fact and the constraint, and it
// does not tell the agent what to conclude.
export function recoveryInstruction(
  pending: PendingAction,
  decision: Reconciliation,
): string {
  const key = pending.idempotencyKey ? ` with idempotency key ${pending.idempotencyKey}` : '';
  const observed = {
    ok: 'The operator inspected the world and confirmed the action took effect.',
    failed: 'The operator inspected the world and confirmed the action did not take effect.',
    in_doubt: 'The operator could not determine whether the action took effect.',
  }[decision];
  return [
    'This process is a restart. The previous process stopped after the harness',
    `dispatched ${pending.tool}${key} and before it recorded a result.`,
    observed,
    'Read the reconciled result above before you decide what to do next.',
    'Do not repeat an external effect on the assumption that it failed.',
  ].join(' ');
}
