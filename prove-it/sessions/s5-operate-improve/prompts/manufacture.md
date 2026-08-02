# S5 manufacture prompts — build the M9 and M10 artifacts with your own agent

Paste, do not compose: give your agent each Goal + Rider pair verbatim, from
your prove-it copy's root. Every pair ends with a Done when naming the
executable check. Run it yourself; the agent's claim that it passed is an
opinion.

---

## Prompt 1 — the M9 hand-off pack for one of your runs

### Goal

Produce a memoryless hand-off for run `<RUN-ID>` (pick a real run from your
`runs/` that has a receipt or a recorded refusal). Create
`runs/<RUN-ID>/handoff/` containing `handoff.md`, `AS-BUILT.md` and
`incident.md`, filled from the run's own evidence. Done is decided by
`handoff-check.sh` plus a human fresh-reader test — not by your report.

### Rider

**Context.** This repo is prove-it. `control/` is host-owned: never write
there. The hand-off is an INDEX of evidence for a reader with no memory of
the run — it links, it does not retell. The transcript
(`runs/<RUN-ID>/events.jsonl`) stays where it is; it is the audit archive,
not the hand-off.

**Live evidence.** `runs/<RUN-ID>/run.json` holds run_id, contract sha,
starting candidate tree. `node src/loop.ts view
<RUN-ID> --full` holds status and budgets (budgets left the default view). `control/receipts/<RUN-ID>.json` exists
iff the gate accepted. `runs/<RUN-ID>/events.jsonl` holds every decision and
failure with event ids. Read all four before writing anything.

**Focus files.** Templates to copy and fill:
`sessions/s5-operate-improve/fixtures/templates/handoff.md`, `AS-BUILT.md`,
`incident.md`. Check:
`sessions/s5-operate-improve/fixtures/checks/handoff-check.sh`.

**Deliverable (3 items).**
1. `runs/<RUN-ID>/handoff/handoff.md` — every yaml key filled from the
   evidence above; each `Dead ends` entry cites event ids;
   `human_decision: PENDING` and `decided_by: PENDING`.
2. `runs/<RUN-ID>/handoff/AS-BUILT.md` — stamped `Stamp: <today>
   commit <sha or candidate tree>`; every claim in Recheck commands is a
   command you actually ran during this task and its exit code was 0.
3. `runs/<RUN-ID>/handoff/incident.md` — the run's most instructive failure
   (a red check, a refusal, a crash), with the event-id slice and at least
   one rejected hypothesis backed by a cited observation. If you tested only
   one hypothesis, say so — do not invent a second.

**Fences.** No writes outside `runs/<RUN-ID>/handoff/`. Do not edit the
trace, the templates, or anything under `control/` or
`sessions/`. Do not summarize the transcript into prose sections — link with
event ids. Do not fill `human_decision` or `decided_by`.

**Stop-when.** The run has no failure to write an incident about (stop and
say so — pick a different run with me). Any required evidence file is
missing. You are about to write a claim you cannot cite.

**Done when** `bash
sessions/s5-operate-improve/fixtures/checks/handoff-check.sh
runs/<RUN-ID>/handoff` exits 0. (Second, human half: a fresh reader —
agent or human — passes the fresh-reader test against it. No script proves
that.)

---

## Prompt 2 — the hand-off generator (`src/handoff.ts`)

> **Routing:** Engineer-track (it builds a TypeScript CLI); if that is not
> your seat, skip to Prompt 3.

### Goal

Write `src/handoff.ts`: a zero-dependency CLI that drafts
`runs/<id>/handoff/handoff.md` from a run's own artifacts, so future M9
hand-offs start from evidence instead of a blank page. `node
src/handoff.ts <run-id>` is the whole interface.
Done is decided by `handoff-check.sh --manifest-only` on its output.

### Rider

**Context.** prove-it, zero runtime npm dependencies, Node >= 22.18,
erasable-syntax TypeScript run directly by Node (match the
style of `src/loop.ts`; import shared helpers from `src/root.ts`, e.g.
`ROOT`). A generator may summarize but must link to the original trace and
preserve required fields; it must never invent what it cannot read.

**Live evidence.** Inputs available per run: `runs/<id>/run.json`
(manifest), `runs/<id>/events.jsonl` (append-only trace — parse with the
reducer: `import { readEvents } from './events.ts'` and `reduce` from
`./runview.ts`), `control/receipts/<id>.json` (may not exist — that is
data, not an error). The required output keys are exactly the yaml keys in
`sessions/s5-operate-improve/fixtures/templates/handoff.md`.

**Focus files.** Read first: `src/loop.ts` (CLI conventions, `runDirOf`),
`src/runview.ts` (status, budgets, pending), `src/events.ts` (readEvents),
`sessions/s5-operate-improve/fixtures/templates/handoff.md` (output shape),
`sessions/s5-operate-improve/fixtures/checks/handoff-check.sh` (the check —
its greps ARE the spec for key names).

**Deliverable (3 items).**
1. `src/handoff.ts` — reads the three inputs, writes
   `runs/<id>/handoff/handoff.md` with every template yaml key present:
   populated where evidence exists, `PENDING` where only a human may decide
   (`human_decision`, `decided_by`), and the literal word `unknown` where
   evidence is absent (e.g. no goal_ref recorded) — never a guess.
2. A `## Dead ends — do not retry` section generated from the trace: one
   entry per `tool.result` with `status: failed|refused|in_doubt`, citing
   event ids; the section header line must survive even when empty.
3. Refusal to overwrite: if `handoff.md` already exists, print a one-line
   message and exit 1 (a hand-off a human edited outranks a fresh draft).

**Fences.** New file `src/handoff.ts` only — do not modify existing `src/`
files, tests, `control/`, or `sessions/`. No npm installs. Keep it under
~120 lines; if you need more, stop and propose a cut. `trace:` must point
at the real `runs/<id>/events.jsonl` path.

**Stop-when.** You need a field the trace cannot supply and `unknown` feels
wrong. The check's required keys conflict with the template. You are
tempted to auto-write `AS-BUILT.md` or `incident.md` — those are human
artifacts; generating them is out of scope by design.

**Done when** on a fresh smoke run:
```sh
node src/loop.ts run --provider smoke --run-id gen-test
node src/handoff.ts gen-test
bash sessions/s5-operate-improve/fixtures/checks/handoff-check.sh --manifest-only runs/gen-test/handoff
```
exits 0, and a second `node src/handoff.ts
gen-test` exits 1 without changing the file.

---

## Prompt 3 — regression case 06 from a failed trace

### Goal

Promote one failed run into `fixtures/eval/cases/06-<slug>.yaml` without
deleting or editing the failed evidence. Use my own failed trace at
`runs/<FAILED-RUN-ID>/` if I name one; otherwise use the supplied fallback
`sessions/s5-operate-improve/fixtures/failed-trace/`. Done is decided by
`eval-case-check.sh` on the whole pack.

### Rider

**Context.** prove-it M10. A regression case pins behavior we must not
lose — most cases pin *refusals*. The failed trace is raw material and must
survive unmodified: the case points at it via `source_trace`. Cases are
append-only history: never edit cases 01–05 to make room for 06.

**Live evidence.** Read the five supplied cases in `fixtures/eval/cases/`
first — shape, tone, grader wording. Read the failed trace end to end and
find: the first failing state (event id), what the harness/gate did about
it, and the exact refusal or failure line (for the fallback trace, the
gate's line is quoted in
`sessions/s5-operate-improve/fixtures/failed-trace/NOTE.md`).

**Focus files.**
`sessions/s5-operate-improve/fixtures/templates/eval-case.template.yaml`
(start here), `fixtures/eval/cases/*.yaml` (the house style),
`sessions/s5-operate-improve/fixtures/checks/eval-case-check.sh` (the
check).

**Deliverable (3 items).**
1. `fixtures/eval/cases/06-<slug>.yaml` — id matches filename; situation
   reproducible by a stranger; `source_trace` pointing at the preserved
   trace; expected outcome quoting the decisive part of the actual
   refusal/failure; exactly one trajectory constraint (the one that made
   the original failure bad).
2. A `grader:` line naming deterministic, model-based or human-adjudicated
   AND the concrete mechanism (exit code, output match, or who
   adjudicates).
3. One sentence appended to `FIELD-NOTES.md` under S5: the failure class
   name and the case path. Nothing else in that file changes.

**Fences.** Do not modify, move or "clean up" the failed trace. Do not edit
cases 01–05 or anything under `control/` or `sessions/`. One case only —
if the trace suggests two failure classes, name the second in the
FIELD-NOTES sentence instead of writing case 07.

**Stop-when.** The trace shows no clear failing state. The expected outcome
you are writing describes what the CURRENT harness does but you believe it
is wrong (that is a finding, not a case — stop and tell me). The
trajectory constraint needs more than one rule.

**Done when** `bash
sessions/s5-operate-improve/fixtures/checks/eval-case-check.sh
fixtures/eval/cases` exits 0 (pack of >= 6, ids unique, source_trace
exists).

---

## Prompt 4 — before/after table for one harness change

### Goal

Run the improvement loop once, end to end, in a throwaway copy: baseline
the target case, apply EXACTLY the one change I name below, rerun target
plus one holdout, and record `runs/before-after-<slug>.md`. The change is
`<ONE CHANGE — file, line, before → after>`; the target case is
`fixtures/eval/cases/<NN-target>.yaml`; the holdout is
`fixtures/eval/cases/<MM-holdout>.yaml`. Done is decided by
`before-after-check.sh` — and the decision line is mine, not yours.

### Rider

**Context.** prove-it M10. One change at a time or attribution is
guesswork. Baselines are recorded BEFORE the change or they are stories.
Work in a throwaway copy so the pristine harness survives:
`T="$(mktemp -d)"; cp -R "$(pwd)" "$T/prove-it"` — make all edits and runs
inside `$T/prove-it`, and write the final table back to
`runs/before-after-<slug>.md` in MY copy.

**Live evidence.** Each case file names its situation and deterministic
grader — the rerun commands come from the case, not from imagination (e.g.
case 03: `PROVE_IT_CRASH_AT_TOOL=3 ... run`, then a blind `resume`, grade
on exit code and pending output; case 01: full run → gate check →
complete, grade on exit codes).

**Focus files.**
`sessions/s5-operate-improve/fixtures/templates/before-after.md` (copy,
fill), the two case yamls, the file named in the change,
`sessions/s5-operate-improve/fixtures/checks/before-after-check.sh`.

**Deliverable (3 items).**
1. `runs/before-after-<slug>.md` — hypothesis written before any rerun;
   baseline and after cells filled from observed exit codes/output, target
   and holdout both; every rerun command recorded verbatim in the fenced
   block.
2. Preserved evidence: the baseline and after run directories copied from
   the throwaway into `runs/evidence-<slug>/` (both, even the ugly one).
3. `Decision: PENDING` — wait: the check requires promote|reject|revise, so
   write your PROPOSED decision on the Decision line, and on the
   `Decided by:` line write my name only after I have said the word in the
   session; until then leave `Decided by: PENDING` and report the check
   fails on exactly that one line. That failure is correct behavior — a
   table no human has signed SHOULD fail its check.

**Fences.** No edits in my copy except the two paths in the deliverable.
The one change happens only in the throwaway. Never write `control/`
anywhere. Do not run the holdout with the change tuned to it — the holdout
commands must be identical baseline and after.

**Stop-when.** The named change does not apply cleanly. The holdout result
changes (that is a bigger finding — stop and show me). Any rerun needs a
network or a key.

**Done when** after I fill `Decided by:` with my name, `bash
sessions/s5-operate-improve/fixtures/checks/before-after-check.sh
runs/before-after-<slug>.md` exits 0.

---

## After manufacturing anything

Run the named check yourself and spot-check two event ids against the trace
your agent cites. Then record in `FIELD-NOTES.md`: the artifact path, the
check that proves it, and what it still does not prove. The Compound row of
`PROOF.md` takes one link when this becomes your Project 3 evidence.
