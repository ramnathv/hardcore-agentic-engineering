// S6 · Compose — what is a fan-in permitted to trust? Declaration only; the
// runner owns every mechanic. Both lanes are deterministic and keyless: the
// nodes run the harness smoke worker or contract-only opens, and the room's
// seam choice is the only live variable. Scoping is binding: nothing under
// src/ or control/ changes for this scenario; the seam and summary mechanics
// live in the S6 session fixtures (break-seam.sh, node-summaries.sh), the
// established idiom.
import type { Scenario } from '../scenario.ts';

const FIX = 'sessions/s6-compose-defend/fixtures';
const RUNNER = `node ${FIX}/runner.ts`;

// wf-demo.sh's promotion defaults, verbatim — declared before the night;
// every run, live included, ships these, and the sheet narrates the record.
const OWNER = 'greg@specstory.com';
const ROLLBACK = 'git checkout -- working/ (restore the pre-workflow tree)';

// The input both lanes execute: the declared workflow, node contracts, and the
// one shared budget every retry spends from.
const WORKFLOW_INPUT =
  'workflow: slug-kit-verified\n' +
  'route: inspect → implement → verify + review → join\n' +
  'completion: Each node requires a dr-gate-accepted receipt for its own contract.\n' +
  'budget: Six attempts cover all node runs and retries.';

const scenario: Scenario = {
  id: 's6',
  title: 'SUMMARY-ONLY DECISION vs EVIDENCE-BOUND JOIN',
  sharedFixture:
    'Both lanes use the same four-node workflow and four accepted receipts. The room breaks the same seam in each copy.',
  mechanism:
    'Both lanes use deterministic fixtures and the harness smoke worker. The room seam is the only live variable.',
  allowedCausalDifference:
    'The left completion rule reads summaries. The right completion rule reads receipts and recomputes the invariant.',
  // The pause is lane 'both': the seam decision must reach BOTH staged copies
  // (each lane breaks the same seam). The left pane records the room's answer,
  // and the right pane reads it from the shared artifact. --ci uses the default.
  // Only wired seams are offered: rows 1 and 1b of join-attacks.sh, the
  // resume-time overspend attack, and the exercise-3b forged write (default).
  pause: {
    question: 'Which seam does the room break?',
    kind: 'menu',
    options: [
      'write-set-overlap',
      'swapped-receipt-identity',
      'stale-candidate',
      'blown-shared-budget',
    ],
    default: 'write-set-overlap',
  },
  evidenceNote:
    "left: four synthetic status claims reading complete and a decision frame that would release · right: the join's refusal naming the room's seam, its durable join-result, a structural self-promotion refusal, and a promotion record naming a human owner and a rollback path",
  artifactNote:
    'the frames establish that the parts were joined on evidence instead of summaries — they establish nothing about whether this task deserved a workflow at all.',
  expectedVerdicts: {
    left: 'release would proceed',
    right: '"reason": ".+"',
  },
  lanes: {
    left: { label: 'SUMMARY-ONLY DECISION', promptDisplay: WORKFLOW_INPUT, inputLabel: 'WORKFLOW' },
    right: { label: 'EVIDENCE-BOUND JOIN', promptDisplay: WORKFLOW_INPUT, inputLabel: 'WORKFLOW' },
  },
  steps: [
    // SHARED — the same starting state in both lanes, then the room's seam.
    {
      lane: 'both',
      say: 'The staged workflow produces four gate-accepted receipts.',
      cmd: `${RUNNER} run --wf-id {{runid}}`,
    },
    {
      lane: 'left',
      frame: 'START',
      say: 'This lane reads only the four node summaries.',
    },
    {
      lane: 'right',
      frame: 'START',
      extract: 'gate receipts on disk',
      say: 'This lane reads the four gate receipts.',
      cmd: `echo "the same four outcomes — $(ls control/receipts | grep -c '\\.json$') gate receipts on disk (control/receipts/)"; ls control/receipts`,
    },
    { lane: 'both', pause: true },
    {
      lane: 'both',
      say: 'The room breaks the same seam in both copies: {{answer}}.',
      cmd: `bash ${FIX}/break-seam.sh {{runid}} '{{answer}}'`,
    },

    // LEFT — a labeled decision frame derived from the summaries; no join runs.
    {
      lane: 'left',
      frame: 'SURPRISE',
      extract: '\\d+/4 summaries read complete',
      say: 'The room broke {{answer}}. Count the summaries that noticed.',
      cmd: `bash ${FIX}/node-summaries.sh {{runid}}`,
    },
    {
      lane: 'left',
      frame: 'CONTROL',
      say: 'The completion rule checks only that summaries exist. It reads no receipt.',
    },
    {
      lane: 'left',
      frame: 'VERDICT',
      say: 'All summaries exist. The release would proceed.',
    },
    {
      lane: 'left',
      say: 'This decision uses only summaries. The broken seam remains invisible.',
    },

    // RIGHT — the real join over the same runs, then the promotion boundary.
    {
      lane: 'right',
      frame: 'SURPRISE',
      extract: 'join: REFUSED',
      say: 'The evidence-bound join asks five questions about the same runs.',
      cmd: `${RUNNER} join --wf-id {{runid}} || true`,
    },
    {
      lane: 'right',
      frame: 'CONTROL',
      say: 'The join reads each receipt and recomputes the invariant.',
    },
    {
      lane: 'right',
      frame: 'VERDICT',
      extract: '"reason"',
      say: 'The join writes its refusal to disk.',
      cmd: 'cat runs/{{runid}}/join-result.json',
    },
    {
      lane: 'right',
      say: 'The runner restores the seam before promotion.',
      cmd: `bash ${FIX}/break-seam.sh {{runid}} restore`,
    },
    {
      lane: 'right',
      showOutput: true,
      say: 'The workflow attempts to promote itself. The runner refuses.',
      cmd: `${RUNNER} promote || true`,
    },
    {
      lane: 'right',
      showOutput: true,
      say: 'A human promotes with a named owner and rollback path.',
      cmd: `bash ${FIX}/promote.sh {{runid}} --owner "${OWNER}" --rollback "${ROLLBACK}"`,
    },
    {
      lane: 'right',
      say: 'The promotion record names a human owner and a rollback path. The signer did not build the node.',
    },
  ],
};

export default scenario;
