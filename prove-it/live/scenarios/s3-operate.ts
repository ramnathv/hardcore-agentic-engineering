// S3 · Operate — the recovery-discipline compare. Declaration only; the runner
// owns every mechanic. Both lanes are deterministic on purpose: the crash must
// land on the same line every time — a live model would move it, and the room
// would be comparing luck instead of recovery discipline.
//
// effect-boundary.mjs records one send_payment request, performs that payment,
// and stops before it records the result. The pending event and the ledger
// entry therefore describe one action, not two examples joined by narration.
import type { Scenario } from '../scenario.ts';

const LEDGER = 'node sessions/s3-control-plane/fixtures/ledger.mjs';
const BOUNDARY = 'node sessions/s3-control-plane/fixtures/effect-boundary.mjs';

// The one intent both lanes recover from — the input the worker was executing
// when the process died.
const INTENT_INPUT =
  'intent ops-5 — send_payment(to: ops, amount: 5): pay the ops ledger exactly once.\n' +
  'the worker dispatched it; the process died before any result was recorded.';

const scenario: Scenario = {
  id: 's3',
  title: 'BLIND RETRY vs RECONCILE BY EVIDENCE',
  sharedFixture:
    'one payment intent and one staged crash at the effect boundary: the payment lands in the ledger, the confirmation never reaches the caller, and the run log holds a dispatched action with no recorded result',
  mechanism:
    'both lanes: harness + smoke worker, a staged crash, and a file-backed ledger standing in for the network — fully scripted and deterministic, so the crash lands on the same line every time; nothing live',
  allowedCausalDifference:
    'the right lane inspects the world and records what it saw before resuming; the left lane fires the effect again without looking.',
  pause: {
    question: 'You looked at the world. What can you truthfully record?',
    kind: 'menu',
    options: ['ok'],
    default: 'ok',
  },
  evidenceNote:
    'left: a staged crash, a lost confirmation, a blind re-send, and two ledger entries for one intent · right: the same crash, needs_reconcile on screen, a refused bare resume, an operator reconciliation in the log, and exactly one entry',
  artifactNote:
    'the log records what the operator said they saw, never the looking itself — and the ledger is a file standing in for a network service; the at-least-once boundary is real, the network is not.',
  expectedVerdicts: {
    left: 'ledger: FAIL',
    right: 'ledger: PASS',
  },
  lanes: {
    left: { label: 'BLIND RETRY', promptDisplay: INTENT_INPUT },
    right: { label: 'RECONCILE BY EVIDENCE', promptDisplay: INTENT_INPUT },
  },
  steps: [
    // SHARED — both lanes stage the identical crashed state; recovery is the
    // only thing allowed to differ.
    {
      lane: 'both',
      showOutput: true,
      frame: 'START',
      extract: 'contract=sha256',
      say: 'the shared fixture: one send_payment request, one ledger effect, and no recorded result — the same boundary every time',
      cmd: `${BOUNDARY} stage --run-id {{runid}}`,
    },

    // LEFT — blind retry: nobody looks at anything.
    {
      lane: 'left',
      frame: 'SURPRISE',
      say: 'did the payment go through? the confirmation is gone and the process is dead — the blind lane does not ask',
    },
    {
      lane: 'left',
      frame: 'CONTROL',
      extract: 'sent: entry #2',
      say: 'recovery, the naive way: a fresh attempt fires the same effect again',
      cmd: `${LEDGER} send --to ops --amount 5 --ledger runs/{{runid}}-ledger.jsonl`,
    },
    {
      lane: 'left',
      frame: 'VERDICT',
      extract: 'ledger: FAIL',
      say: 'one intent, and the world now holds:',
      cmd: `${LEDGER} assert-count --to ops --n 1 --ledger runs/{{runid}}-ledger.jsonl || true`,
    },

    // RIGHT — reconcile by evidence: refuse, look, record, then resume.
    {
      lane: 'right',
      frame: 'SURPRISE',
      extract: '"status": "needs_reconcile"',
      say: 'what does the machine think happened? the harness names what it does not know:',
      cmd: 'node src/loop.ts view {{runid}}',
    },
    {
      lane: 'right',
      frame: 'CONTROL',
      extract: 'PENDING action dispatched but never recorded',
      say: 'the thing everyone wants to do — and the harness refuses to guess; this ledger supports ok, while in_doubt belongs to evidence that cannot settle what happened',
      cmd: 'node src/loop.ts resume {{runid}} || true',
    },
    {
      lane: 'right',
      say: 'so look at the world: the requested payment landed once, and no second payment is owed',
      showOutput: true,
      cmd: `echo "ledger entries for to=ops: $(${LEDGER} count --to ops --ledger runs/{{runid}}-ledger.jsonl)"`,
    },
    { lane: 'right', pause: true },
    {
      lane: 'right',
      showOutput: true,
      say: "resume appends the decision and continues — {{answer}} was the room's call, and the actor on the record is the operator",
      cmd: `${BOUNDARY} reconcile --run-id {{runid}} --status {{answer}} && grep reconciliation runs/{{runid}}/events.jsonl`,
    },
    {
      lane: 'right',
      frame: 'VERDICT',
      extract: 'ledger: PASS',
      say: 'one intent, and the world holds:',
      cmd: `${LEDGER} assert-count --to ops --n 1 --ledger runs/{{runid}}-ledger.jsonl`,
    },
  ],
};

export default scenario;
