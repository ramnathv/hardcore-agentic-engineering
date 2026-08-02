# First-failure labeling — worksheet

Open `events.jsonl` in this directory. Read every event, in order, out loud if
you are in a pair. Then answer in writing, alone, before comparing:

1. **Name the first failing state.** Not the first error message — the
   earliest point in the trace where the run's truth stopped being fully
   known, or the run stopped conforming to its own rules. Give the event id
   (or the boundary between two ids) and one sentence of justification.

2. **Who recorded event 13, and why does that matter?** Look at the `actor`
   field, not just the `status`.

3. **There is no crash event in this log. What is the evidence that a crash
   happened at all?** (Two independent signals in the trace.)

4. **The run ends `run.stopped(model_claimed_done)` after a green check. Does
   the happy ending change your answer to question 1?** One sentence.

Traps to notice (common wrong answers):

- "Event 13 — the check failed." Read event 13 again: `actor: operator`,
  summary `operator reconciliation: marked failed`. The harness never observed
  that check run. That event is the *remedy*, and its `failed` is an
  operator's judgment about the world, not a check output.
- "Nothing failed — it ended green." Outcome and trajectory are different
  questions. A good outcome can hide a state the harness could not vouch for.

When you have answers, check them against `homework-solutions.md` §Labeling.
