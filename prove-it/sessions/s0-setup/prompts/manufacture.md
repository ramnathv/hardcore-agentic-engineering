# Session 0 — manufacture prompts

Each prompt is a goal + rider pair you paste into your own agent to
manufacture a Session 0 artifact yourself, into
`sessions/s0-setup/student/`, then diff against the supplied version. Where
they differ, decide which is right and write one sentence in
`FIELD-NOTES.md`.

---

## Prompt 1 — the repo-readiness probe

Builds your own readiness probe without reading the supplied one first;
done when the three checks in its "Done when" pass.

### Goal (paste first)

Build `sessions/s0-setup/student/readiness.sh`: a bash probe that reports,
with honest labels, whether THIS machine can run the prove-it Session 0
tasks. Every label must come from an actual attempt (run the command, touch
the file), never from reading configuration. Required rows print `READY` or
`BLOCKED`; optional rows print `PRESENT` or `ABSENT`; facts print `INFO`.
Exit 0 only when every required row is READY. Bounded run: propose the row
list first, wait for my approval, then write the one file.

### Rider

**Context.** This repo is `prove-it`, the course harness. Two authority
areas: `control/` is host-owned (never write there), `working/` is the
worker's task dir. Your write target tonight is neither — it is
`sessions/s0-setup/student/`, a student scratch area. The harness runs
TypeScript directly via `node <file>.ts` and needs
Node >= 22.18; the smoke provider is keyless; `claude`/`codex` CLIs are
optional throughout the course.

**Live evidence.** `bash sessions/s0-setup/fixtures/readiness.sh` is the
supplied version — do NOT read it before writing yours (that is the
exercise); you may read it after your check passes, for the diff.
`node --version` and `bash scripts/green-check.sh` work today on this
machine.

**Focus files.** `README.md` (quickstart + layout), `package.json`
(engines field), `scripts/green-check.sh` (what Session 0 actually runs —
your rows must cover its preconditions).

**Deliverable (3 items max).**
1. `sessions/s0-setup/student/readiness.sh`, executable, < 100 lines.
2. Required rows: node present and >= 22.18; running a `.ts` file
   accepted; starter files present (gate, key, both contracts, named check,
   loop); `runs/` writable.
3. Optional rows: git, claude CLI, codex CLI — ABSENT stated loudly, never
   blocking. One INFO row stating that no OS sandbox is wired in the
   starter and pointing at `scripts/probe.sh`.

**Fences.** Write only inside `sessions/s0-setup/student/`. Do not modify
`src/`, `control/`, `scripts/`, `working/`, or the supplied fixtures. No
dependencies, no network. Never print a capability claim you did not
attempt in this same script run.

**Stop-when.** A required-row test cannot be made an actual attempt (you
find yourself parsing a config file instead of trying the thing) — stop and
say so. Or the row list needs a row I did not approve.

**Done when** all three of these pass from the prove-it root:

```sh
bash sessions/s0-setup/student/readiness.sh; test $? -eq 0
env PATH=/nonexistent /bin/bash sessions/s0-setup/student/readiness.sh; test $? -ne 0
bash sessions/s0-setup/student/readiness.sh | grep -c "READY\|BLOCKED\|PRESENT\|ABSENT\|INFO"   # >= 8 labeled rows
```

Then diff against the supplied probe:
`diff <(bash sessions/s0-setup/student/readiness.sh) <(bash sessions/s0-setup/fixtures/readiness.sh)`.

---

## Prompt 2 — the setup evidence capture

Builds a script that captures your Session 0 proof commands and their real
output into one dossier file; done when the five checks in its "Done when"
pass and the checkout is left red.

### Goal (paste first)

Build `sessions/s0-setup/student/capture-evidence.sh`: one script that runs
the Session 0 proof commands in order and appends their real output to
`sessions/s0-setup/student/s0-evidence.txt`, each block preceded by the
exact command line and a timestamp. The file is my Session 0 dossier entry:
a second person must be able to replay any block by copying its command
line. Bounded run: list the commands you will capture, wait for approval,
then write the one script.

### Rider

**Context.** Course rule: evidence is retained output plus the command that
produced it, never a narrative summary. The four setup tasks are in
`sessions/s0-setup/README.md`. The capture must include at least: the
failing check (exit 1 — capture it WITHOUT letting it abort the script),
the smoke run, `cat runs/<id>/events.jsonl`, the RunView, `dr-gate check`,
the receipt JSON, `complete`, and the probe.

**Live evidence.** `bash scripts/green-check.sh` prints
`green check: 8 passed, 0 failed.` on this machine today. A smoke run ends
with `status=needs_evidence — the worker's "done" is an opinion.`

**Focus files.** `README.md` quickstart (the exact five commands),
`scripts/green-check.sh` (how the core handles expected-failure exit codes
without `|| true`-style suppression — mirror its honesty: record the exit
code, never mask it).

**Deliverable (3 items max).**
1. `sessions/s0-setup/student/capture-evidence.sh`, executable, bash,
   `set -uo pipefail`, fresh `--run-id s0-evidence-$$` per invocation.
2. `s0-evidence.txt` blocks in the form: `## $ <command>` / `exit=<code>` /
   verbatim output.
3. A final block that resets the checkout to the honest red state
   (`cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs`)
   and proves it by re-running the failing check.

**Fences.** Write only inside `sessions/s0-setup/student/`. Do not edit
`working/test/`, `control/`, or the contract. Do not suppress any exit code
— record it. No network.

**Stop-when.** Any captured command's output contradicts the expected shape
in the README (e.g. the gate refuses a green candidate) — stop and show me
the block instead of working around it.

**Done when** these pass from the prove-it root:

```sh
bash sessions/s0-setup/student/capture-evidence.sh
grep -q 'status=needs_evidence' sessions/s0-setup/student/s0-evidence.txt
grep -q 'dr-gate: ACCEPTED' sessions/s0-setup/student/s0-evidence.txt
grep -q 'UNSUPPORTED IS NOT CONTAINED' sessions/s0-setup/student/s0-evidence.txt
node --test working/test/slugify.test.mjs; test $? -ne 0   # checkout left red
```

---

## Prompt 3 — your real-repo task card

Drafts your task card (Session 0, task 3) from read-only recon of your own
repository; done when the three checks in its "Done when" pass and you have
watched the card's check command fail.

### Goal (paste first)

Read-only reconnaissance of MY repository (path below), then draft
`your-task-card.md` following the template's fields
exactly: one candidate task whose result is small enough to verify, with a
verbatim check command that fails today. Do not edit anything in my
repository. Propose three candidate tasks first with one-line verifiability
judgments; wait for me to pick one; then write the card.

### Rider

**Context.** Repo: `<ABSOLUTE PATH TO YOUR REPO>`. This card is the Session
0 nomination (Session 0, task 3): the task travels with me for six sessions
and one fully gated run, so blast radius and reversibility matter more than
ambition. A result is a behavior, not an activity: "X behaves like Y",
never "investigate X".

**Live evidence.** Fill these in before pasting — the agent must not guess:
the repo's test command is `<e.g. npm test / pytest>`; it currently exits
`<0 or nonzero>`; the area I care about is `<one sentence>`.

**Focus files.** `sessions/s0-setup/fixtures/real-repo-task-card.md` (the
template — every field, same order). In my repo: the test directory and
CI config first; source only as needed to judge verifiability.

**Deliverable (3 items max).**
1. Three candidate tasks, each with: the observable result, the exact check
   command, and today's expected exit status — presented for my choice.
2. After my choice: `your-task-card.md`, every
   template field filled, check command pasted verbatim.
3. One sentence of residual risk: what the chosen check does NOT prove.

**Fences.** Read-only in my repository — no edits, no branch, no installs,
no network. Write only the one card file,
`your-task-card.md` at the prove-it root. Redact anything that looks like a secret or a
customer identifier; use the alias form the template allows.

**Stop-when.** No candidate task has a runnable check (that is a finding,
not a failure — say so and stop). Or the check command would mutate state
(deploys, migrations): disqualify it and say why.

**Done when** these pass from the prove-it root:

```sh
test "$(wc -m < your-task-card.md)" -le 2000
grep -qc '^' your-task-card.md   # exists, non-empty
grep -q 'exit' your-task-card.md # expected exit status stated
```

…and the human check that no grep can do: you can run the card's check
command in your repo right now and it fails. Run it. Paste the failure into
the card.
