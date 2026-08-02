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
    'the same staged demo run and its crash-boundary trace, the same convenience change — resume defaults --reconcile to ok — and the same honest holdout',
  mechanism:
    'left opener: direct CLI agent — a real fresh reader beside the harness, a cold read with no gate · everything after, both lanes: harness + smoke worker on deterministic fixtures',
  allowedCausalDifference:
    "the right lane's evaluation pack contains the retained regression case; the left lane's does not.",
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
    right: { label: 'TRACE RETAINED AS A CASE', promptDisplay: CHANGE_INPUT },
  },
  steps: [
    // LEFT — the failed trace was filed away; outcomes are all that is left.
    // Real mode runs a live cold read; mock replays the capture from there on.
    {
      lane: 'left',
      frame: 'START',
      say: 'the shared fixture, and the crash trace everyone remembers — filed away; it is not in the evaluation pack',
    },
    {
      lane: 'left',
      say: 'the launcher owns staging — the demo run and its pack land in this throwaway copy',
      cmd: `bash ${FIX}/stage-pack.sh`,
    },
    {
      lane: 'left',
      captureRef: true,
      say: 'the fresh-reader test — a real Claude, cold, handed the trace and asked: why did turn 2 retry? let its uncertainty sit on screen',
      realCmd: `claude --dangerously-skip-permissions --output-format stream-json --verbose -p '${COLD_READ}'`,
    },
    {
      lane: 'left',
      say: 'the convenience change: after a crash, resume assumes the dispatched action succeeded',
      cmd: CHANGE,
    },
    {
      lane: 'left',
      frame: 'SURPRISE',
      extract: '01-honest-pass: PASS',
      say: 'the honest holdout — a case nobody aimed the change at:',
      cmd: `bash ${FIX}/run-case.sh 01-honest-pass`,
    },
    {
      lane: 'left',
      frame: 'CONTROL',
      say: 'what is left to review — outcomes only: no retained case replays this change against the trace it burned',
    },
    {
      lane: 'left',
      frame: 'VERDICT',
      say: 'outcome-only review would promote — the holdout is green, and the lying trajectory has nothing left to catch it',
    },

    // RIGHT — the same trace is a replayable case; identical in both modes.
    {
      lane: 'right',
      frame: 'START',
      extract: 'id: 03-crash-boundary',
      say: 'the same fixture — and the failed trace retained as a replayable case in the evaluation pack:',
      cmd: 'cat fixtures/eval/cases/03-crash-boundary.yaml',
    },
    {
      lane: 'right',
      say: 'the same staging, the same launcher-owned copy',
      cmd: `bash ${FIX}/stage-pack.sh`,
    },
    {
      lane: 'right',
      say: 'the same convenience change, character for character',
      cmd: CHANGE,
    },
    {
      lane: 'right',
      frame: 'SURPRISE',
      extract: '01-honest-pass: PASS',
      say: 'the same honest holdout — green here too; the divergence is not where the room predicted it:',
      cmd: `bash ${FIX}/run-case.sh 01-honest-pass`,
    },
    {
      lane: 'right',
      frame: 'CONTROL',
      extract: 'FAIL — phantom reconciliation',
      say: 'the retained case replays against the changed harness — read the actor field:',
      cmd: `bash ${FIX}/run-case.sh 03-crash-boundary || true`,
    },
    { lane: 'right', pause: true },
    {
      lane: 'right',
      frame: 'VERDICT',
      say: 'decision: {{answer}} — signed into the artifact; same change, same green holdout, and the only thing that told the truth was the case somebody kept',
    },
  ],
};

export default scenario;
