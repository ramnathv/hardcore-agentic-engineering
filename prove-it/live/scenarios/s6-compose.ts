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
  'workflow slug-kit-verified — inspect → implement → verify + review → join.\n' +
  'every node closes only on a dr-gate-accepted receipt for its own contract; ' +
  'one shared budget of 6 attempts covers every node run and every retry.';

const scenario: Scenario = {
  id: 's6',
  title: 'SUMMARY-ONLY DECISION vs EVIDENCE-BOUND JOIN',
  sharedFixture:
    "the four-node workflow (inspect → implement → verify + review) run to four gate-accepted receipts in the staged copy, with the room's one chosen seam broken identically in both lanes",
  mechanism:
    "both lanes: deterministic fixtures + harness smoke worker, keyless — the room's seam choice is the only live variable; the implement node upgrades to a real worker when the tool bridge lands",
  allowedCausalDifference:
    "the right lane's completion rule reads receipts and recomputes the invariant; the left lane's reads summaries.",
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
    left: { label: 'SUMMARY-ONLY DECISION', promptDisplay: WORKFLOW_INPUT },
    right: { label: 'EVIDENCE-BOUND JOIN', promptDisplay: WORKFLOW_INPUT },
  },
  steps: [
    // SHARED — the same starting state in both lanes, then the room's seam.
    {
      lane: 'both',
      say: 'shared fixture — one four-node workflow, run to four gate-accepted receipts in this staged copy',
      cmd: `${RUNNER} run --wf-id {{runid}}`,
    },
    {
      lane: 'left',
      frame: 'START',
      say: 'the four node outcomes, as their own summaries — this frame will read nothing else',
    },
    {
      lane: 'right',
      frame: 'START',
      extract: 'gate receipts on disk',
      say: 'the same four outcomes — receipts on disk:',
      cmd: `echo "the same four outcomes — $(ls control/receipts | grep -c '\\.json$') gate receipts on disk (control/receipts/)"; ls control/receipts`,
    },
    { lane: 'both', pause: true },
    {
      lane: 'both',
      say: "the room's seam, broken in this lane's copy: {{answer}}",
      cmd: `bash ${FIX}/break-seam.sh {{runid}} '{{answer}}'`,
    },

    // LEFT — a labeled decision frame derived from the summaries; no join runs.
    {
      lane: 'left',
      frame: 'SURPRISE',
      extract: '\\d+/4 summaries read complete',
      say: 'the room broke {{answer}} — count the summaries that noticed:',
      cmd: `bash ${FIX}/node-summaries.sh {{runid}}`,
    },
    {
      lane: 'left',
      frame: 'CONTROL',
      say: 'the completion rule in force: "summaries present" — it reads no receipt and recomputes nothing',
    },
    {
      lane: 'left',
      frame: 'VERDICT',
      say: 'completion rule: summaries present — release would proceed',
    },
    {
      lane: 'left',
      say: 'labeled what it is: a decision frame derived from the summaries — nothing fake ran, and the broken seam is invisible to it',
    },

    // RIGHT — the real join over the same runs, then the promotion boundary.
    {
      lane: 'right',
      frame: 'SURPRISE',
      extract: 'join: REFUSED',
      say: 'the real join, over the same runs — five questions in force:',
      cmd: `${RUNNER} join --wf-id {{runid}} || true`,
    },
    {
      lane: 'right',
      frame: 'CONTROL',
      say: 'the completion rule in force: the evidence-bound join — receipts read, the invariant recomputed',
    },
    {
      lane: 'right',
      frame: 'VERDICT',
      extract: '"reason"',
      say: 'the refusal is durable — the join wrote its verdict to disk:',
      cmd: 'cat runs/{{runid}}/join-result.json',
    },
    {
      lane: 'right',
      say: 'the runner restores the seam — promotion must consume fresh, honest evidence',
      cmd: `bash ${FIX}/break-seam.sh {{runid}} restore`,
    },
    {
      lane: 'right',
      showOutput: true,
      say: 'from workflow context, one self-promotion attempt — read the three sentences it earns:',
      cmd: `${RUNNER} promote || true`,
    },
    {
      lane: 'right',
      showOutput: true,
      say: 'the human path — promote.sh with the owner and rollback declared before the night; read the record it writes',
      cmd: `bash ${FIX}/promote.sh {{runid}} --owner "${OWNER}" --rollback "${ROLLBACK}"`,
    },
    {
      lane: 'right',
      say: 'promotion recorded: a named human owner and a rollback path, written before anything irreversible — the human who signs is not the engineer who built the node',
    },
  ],
};

export default scenario;
