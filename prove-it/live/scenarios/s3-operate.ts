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
  'intent: ops-5\n' +
  'action: send_payment(to: ops, amount: 5)\n' +
  'goal: Pay the ops ledger exactly once.\n' +
  'state: The worker dispatched the action. The process died before it recorded a result.';

const scenario: Scenario = {
  id: 's3',
  title: 'BLIND RETRY vs RECONCILE BY EVIDENCE',
  sharedFixture:
    'One payment lands before the process crashes. The run records the dispatch but no result.',
  mechanism:
    'Both lanes use the harness, the smoke worker, a staged crash, and a file-backed ledger. The result is deterministic.',
  allowedCausalDifference:
    'The left lane retries without inspection. The right lane inspects the ledger before it resumes.',
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
    left: { label: 'BLIND RETRY', promptDisplay: INTENT_INPUT, inputLabel: 'INTENT' },
    right: { label: 'RECONCILE BY EVIDENCE', promptDisplay: INTENT_INPUT, inputLabel: 'INTENT' },
  },
  steps: [
    // SHARED — both lanes stage the identical crashed state; recovery is the
    // only thing allowed to differ.
    {
      lane: 'both',
      showOutput: true,
      frame: 'START',
      extract: 'contract=sha256',
      say: 'One payment landed. The process died before it recorded the result.',
      cmd: `${BOUNDARY} stage --run-id {{runid}}`,
    },

    // LEFT — blind retry: nobody looks at anything.
    {
      lane: 'left',
      frame: 'SURPRISE',
      say: 'The confirmation is gone. The blind lane does not inspect the ledger.',
    },
    {
      lane: 'left',
      frame: 'CONTROL',
      extract: 'sent: entry #2',
      say: 'A fresh attempt sends the same payment again.',
      cmd: `${LEDGER} send --to ops --amount 5 --ledger runs/{{runid}}-ledger.jsonl`,
    },
    {
      lane: 'left',
      frame: 'VERDICT',
      extract: 'ledger: FAIL',
      say: 'One intent now produced this ledger result.',
      cmd: `${LEDGER} assert-count --to ops --n 1 --ledger runs/{{runid}}-ledger.jsonl || true`,
    },

    // RIGHT — reconcile by evidence: refuse, look, record, then resume.
    {
      lane: 'right',
      frame: 'SURPRISE',
      extract: '"status": "needs_reconcile"',
      say: 'The harness states what it does not know.',
      cmd: 'node src/loop.ts view {{runid}}',
    },
    {
      lane: 'right',
      frame: 'CONTROL',
      extract: 'PENDING action dispatched but never recorded',
      say: 'A bare resume would guess. The harness refuses and reports the pending action.',
      cmd: 'node src/loop.ts resume {{runid}} || true',
    },
    {
      lane: 'right',
      say: 'The ledger shows one payment. No second payment is due.',
      showOutput: true,
      cmd: `echo "ledger entries for to=ops: $(${LEDGER} count --to ops --ledger runs/{{runid}}-ledger.jsonl)"`,
    },
    { lane: 'right', pause: true },
    {
      lane: 'right',
      showOutput: true,
      say: 'Resume records the room decision and the operator: {{answer}}.',
      cmd: `${BOUNDARY} reconcile --run-id {{runid}} --status {{answer}} && grep reconciliation runs/{{runid}}/events.jsonl`,
    },
    {
      lane: 'right',
      frame: 'VERDICT',
      extract: 'ledger: PASS',
      say: 'One intent produces this ledger result.',
      cmd: `${LEDGER} assert-count --to ops --n 1 --ledger runs/{{runid}}-ledger.jsonl`,
    },
  ],
};

export default scenario;
