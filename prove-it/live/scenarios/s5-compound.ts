// S5 · Compound — does a retained trace change a later decision? Declaration
// only; the runner owns every mechanic. One real element, honestly placed: the
// fresh-reader opens the left lane — a real Claude, cold, handed the staged
// demo trace — and everything after it is deterministic in both lanes, so the
// crash, the change and both case runs land the same way every time. The lane
// mechanics live in the S5 session fixtures (stage-pack.sh, run-case.sh), the
// established idiom; nothing under src/ or control/ changes for this scenario.
import type { Scenario } from '../scenario.ts';

const FIX = 'sessions/s5-operate-improve/fixtures';

// The convenience change, verbatim from the session page (portable -i.bak):
// after a crash, resume assumes the dispatched action succeeded.
const CHANGE =
  `sed -i.bak "s/const rec = opt('--reconcile');/const rec = opt('--reconcile') ?? 'ok';/" src/loop.ts` +
  ` && rm -f src/loop.ts.bak && grep -n "reconcile') ??" src/loop.ts`;

// The fresh-reader brief: the trace, the one question, and nothing else.
const COLD_READ =
  'Read runs/demo/events.jsonl. You have no other context about this system — you are cold. ' +
  'Why did turn 2 retry? Answer from the trace alone in a few sentences, ' +
  'then name one thing the trace cannot tell you.';

// The right lane evaluates a change, not a prompt — this is its exact input.
const CHANGE_INPUT =
  'change under review: after a crash, resume assumes the dispatched action ' +
  "succeeded (--reconcile defaults to 'ok').\n" +
  'evaluation pack: fixtures/eval/cases — 01-honest-pass (the holdout) and ' +
  '03-crash-boundary (the retained trace).';

const scenario: Scenario = {
  id: 's5',
  title: 'TRACE FILED vs TRACE RETAINED AS A CASE',
  sharedFixture:
    'Both lanes use the same trace, convenience change, and honest holdout.',
  mechanism:
    'The left lane starts with a live cold read. Both lanes then use deterministic fixtures inside the harness.',
  allowedCausalDifference:
    'The left evaluation pack omits the retained case. The right evaluation pack includes it.',
  pause: {
    question: 'Target red, holdout green. Promote, reject or revise?',
    kind: 'menu',
    options: ['promote', 'reject', 'revise'],
    default: 'reject',
  },
  evidenceNote:
    "left: a cold reader's answer, then a green holdout with nothing behind it — promotion reads supportable · right: the same green holdout, the retained case red on a phantom operator event, and the room's signed decision",
  artifactNote:
    'the artifact records which case caught the lie and what the room decided — it proves nothing about the next change; retaining the right case from your own history is Project 3.',
  expectedVerdicts: {
    left: 'outcome-only review would promote',
    right: 'decision: (promote|reject|revise)',
  },
  lanes: {
    left: {
      label: 'TRACE FILED',
      promptDisplay: COLD_READ,
      capture: {
        path: 'live/captures/s5-left.txt',
        provenance:
          'recorded 2026-08-01 from one real left-lane run (claude CLI fresh reader, then the deterministic core, real mode); local paths sanitized',
      },
    },
    right: { label: 'TRACE RETAINED AS A CASE', promptDisplay: CHANGE_INPUT, inputLabel: 'CHANGE' },
  },
  steps: [
    // LEFT — the failed trace was filed away; outcomes are all that is left.
    // Real mode runs a live cold read; mock replays the capture from there on.
    {
      lane: 'left',
      frame: 'START',
      say: 'The crash trace exists, but the evaluation pack does not contain it.',
    },
    {
      lane: 'left',
      say: 'The launcher stages the demo run and evaluation pack.',
      cmd: `bash ${FIX}/stage-pack.sh`,
    },
    {
      lane: 'left',
      captureRef: true,
      say: 'A fresh Claude reader receives only the trace. It explains turn 2 and names one uncertainty.',
      realCmd: `claude --dangerously-skip-permissions --output-format stream-json --verbose -p '${COLD_READ}'`,
    },
    {
      lane: 'left',
      say: 'The change makes resume assume that the dispatched action succeeded.',
      cmd: CHANGE,
    },
    {
      lane: 'left',
      frame: 'SURPRISE',
      extract: '01-honest-pass: PASS',
      say: 'The unchanged holdout remains green.',
      cmd: `bash ${FIX}/run-case.sh 01-honest-pass`,
    },
    {
      lane: 'left',
      frame: 'CONTROL',
      say: 'No retained case tests the change against the failed trace.',
    },
    {
      lane: 'left',
      frame: 'VERDICT',
      say: 'The outcome-only review would promote. The holdout is green, and no retained case exposes the false history.',
    },

    // RIGHT — the same trace is a replayable case; identical in both modes.
    {
      lane: 'right',
      frame: 'START',
      extract: 'id: 03-crash-boundary',
      say: 'The evaluation pack retains the failed trace as a replayable case.',
      cmd: 'cat fixtures/eval/cases/03-crash-boundary.yaml',
    },
    {
      lane: 'right',
      say: 'The launcher stages the same demo run and evaluation pack.',
      cmd: `bash ${FIX}/stage-pack.sh`,
    },
    {
      lane: 'right',
      say: 'This lane applies the same change.',
      cmd: CHANGE,
    },
    {
      lane: 'right',
      frame: 'SURPRISE',
      extract: '01-honest-pass: PASS',
      say: 'The unchanged holdout remains green here.',
      cmd: `bash ${FIX}/run-case.sh 01-honest-pass`,
    },
    {
      lane: 'right',
      frame: 'CONTROL',
      extract: 'FAIL — phantom reconciliation',
      say: 'The retained case reads the actor field and exposes the false history.',
      cmd: `bash ${FIX}/run-case.sh 03-crash-boundary || true`,
    },
    { lane: 'right', pause: true },
    {
      lane: 'right',
      frame: 'VERDICT',
      say: 'Room decision: {{answer}}. The retained case caught the false history.',
    },
  ],
};

export default scenario;
