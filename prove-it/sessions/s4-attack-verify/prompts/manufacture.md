# S4 manufacture prompts — build this session's components with your own agent

Three goal + rider pairs. Paste the goal, then the rider, into a fresh agent
session in your prove-it clone; output lands in
`sessions/s4-attack-verify/mine/`. Reference implementations sit in
`sessions/s4-attack-verify/fixtures/`: build first, compare after.

---

## Artifact 1 — the attack-lab stager

Builds `mine/stage-attack-lab.sh`, the throwaway lab copy for the M7 pair
attack; its Done-when strings decide done.

### Goal

**Outcome.** A script `sessions/s4-attack-verify/mine/stage-attack-lab.sh`
that stages a throwaway copy of this harness for the M7 pair attack: one
honest run checked and accepted (its receipt is the target), one freshly
opened run with no receipt (the replay target). It prints the copy's path and
the exact attack commands.

**Done when** (run from the repo root):
`bash sessions/s4-attack-verify/mine/stage-attack-lab.sh` prints a path `$T`,
and against that copy (`export PROVE_IT_ROOT=$T`):
`node control/dr-gate.ts verify friday` prints
VERIFIED, and after
`cp $T/control/receipts/friday.json $T/control/receipts/monday.json`,
`… dr-gate.ts verify monday` prints
`REFUSED — receipt run mismatch: replay of run 'friday'`.

**Posture.** Bounded run; propose a plan first. Bash only, no dependencies.
The script must never touch the real checkout: copy `control working done
fixtures` into `mktemp -d`, target everything via `PROVE_IT_ROOT`.

**Constraints.** No auto-delete of the staged copy (the lab needs it to
survive); no network; keyless smoke provider only.

**Stop and ask.** Any need to modify anything outside
`sessions/s4-attack-verify/mine/`; any gate output that does not match the
Done-when strings.

**Budget.** 3 attempts, 20 minutes.

### Rider

**Context.** `prove-it` completes runs only through the host-owned gate.
`PROVE_IT_ROOT` redirects every `src/loop.ts` and `control/dr-gate.ts` command
to another root — that is how all supplied drill scripts stage throwaway
copies (see `scripts/tamper-table.sh` for the pattern: mktemp, `cp -R control
working done fixtures`, `mkdir runs`, export).

**Live evidence.** From the pristine starter, these commands were run and
produced exactly this: `node src/loop.ts run
--provider smoke --run-id friday` ends
`run=friday status=needs_evidence — the worker's "done" is an opinion.`;
`… control/dr-gate.ts check friday` prints `dr-gate: ACCEPTED — receipt at
control/receipts/friday.json`; a copied receipt under a second run id is
refused with `receipt run mismatch: replay of run 'friday'`.

**Focus files.**
- `scripts/tamper-table.sh` — the staging pattern to imitate (read-only)
- `src/loop.ts` header — CLI surface for `run`/`open` (read-only)
- `sessions/s4-attack-verify/mine/stage-attack-lab.sh` — the one file you create

**Deliverable.** (1) the script; (2) a 5-line usage comment at its top;
(3) nothing else.

**Fences.** Do not edit `scripts/`, `src/`, `control/`, or the supplied
`sessions/s4-attack-verify/fixtures/`. Do not read `control/gate.key`. Do not
delete the staged copy inside the script.

**Stop-when.** The same refusal string fails to appear twice for the same
cause; or you are tempted to silence a gate error to make staging "work".

---

## Artifact 2 — the tamper row the table lacks (M7)

Builds `mine/tamper-row-7.sh`, the moving-the-goalposts row; done when it
exits 0 with the Done-when refusal.

### Goal

**Outcome.** A script `sessions/s4-attack-verify/mine/tamper-row-7.sh` adding
the attack the six supplied rows never try: **moving the goalposts** — the
contract is edited AFTER the run was opened, then the gate is asked to check.
Same report format as the supplied table (row banner, verbatim gate line, a
`→ REFUSED` verdict), exit 0 only if the gate refuses.

**Done when:** `bash sessions/s4-attack-verify/mine/tamper-row-7.sh` exits 0
and its output contains
`REFUSED — contract hash mismatch: contract changed after the run was opened`.

**Posture.** Bounded run; plan first; throwaway-copy staging exactly like
Artifact 1 (or reuse your stager).

**Constraints.** The row must first show the HONEST state (an accepted or
checkable run), then the tamper, then the refusal — red is only meaningful
after green. If the gate ACCEPTS the tampered state, the script must exit 1
and say `BUG` loudly, exactly as the supplied table does.

**Stop and ask.** The refusal text differs from the Done-when string; you want
a second tamper in the same script (one attack per row).

**Budget.** 3 attempts, 20 minutes.

### Rider

**Context.** `runs/<id>/run.json` pins `contract_sha256` at open;
`dr-gate check` recomputes the contract hash and refuses on mismatch
(`control/dr-gate.ts`, the `contract hash mismatch` branch). The supplied
table (`scripts/tamper-table.sh`) covers forgery, suppression, deleted test,
replay, stale tree, seeded fault — but never re-edits `done/contract.yaml`
after open. M7 asks you to add a missing attack and make it red, then refused.

**Live evidence.** Verified against the starter: after an honest smoke run,
`printf '\n# relaxed after the fact\n' >> $T/done/contract.yaml` followed by
`dr-gate.ts check <id>` prints exactly
`dr-gate: REFUSED — contract hash mismatch: contract changed after the run was
opened` and exits 1.

**Focus files.**
- `scripts/tamper-table.sh` — row/verdict format to match (read-only)
- `control/dr-gate.ts` — the refusal you are targeting (read-only, 163 lines)
- `sessions/s4-attack-verify/mine/tamper-row-7.sh` — the one file you create

**Deliverable.** (1) the script; (2) a one-paragraph comment stating which of
the receipt's five bound identities this row attacks (answer: the contract
sha) ; (3) nothing else.

**Fences.** Never edit the real `done/contract.yaml` — only the staged copy's.
Do not modify the supplied table; your row stands alone so a partner can run
it against THEIR build unchanged.

**Stop-when.** The gate accepts the tampered contract (that is a finding, not
a bug in your script — stop and report it verbatim); or staging diverges from
the pattern twice.

---

## Artifact 3 — the M8 adequacy kit: your fault, your stronger check

Builds your own fault plus the check that catches it; done when
`fixtures/check-adequacy.sh` passes all three states.

### Goal

**Outcome.** Two files: `sessions/s4-attack-verify/mine/my-fault.mjs` — a
slugify implementation that is GREEN under the current named check but wrong
for real inputs in a way you can name in one sentence — and
`sessions/s4-attack-verify/mine/my-test-vNext.mjs` — the current check plus
the smallest new case that catches exactly that fault.

**Done when:**
`bash sessions/s4-attack-verify/fixtures/check-adequacy.sh
sessions/s4-attack-verify/mine/my-fault.mjs
sessions/s4-attack-verify/mine/my-test-vNext.mjs` exits 0 (all three states:
current-green over fault, strengthened-red over fault, strengthened-green over
the correct solution).

**Posture.** Bounded run; plan first: state the fault in one sentence BEFORE
writing code ("digits are dropped", "unicode is mangled", "empty input
returns '-'"). The fault must matter to the brief in `working/BRIEF.md`
("arbitrary titles"), not be an invented requirement.

**Constraints.** The fault may not duplicate the two supplied ones
(truncation — `control/checks/fixtures/solution-faulty.mjs`; digit-drop —
`sessions/s4-attack-verify/fixtures/solution-faulty-v2.mjs`). The new test
must extend the current `working/test/slugify.test.mjs` cases, not replace
them — regressions stay covered.

**Stop and ask.** You cannot find a fault the current check misses (look at
what the four test inputs never exercise); the adequacy checker's state 3
fails (your new case tests a property the correct solution doesn't have —
that is a spec question, not a code question).

**Budget.** 3 adequacy-checker attempts, 30 minutes.

### Rider

**Context.** M8: a receipt is not proof of adequacy. A check earns a version
bump only by catching a relevant wrong result. The adoption flow after your
kit passes is HOST-owned and is not part of this run: copying your test over
`working/test/slugify.test.mjs` and running `node control/checks/rehash.mjs
<new-version>` invalidates every old receipt on `check_version` — on purpose.

**Live evidence.** The supplied pair passes the checker today:
`bash sessions/s4-attack-verify/fixtures/check-adequacy.sh
sessions/s4-attack-verify/fixtures/solution-faulty-v2.mjs
sessions/s4-attack-verify/fixtures/slugify.test.v3.mjs` prints three ✅ states
and exits 0. The current check inputs are: `'Hello World'`, `'Rock & Roll'`,
`'  --Agentic   Engineering-- '` — anything
those never exercise (digits are taken; consider unicode, apostrophes,
empty/all-punctuation input, idempotence) is fault territory.

**Focus files.**
- `working/test/slugify.test.mjs` — current cases, the coverage map (read-only)
- `control/checks/fixtures/solution-correct.mjs` — the reference the checker
  uses for state 3 (read-only)
- `sessions/s4-attack-verify/mine/my-fault.mjs`,
  `sessions/s4-attack-verify/mine/my-test-vNext.mjs` — the two files you create

**Deliverable.** (1) the fault file with a header comment naming the wrong
behavior in one sentence; (2) the strengthened test; (3) a filled
`sessions/s4-attack-verify/mine/residual-risk.md` from the template in
`fixtures/residual-risk-template.md` — what your NEW check still cannot catch.

**Fences.** Do not edit `working/`, `control/`, or the supplied fixtures. Do
not run `rehash.mjs` (host action). The fault must be plausible — code a tired
engineer could ship — not `return 'hacked'`.

**Stop-when.** Two consecutive adequacy-checker failures with the same state
red; or your fault requires changing more than the one function.
