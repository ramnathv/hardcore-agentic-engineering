# Rider — slugify under contract (M3 worked example)

<!-- Worked example. The rider is unbounded: a fresh agent with only the
     goal, this rider and the repo must be able to begin well. -->

## Context

- This repo is `prove-it`, the course harness. Two authority areas:
  `control/` is host-owned (gate, key, contracts, receipts — you cannot write
  there and reads of the key are refused); `working/` is yours.
- The contract was fixed before this run: `done/contract.yaml`, sha pinned in
  `runs/<run-id>/run.json`. Moving the goalposts is detected and refused.
- The gate path: work → named check green → `dr-gate check <run-id>` →
  receipt → `loop complete <run-id>`. Your "done" is an opinion until then.

## Live evidence

- `node --test working/test/slugify.test.mjs` currently exits 1: the stub in
  `working/src/slugify.mjs` throws `not implemented`.
- The three named cases: lowercase+dash, `&` → `and`, collapse/trim runs of
  separators. Read the test file first; it is the ground truth.

## Focus files

- `working/src/slugify.mjs` — the only file that should change.
- `working/test/slugify.test.mjs` — read-only; the check target.
- `working/BRIEF.md` — the task in prose.

## Deliverable

1. A plan (one short paragraph) proposed before edits.
2. `working/src/slugify.mjs` implementing `slugify(title)` passing the named
   check.
3. One sentence naming what the check does NOT cover (e.g. unicode, length
   limits) — residual risk is part of the deliverable.

## Fences

- Do not add dependencies, config files, or new test files.
- Do not "improve" the tests, the brief, or anything under `control/`.
- Do not claim containment, completion, or coverage you have not observed.

## Stop-when

- A test seems to contradict the brief.
- You want to change any fence.
- The same check failure repeats twice with the same cause.

## Open questions

- None recorded. If you find one, that is a stop-and-ask, not a judgment call.
