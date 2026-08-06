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

const CLI = 'node live/runtime/cli.ts';
const PREFIX_ART = '{{artifact}}/prefix';
const STOP_AT_WRITE = 'PROVE_IT_LIVE_INTERRUPT_AT_TOOL=write_file';

const scenario: Scenario = {
  id: 's2',
  title: 'EPHEMERAL CORRECTION vs DURABLE RUN EVENT',
  sharedFixture:
    'Both lanes start from the same slugify task and the same thin CMS premise.',
  mechanism:
    'Mock: a recorded left-lane worker and the keyless smoke worker. Real: one Claude agent, interrupted after its first successful write, and two continuations of that same interrupted run.',
  allowedCausalDifference:
    'The left correction dies with the conversation. The right correction becomes a durable run event.',
  pause: {
    question: 'Classify this correction: steer, or new contract?',
    kind: 'menu',
    options: ['steer', 'new-contract'],
    default: 'steer',
  },
  evidenceNote:
    'left: the correction said to a process that ended, and absent from what the next one is given · right: the same correction recorded as a durable event, and present in the conversation the resumed worker receives',
  artifactNote:
    'the artifact records the exact input each process was started with, so "did the correction reach the worker" is answered by the evidence rather than by the narration.',
  expectedVerdicts: {
    left: '\\d+ files? changed|steer: ABSENT',
    right: 'status=completed|steer: PRESENT',
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
    // LEFT — mock replays the recorded worker. Real runs the shared prefix in
    // this pane, then forks a lane that kept no record of the correction.
    { lane: 'left', say: 'The same thin brief starts both runs.' },
    {
      lane: 'left',
      say: 'The baseline records the starting state.',
      realCmd: `git init -q && git add -A && ${COMMIT} -m baseline`,
    },
    {
      lane: 'left',
      captureRef: true,
      // START lives here, not earlier: it is the first moment both lanes can
      // be at. The right lane cannot reach its own START until this step has
      // published the shared prefix, so a frame barrier before this point is a
      // barrier one lane can never arrive at.
      frame: 'START',
      extract: 'record:\\s+dropped|slugify',
      say: 'A worker receives only the thin brief, and is stopped after its first successful write.',
      realCmd:
        `${STOP_AT_WRITE} ${CLI} claude --task slugify ` +
        `--run-id {{shared}} --artifact ${PREFIX_ART} --timeout 240; ` +
        `${CLI} fork --from ${PREFIX_ART} --to {{artifact}}/left --run-id {{runid}} --drop-events`,
      signals: 'prefix',
    },
    {
      lane: 'left',
      frame: 'SURPRISE',
      extract: '\\d+ files? changed|durable events in this lane: \\d+',
      say: 'The thin brief produced work, and then the run stopped. This lane kept nothing.',
      realCmd:
        `git add -A && ${COMMIT} -m run-1; ` +
        `echo "durable events in this lane: $(wc -l < {{artifact}}/left/shared/events.jsonl 2>/dev/null || echo 0)"`,
    },
    {
      lane: 'left',
      frame: 'CONTROL',
      say: 'The correction is given to the process. The process then ends.',
    },
    {
      lane: 'left',
      captureRef: true,
      say: 'A fresh worker starts. It receives the original brief, because that is all there is.',
      realCmd:
        `${CLI} claude --task slugify --run-id {{runid}} ` +
        `--reuse-stage \${TMPDIR:-/tmp}/prove-it-live/{{runid}} --artifact {{artifact}}/left --timeout 240`,
    },
    {
      lane: 'left',
      frame: 'VERDICT',
      extract: '\\d+ files? changed|steer: (PRESENT|ABSENT)',
      say: 'This is what the second worker was actually given.',
      realCmd: `${CLI} audit {{artifact}}/left --expect "${FACT}"`,
    },

    // RIGHT — the same interrupted run, with the correction recorded.
    {
      lane: 'right',
      awaits: 'prefix',
      showOutput: true,
      frame: 'START',
      extract: 'contract=sha256|record:\\s+carried forward',
      say: 'The harness fixes the contract before the run starts.',
      mockCmd: 'node src/loop.ts run --provider smoke --run-id {{runid}} --interrupt-after 2',
      realCmd: `${CLI} fork --from ${PREFIX_ART} --to {{artifact}}/right --run-id {{runid}}`,
    },
    {
      lane: 'right',
      frame: 'SURPRISE',
      extract: '"status"|status\\s+interrupted',
      say: 'The process is gone. The run state remains.',
      mockCmd: 'node src/loop.ts view {{runid}}',
      realCmd: `${CLI} view {{artifact}}/right`,
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
      extract: 'status=needs_evidence|recorded a durable steer',
      say: 'The room chose {{answer}}. It is recorded as a run event, not said to a process.',
      mockCmd: 'node src/loop.ts resume {{runid}}',
      realCmd: `${CLI} steer {{artifact}}/right --text "${FACT}" && ${CLI} resume {{artifact}}/right`,
    },
    { lane: 'right', mockCmd: 'node control/dr-gate.ts check {{runid}}' },
    {
      lane: 'right',
      frame: 'VERDICT',
      extract: 'status=completed|steer: (PRESENT|ABSENT)',
      say: 'This is what the resumed worker was actually given.',
      mockCmd: 'node src/loop.ts complete {{runid}}',
      realCmd: `${CLI} audit {{artifact}}/right --expect "${FACT}"`,
    },
    {
      lane: 'right',
      say: 'This hand-written log is an exhibit. The M4 build adds live plan rejection.',
      showOutput: true,
      mockCmd: 'bash sessions/s2-brief-steer/fixtures/make-steering-run.sh >/dev/null && grep plan.rejected runs/fx-steering/events.jsonl || true',
    },
  ],
};

export default scenario;
