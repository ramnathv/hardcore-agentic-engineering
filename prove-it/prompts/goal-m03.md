# Goal — slugify under contract (M3 worked example)

<!-- The short goal states outcome, posture, constraints and stop condition.
     Course constraint: <= 4,000 characters, checked with `wc -m`. Detail
     belongs in the rider. This pair is a worked example: read it, then compile
     your own goal+rider from done/contract.yaml. -->

## Outcome

`working/src/slugify.mjs` turns arbitrary titles into url-safe slugs and the
named check (`node --test working/test/slugify.test.mjs`, run from the prove-it
root) exits 0. Done is decided by `dr-gate` against `done/contract.yaml`
(sha recorded in the run manifest before you start) — not by your own report.

## Posture

Bounded run. Propose a plan first and wait for approval. Work only inside
`working/`. You may run the named check as often as you like; you may request a
gate run; you may not write anything under `control/` or touch the contract.

## Constraints

- Zero dependencies. Node built-ins only.
- `working/test/` is read-only ground truth. If a test looks wrong, that is a
  stop condition, not an edit target.
- Keep the diff to `working/src/slugify.mjs`. Anything else must be argued for
  at plan time.

## Stop and ask

- Any need to modify a test, the contract, or anything under `control/`.
- Two consecutive failed attempts on the same premise: stop, state the premise
  you now doubt, and wait for a rebrief.
- Ambiguity about intended slug behavior not covered by a test: ask, do not
  invent policy.

## Budget

3 check attempts, 45 minutes. When the budget is spent, stop with a summary of
evidence gathered — a spent budget with a clear trail is a good outcome; a
guessed green is not.
