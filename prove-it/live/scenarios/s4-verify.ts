// S4 · Verify — the check-adequacy compare night. Declaration only; the runner
// owns every mechanic. Both lanes are deterministic by design, and that is
// their honesty: the same fault dies the same way every time. The session's
// one real element — the brief-A fire against a second staged lab — is the
// run-sheet's job and never enters this scenario.
import type { Scenario } from '../scenario.ts';

const SEED =
  `case '{{answer}}' in ` +
  `'long-title truncation') cp control/checks/fixtures/solution-faulty.mjs working/src/slugify.mjs ;; ` +
  `'digit drop') cp sessions/s4-attack-verify/fixtures/solution-faulty-v2.mjs working/src/slugify.mjs ;; ` +
  `*) echo 'unknown fault choice: {{answer}}' >&2; exit 2 ;; esac`;

// The screen confirms the same product-source hash in both lanes before
// anything runs — the START frames must be identical.
const HASH = 'shasum -a 256 working/src/slugify.mjs';

// tee keeps the three adequacy states on disk inside the staged copy, so
// CONTROL and VERDICT extract from the one run instead of re-running it.
const ADEQUACY =
  'bash sessions/s4-attack-verify/fixtures/check-adequacy.sh ' +
  'working/src/slugify.mjs sessions/s4-attack-verify/fixtures/slugify.test.v3.mjs ' +
  '2>&1 | tee s4-adequacy.txt';

// No worker runs in this scenario — the room-seeded faulty candidate stands in
// for one. This is the brief every green receipt in the compare certifies.
const BRIEF_INPUT =
  'the brief the receipts certify: working/src/slugify.mjs turns arbitrary titles ' +
  'into url-safe slugs and the named check passes (node --test working/test/slugify.test.mjs).\n' +
  'no worker runs in either lane — the room-seeded faulty candidate stands in for one.';

const scenario: Scenario = {
  id: 's4',
  title: 'WEAK CHECK vs ATTACKED CHECK',
  sharedFixture:
    'the same room-selected faulty candidate seeded into both lanes — either long-title truncation or digit drop, both invisible to check-v1',
  mechanism:
    'both lanes: seeded fixtures through the real gate and the shipped adequacy script — deterministic by design, no live model in either pane; the brief-A fire runs beside this compare, on the run-sheet, not in it',
  allowedCausalDifference:
    "the right lane's check contains the property the room chose; the left lane's does not.",
  pause: {
    question: 'Which wrong result must this check catch?',
    kind: 'menu',
    options: ['long-title truncation', 'digit drop'],
    default: 'long-title truncation',
  },
  evidenceNote:
    'left: pass 3 over a broken product, then a valid green receipt — identity holds, adequacy unknown · right: the three adequacy states — green over the fault under the current check, red under the strengthened one, green over the correct solution',
  artifactNote:
    'the artifact records which supplied property the room chose and the three adequacy states; it does not prove that the check covers any other property.',
  expectedVerdicts: {
    left: 'dr-gate: VERIFIED',
    right: 'state 3: strengthened check stays GREEN',
  },
  lanes: {
    left: { label: 'WEAK CHECK', promptDisplay: BRIEF_INPUT },
    right: { label: 'ATTACKED CHECK', promptDisplay: BRIEF_INPUT },
  },
  steps: [
    { lane: 'both', pause: true },
    // LEFT — the check held at v1, which omits the relevant case. The gate is
    // real and honest; the product is wrong; every frame is extracted output.
    {
      lane: 'left',
      say: 'the room-selected fault: {{answer}}',
      cmd: SEED,
    },
    {
      lane: 'left',
      frame: 'START',
      extract: 'working/src/slugify\\.mjs',
      say: 'same candidate hash in both lanes — the check held at v1',
      cmd: HASH,
    },
    {
      lane: 'left',
      frame: 'SURPRISE',
      extract: '# pass \\d+',
      say: 'the named check, over the broken product:',
      cmd: 'node --test working/test/slugify.test.mjs',
    },
    {
      lane: 'left',
      frame: 'CONTROL',
      extract: 'check=check-v1',
      say: 'nothing strengthened — the check stays v1, and the gate binds identities honestly over this exact tree',
      cmd: 'node src/loop.ts open --run-id {{runid}} && node control/dr-gate.ts check {{runid}}',
    },
    {
      lane: 'left',
      frame: 'VERDICT',
      extract: 'dr-gate: VERIFIED',
      say: 'a valid green receipt over a broken product — identity holds, adequacy unknown',
      cmd: 'node control/dr-gate.ts verify {{runid}}',
    },

    // RIGHT — the same candidate; only the check moves. The pause picks the
    // property; the shipped pair carries it; three states from one run.
    {
      lane: 'right',
      say: 'the same room-selected faulty candidate: {{answer}}',
      cmd: SEED,
    },
    {
      lane: 'right',
      frame: 'START',
      extract: 'working/src/slugify\\.mjs',
      say: 'same candidate hash — only the check moves in this lane',
      cmd: HASH,
    },
    {
      lane: 'right',
      say: 'the room chose {{answer}} — the supplied fault and strengthened check carry that property',
    },
    {
      lane: 'right',
      frame: 'SURPRISE',
      extract: 'state 1: current check stays GREEN',
      say: 'the adequacy run — the current check first, over the same fault:',
      cmd: ADEQUACY,
    },
    {
      lane: 'right',
      frame: 'CONTROL',
      extract: 'state 2: strengthened check goes RED',
      say: 'host-installed stronger check under a new version — the same product goes red; the fault was always there, only the check moved',
      cmd: "grep 'state 2' s4-adequacy.txt",
    },
    {
      lane: 'right',
      frame: 'VERDICT',
      extract: 'state 3: strengthened check stays GREEN',
      say: 'and green over the correct solution — the state that separates a stronger check from a paranoid one',
      cmd: "grep 'state 3' s4-adequacy.txt",
    },
  ],
};

export default scenario;
