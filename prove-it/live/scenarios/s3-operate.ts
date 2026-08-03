// S3 · Operate — the recovery-discipline compare. Declaration only; the runner
// owns every mechanic.
//
// --mock stays deterministic, keyless, and unchanged: effect-boundary.mjs
// records one send_payment request, performs that payment, and stops before it
// records the result. The pending event and the ledger entry therefore
// describe one action, not two examples joined by narration.
//
// Real mode runs an actual agent. The old objection to that was that a live
// model would move the crash and the room would be comparing luck — which is
// true of a crash pinned to a line number, and not true of one pinned to a
// tool. PROVE_IT_LIVE_CRASH_AT_TOOL=send_payment lands in the same place
// however the agent chooses to get there.
//
// The two lanes share one agent history. The prefix runs once, in the left
// pane, and both lanes fork from it — so the crash, the intent, and the
// idempotency key are identical, and the recovery discipline is the only
// thing that differs.
//
// The left lane's control is capability, not carelessness. Given a catalog
// with inspect_ledger, a competent model looks before it acts and the
// duplicate never happens. Given a fork with no durable record and no way to
// inspect, the same model goes looking, finds nothing that can answer the
// question, and pays again. That is the lesson: not an agent that was
// careless, but a control plane that left it no way to be careful.
import type { Scenario } from '../scenario.ts';

const LEDGER = 'node sessions/s3-control-plane/fixtures/ledger.mjs';
const BOUNDARY = 'node sessions/s3-control-plane/fixtures/effect-boundary.mjs';

// Real mode. The prefix is one agent; the lanes are two continuations of it.
const CLI = 'node live/runtime/cli.ts';
const PREFIX_ART = '{{artifact}}/prefix';
const CRASH = 'PROVE_IT_LIVE_CRASH_AT=after_effect PROVE_IT_LIVE_CRASH_AT_TOOL=send_payment';
// Both modes report the verdict in one vocabulary, so the battery asserts the
// same thing whether a fixture or an agent produced it.
const LEDGER_ASSERT = (run: string) =>
  `node -e "const f=process.env.TMPDIR+'/prove-it-live/${run}/live-state/ledger.jsonl';` +
  `const c=require('fs').existsSync(f)?require('fs').readFileSync(f,'utf8').trim().split('\\n').filter(Boolean).length:0;` +
  `console.log('ledger: '+(c===1?'PASS':'FAIL')+' — '+c+' entr'+(c===1?'y':'ies')+' for one intent')"`;

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
    'One payment lands before the process crashes. The run records the dispatch but no result. In real mode both lanes fork from that one agent history.',
  mechanism:
    'Mock: the harness, the smoke worker, a staged crash, a file-backed ledger, deterministic. Real: one Claude agent, a crash pinned to the send_payment tool, and two forks of the same crashed state.',
  allowedCausalDifference:
    'The left lane keeps no durable record and has no tool that can inspect the world. The right lane keeps the record and reconciles against it before resuming.',
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
    // ── SHARED ────────────────────────────────────────────────────────────
    // Mock stages the identical crashed state in each lane. Real runs ONE
    // agent, in this pane, and both lanes fork from where it died.
    {
      lane: 'left',
      frame: 'START',
      extract: 'contract=sha256|record:\\s+dropped',
      say: 'One payment landed. The process died before it recorded the result.',
      mockCmd: `${BOUNDARY} stage --run-id {{runid}}`,
      realCmd:
        `${CRASH} ${CLI} claude --task payment ` +
        `--run-id {{shared}} --artifact ${PREFIX_ART} --timeout 240; ` +
        `${CLI} fork --from ${PREFIX_ART} --to {{artifact}}/left --run-id {{runid}} --drop-events`,
      signals: 'prefix',
    },

    // LEFT — no durable record, and no tool that can look at the world.
    {
      lane: 'left',
      frame: 'SURPRISE',
      say: 'The confirmation is gone. This lane kept no record of having paid.',
    },
    {
      lane: 'left',
      frame: 'CONTROL',
      extract: 'sent: entry #2|payment recorded for invoice-4021',
      say: 'It goes looking for state, finds nothing that answers, and pays again.',
      mockCmd: `${LEDGER} send --to ops --amount 5 --ledger runs/{{runid}}-ledger.jsonl`,
      realCmd:
        `${CLI} claude --task payment --run-id {{runid}} ` +
        `--reuse-stage $TMPDIR/prove-it-live/{{runid}} --artifact {{artifact}}/left ` +
        `--tools read_file,write_file,run_check,send_payment --timeout 240`,
    },
    {
      lane: 'left',
      frame: 'VERDICT',
      extract: 'ledger: (PASS|FAIL)',
      say: 'One intent now produced this ledger result.',
      mockCmd: `${LEDGER} assert-count --to ops --n 1 --ledger runs/{{runid}}-ledger.jsonl || true`,
      realCmd: LEDGER_ASSERT('{{runid}}'),
    },

    // RIGHT — the same crash, with a record and an operator.
    {
      lane: 'right',
      awaits: 'prefix',
      frame: 'START',
      extract: 'contract=sha256|record:\\s+carried forward',
      say: 'The same payment, the same crash — continued from the same history.',
      mockCmd: `${BOUNDARY} stage --run-id {{runid}}`,
      realCmd: `${CLI} fork --from ${PREFIX_ART} --to {{artifact}}/right --run-id {{runid}}`,
    },
    {
      lane: 'right',
      frame: 'SURPRISE',
      extract: '"status": "needs_reconcile"|status\\s+needs_reconcile',
      say: 'The harness states what it does not know.',
      mockCmd: 'node src/loop.ts view {{runid}}',
      realCmd: `${CLI} view {{artifact}}/right`,
    },
    {
      lane: 'right',
      frame: 'CONTROL',
      extract: 'PENDING action dispatched but never recorded|RESUME REFUSED',
      say: 'A bare resume would guess. The harness refuses and reports the pending action.',
      mockCmd: 'node src/loop.ts resume {{runid}} || true',
      realCmd: `${CLI} resume {{artifact}}/right || true`,
    },
    { lane: 'right', pause: true },
    {
      lane: 'right',
      showOutput: true,
      say: 'The operator records what they saw: {{answer}}. Then the run resumes.',
      mockCmd:
        `${BOUNDARY} reconcile --run-id {{runid}} --status {{answer}} && ` +
        'grep reconciliation runs/{{runid}}/events.jsonl',
      realCmd:
        `${CLI} reconcile {{artifact}}/right --decision {{answer}} ` +
        `--note "operator inspected the world" && ${CLI} resume {{artifact}}/right`,
    },
    {
      lane: 'right',
      frame: 'VERDICT',
      extract: 'ledger: (PASS|FAIL)',
      say: 'One intent produces this ledger result.',
      mockCmd: `${LEDGER} assert-count --to ops --n 1 --ledger runs/{{runid}}-ledger.jsonl`,
      realCmd: LEDGER_ASSERT('{{runid}}'),
    },
  ],
};

export default scenario;
