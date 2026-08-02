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
  'done/contract.yaml — fixed before the run opens, sha-pinned in the manifest:\n' +
  'outcome: working/src/slugify.mjs turns arbitrary titles into url-safe slugs and the named check passes\n' +
  'check: node --test working/test/slugify.test.mjs (expect exit 0)';

const scenario: Scenario = {
  id: 's2',
  title: 'EPHEMERAL CORRECTION vs DURABLE RUN EVENT',
  sharedFixture:
    'the slugify task under the same thin premise: robust, production-ready, "everything a real CMS would throw at it"',
  mechanism:
    'left: direct CLI agent, a real worker beside the harness · right: harness + smoke worker, the real control plane',
  allowedCausalDifference:
    "the right lane records the interruption as a durable run event; the left lane's correction exists only in a dead conversation.",
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
    right: { label: 'DURABLE RUN EVENT', promptDisplay: CONTRACT_INPUT },
  },
  steps: [
    // LEFT — real mode is two fresh `claude -p` calls; mock replays the capture.
    { lane: 'left', frame: 'START', say: 'the thin brief above opens both runs — nothing else reaches the worker' },
    {
      lane: 'left',
      say: 'baseline committed — the diffstat ahead measures only what the worker does',
      realCmd: `git init -q && git add -A && ${COMMIT} -m baseline`,
    },
    {
      lane: 'left',
      captureRef: true,
      say: 'run 1 — a fresh claude process, the thin brief, nothing else',
      realCmd: `claude --dangerously-skip-permissions --output-format stream-json --verbose -p '${BRIEF}'`,
    },
    {
      lane: 'left',
      frame: 'SURPRISE',
      extract: '\\d+ files? changed',
      say: 'what the thin premise bought:',
      realCmd: 'git add -A && git diff --cached --stat',
    },
    {
      lane: 'left',
      frame: 'CONTROL',
      say: `operator, to the dying conversation: "that premise is wrong: ${FACT}" — and nothing durable records it`,
    },
    {
      lane: 'left',
      say: 'candidate reset to the stub — same starting state for run 2',
      realCmd: `${COMMIT} -m run-1 && cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs && git add -A && ${COMMIT} -m reset`,
    },
    {
      lane: 'left',
      captureRef: true,
      say: 'run 2 — a second fresh process, the same thin brief plus nothing else',
      realCmd: `claude --dangerously-skip-permissions --output-format stream-json --verbose -p '${BRIEF}'`,
    },
    {
      lane: 'left',
      frame: 'VERDICT',
      extract: '\\d+ files? changed',
      say: 'the fresh process repeats the premise:',
      realCmd: 'git add -A && git diff --cached --stat',
    },

    // RIGHT — all mechanism; identical in both modes, keyless.
    {
      lane: 'right',
      showOutput: true,
      frame: 'START',
      extract: 'contract=sha256',
      say: 'same task, through the harness — the contract is fixed before the run',
      cmd: 'node src/loop.ts run --provider smoke --run-id {{runid}} --interrupt-after 2',
    },
    {
      lane: 'right',
      frame: 'SURPRISE',
      extract: '"status"',
      say: 'a run with a state and no process:',
      cmd: 'node src/loop.ts view {{runid}}',
    },
    { lane: 'right', pause: true },
    {
      lane: 'right',
      showOutput: true,
      say: 'classification check — the frozen outcome did not change; only the route to it changed',
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
      say: "resume appends run.resumed and continues — it does not replay (the room classified it as {{answer}})",
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
      say: 'the worked log, hand-written, shown as the exhibit it is — a live plan rejection is the M4 build',
      showOutput: true,
      cmd: 'bash sessions/s2-brief-steer/fixtures/make-steering-run.sh >/dev/null && grep plan.rejected runs/fx-steering/events.jsonl || true',
    },
  ],
};

export default scenario;
