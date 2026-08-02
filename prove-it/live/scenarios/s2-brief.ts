// S2 · Brief — the prototype compare night. Declaration only; the runner owns
// every mechanic. Scoping is binding: no `interrupt --fact`, no live plan
// rejection, nothing under src/ or control/ changes for this scenario.
import type { Scenario } from '../scenario.ts';

const BRIEF =
  'Implement slugify in working/src/slugify.mjs. Make it robust and production-ready. ' +
  'Handle everything a real CMS would throw at it.';

// The fact that kills the thin premise. It corrects the brief, not the worker.
const FACT =
  'there is no real CMS — the named check in working/test/ is the entire definition of done';

// --allow-empty: bookkeeping commits must not fail the lane if a worker run
// left the tree unchanged — the diffstat frames stay honest either way.
const COMMIT = "git -c user.name=demo -c user.email=demo@prove-it.local commit -q --allow-empty";

// What the harness lane executes instead of a prose prompt: the operator's
// contract, fixed before the run opens.
const CONTRACT_INPUT =
  'file: done/contract.yaml (fixed before the run starts and pinned in the manifest)\n' +
  'outcome: working/src/slugify.mjs turns arbitrary titles into url-safe slugs and the named check passes\n' +
  'check: node --test working/test/slugify.test.mjs (expect exit 0)';

const scenario: Scenario = {
  id: 's2',
  title: 'EPHEMERAL CORRECTION vs DURABLE RUN EVENT',
  sharedFixture:
    'Both lanes start from the same slugify task and the same thin CMS premise.',
  mechanism:
    'Left runs a direct Claude worker. Right runs the smoke worker inside the harness.',
  allowedCausalDifference:
    'The left correction dies with the conversation. The right correction becomes a durable run event.',
  pause: {
    question: 'Classify this correction: steer, or new contract?',
    kind: 'menu',
    options: ['steer', 'new-contract'],
    default: 'steer',
  },
  evidenceNote:
    'left: two diffstats repeating the same breadth across a dead correction · right: an interrupted status, an appended resume, and a receipt-verified completion',
  artifactNote:
    'the log recorded that you stopped it, not why — the fact rides in this artifact until the P3 build.',
  expectedVerdicts: {
    left: '\\d+ files? changed',
    right: 'status=completed',
  },
  lanes: {
    left: {
      label: 'EPHEMERAL CORRECTION',
      promptDisplay: BRIEF,
      capture: {
        path: 'live/captures/s2-left.txt',
        provenance:
          'recorded 2026-08-01 from one real left-lane run (claude CLI, real mode); local paths sanitized',
      },
    },
    right: { label: 'DURABLE RUN EVENT', promptDisplay: CONTRACT_INPUT, inputLabel: 'CONTRACT' },
  },
  steps: [
    // LEFT — real mode is two fresh `claude -p` calls; mock replays the capture.
    { lane: 'left', frame: 'START', say: 'The same thin brief starts both runs.' },
    {
      lane: 'left',
      say: 'The baseline records the starting state.',
      realCmd: `git init -q && git add -A && ${COMMIT} -m baseline`,
    },
    {
      lane: 'left',
      captureRef: true,
      say: 'A fresh Claude process receives only the thin brief.',
      realCmd: `claude --dangerously-skip-permissions --output-format stream-json --verbose -p '${BRIEF}'`,
    },
    {
      lane: 'left',
      frame: 'SURPRISE',
      extract: '\\d+ files? changed',
      say: 'The thin premise produces this change.',
      realCmd: 'git add -A && git diff --cached --stat',
    },
    {
      lane: 'left',
      frame: 'CONTROL',
      say: `The operator says, "${FACT}." The process ends without recording this fact.`,
    },
    {
      lane: 'left',
      say: 'The candidate returns to the original stub.',
      realCmd: `${COMMIT} -m run-1 && cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs && git add -A && ${COMMIT} -m reset`,
    },
    {
      lane: 'left',
      captureRef: true,
      say: 'A second fresh process receives the same thin brief.',
      realCmd: `claude --dangerously-skip-permissions --output-format stream-json --verbose -p '${BRIEF}'`,
    },
    {
      lane: 'left',
      frame: 'VERDICT',
      extract: '\\d+ files? changed',
      say: 'The new process repeats the original premise.',
      realCmd: 'git add -A && git diff --cached --stat',
    },

    // RIGHT — all mechanism; identical in both modes, keyless.
    {
      lane: 'right',
      showOutput: true,
      frame: 'START',
      extract: 'contract=sha256',
      say: 'The harness fixes the contract before the run starts.',
      cmd: 'node src/loop.ts run --provider smoke --run-id {{runid}} --interrupt-after 2',
    },
    {
      lane: 'right',
      frame: 'SURPRISE',
      extract: '"status"',
      say: 'The process is gone. The run state remains.',
      cmd: 'node src/loop.ts view {{runid}}',
    },
    { lane: 'right', pause: true },
    {
      lane: 'right',
      showOutput: true,
      say: 'The outcome did not change. Only the route changed.',
      cmd:
        `case '{{answer}}' in ` +
        `steer) echo 'classification: steer — correct; the outcome stayed fixed' ;; ` +
        `new-contract) echo 'classification: new-contract would move the goalposts; this correction is a steer because the outcome stayed fixed' ;; ` +
        `*) exit 2 ;; esac`,
    },
    {
      lane: 'right',
      frame: 'CONTROL',
      extract: 'status=needs_evidence',
      say: 'Resume appends run.resumed. It continues from durable state after the room chose {{answer}}.',
      cmd: 'node src/loop.ts resume {{runid}}',
    },
    { lane: 'right', cmd: 'node control/dr-gate.ts check {{runid}}' },
    {
      lane: 'right',
      frame: 'VERDICT',
      extract: 'status=completed',
      cmd: 'node src/loop.ts complete {{runid}}',
    },
    {
      lane: 'right',
      say: 'This hand-written log is an exhibit. The M4 build adds live plan rejection.',
      showOutput: true,
      cmd: 'bash sessions/s2-brief-steer/fixtures/make-steering-run.sh >/dev/null && grep plan.rejected runs/fx-steering/events.jsonl || true',
    },
  ],
};

export default scenario;
