# S2 homework — worked solutions

If you are reading this before your own attempt, you are optimizing the
wrong metric.

## 1. Milestone extension — reference implementation notes

Two reducer cases, both additive (`src/runview.ts`):

```ts
// in the RunView interface — add, never reshape:
rejectedFacts: string[];
cancelReason: string | null;

// in the initial value:
rejectedFacts: [], cancelReason: null,

// in the switch:
case 'plan.rejected':
  if (typeof d.fact === 'string') v.rejectedFacts.push(d.fact);
  break;
case 'run.cancelled':
  v.status = 'cancelled';          // existing line stays
  v.cancelReason = d.reason ?? null;
  break;
```

Notes reviewers look for:

- `plan.rejected` gets its own case; it still must not bump `planVersion`
  (only approvals count — that asymmetry is deliberate and tested by eye in
  the steering fixture: 2 proposals, 1 approval, planVersion 1).
- The `run.cancelled` case already existed for status; you extend it rather
  than adding a second case for the same type.
- Accumulate all rejected facts (array), not just the last — a run that
  needed three rejections should show all three to its resumed self.
- `npm test` green proves you added without reshaping. If `runview.test.ts`
  broke, you renamed or removed something; that is a fail even if your new
  fields work.

Verification transcript (what you should have seen):

```text
$ node src/loop.ts view fx-steering --full
  ...
  "rejectedFacts": ["the legacy queue is read-only in this environment"],
  "cancelReason": null,
$ node src/loop.ts view s2-cancel --full
  "status": "cancelled",
  "cancelReason": "premise failed twice: rebriefing",
```

## 2. Real-repo transfer — grading rubric (self-score)

| Item | Weak | Strong |
|---|---|---|
| Goal | task summary pasted from memory | outcome + posture + fences + stop conditions, `wc -m` in evidence |
| Rider | a transcript dump | six sections a memoryless reader can act from |
| Bet card | filled after the run | filled before; the bet named a specific first action |
| Steer | a paragraph of context | one sentence asserting a fact; next agent action abandoned the branch |
| "No intervention needed" | asserted | argued — what you watched for and why it never fired |
| Evidence | "it worked" | contract sha + candidate identity + receipt (or the refusal, retained proudly) |

The most common weak spot: the rider's Live evidence section written from
memory rather than from commands actually run that morning. Live evidence has
a timestamp smell — if yours does not, rerun the commands.

## 3. Short exercises

### E1 — Compress the steer (one strong answer)

> "Stop — this builds fine locally, so the packages are not missing; the
> difference is in CI's environment. Look there."

Jobs performed: reject ("stop"), replace the model ("builds fine locally, not
missing"), re-scope ("look there"). No vent — the only optional job.
Anything over about 25 words should make you suspicious; the
original's 90-word hedge ("I think", "maybe", "could you") buries the one
decisive fact and invites a confident restatement instead of a pivot.

Acceptable variants must contain the fact ("builds locally") stated as ground
truth, not as a question. "Could you double-check whether the packages are
missing?" fails: it keeps the dead branch alive as a hypothesis worth
checking.

### E2 — Goal surgery (what good looks like)

No single answer; the check is structural:

- `wc -m` ≤ 4,000 with all six duties present — if you cut "stop and ask" to
  fit, you cut the wrong thing; cut phase detail instead.
- The overflow typically lands in the rider's Context and Live evidence
  sections — repo truths and command outputs. If most of your overflow went
  to Deliverable, your goal was carrying implementation steps, which was
  the disease the limit exists to catch.
- Litmus: hand your goal alone to a colleague; they should be able to state
  the outcome, what's forbidden, and when to stop — without the rider.

### E3 — Replay reading (answers keyed to event ids)

1. Premise: "reuse the legacy queue for retries" (e2). Killed by the fact in
   e3: "the legacy queue is read-only in this environment."
2. `planVersion` = 1. Two `plan.proposed` (e2, e5) but the reducer counts
   only `plan.approved` (e6). Rejected plans stay in the log, not in the
   version count.
3. `pending` = null — e8's `tool.requested` was answered by e9's
   `tool.result`. Last event is `run.resumed` (e11), so status = `running`.
4. A rung 1 fact delivered as a rung 4 interrupt: a new world fact
   ("staging db is being migrated right now") interrupting the current
   action. Legitimate because it changes execution
   conditions, not the outcome — the Definition of Done is untouched, so no
   new contract version is needed. (Contrast card 6 in
   `fixtures/injected-facts.md`.)
5. Death after e8: the log ends with a dispatched-but-unrecorded tool, so the
   reducer derives `needs_reconcile` with
   `pending: { tool: "write_file", ... }`. A restart demands a deliberate
   decision — `resume --reconcile ok|failed|in_doubt` or
   `cancel --reason` — and a blind `resume` is refused.

## Pitfall cross-check

If your transfer notes contain the phrase "I told it again and it worked",
re-read pitfall 3. What was the new fact in the second telling? If you can
name it, write that fact into the rider. If you cannot, you got lucky, and
the run after this one pays for it.
