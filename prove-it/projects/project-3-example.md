# Project 3 — the run card, filled (worked example)

> Week 3 of the same fictional task. Project 3 is the run card itself —
> `PROOF.md` completed on your `project-3` branch. This is what a filled card
> looks like. On Demo Day you read it top to bottom.

Student: A. Example
Cohort: August 2026
Real task and repository (privacy-safe description): payments service,
deduplicating `POST /webhooks/payment` deliveries by `event_id`.

## The run card

Final claim: duplicate webhook deliveries with the same `event_id` create one ledger entry and return the stored result.

Done Contract: [`contract-dedupe.yaml` v2](project-1-example.md#the-contract-fixed-before-the-run-started)

Gate evidence for that contract and checked code: [`control/receipts/p3-regression.json`](#the-change-i-kept-before-and-after)

| Outcome | Final evidence | Link (privacy-safe) |
|---|---|---|
| Define | Here was my definition of done; here is the attack on it and what I changed | [`contract.yaml` v1→v2, the loophole and the pinned check](project-1-example.md#the-contract-fixed-before-the-run-started) |
| Brief | Here is what I told a fresh agent — the context, the limits, the stop conditions; here is what it did first | [goal + rider, and the rejected first plan](project-1-example.md#the-cold-start-brief-i-gave-the-agent) |
| Operate | Here was the surprise; here is the control decision and why | [the crash, and the reconcile ruled from the ledger query](project-2-example.md#the-control-i-chose-and-why) |
| Verify | Here is the wrong result turning red; here is the check result; here is the blind spot | [the weakened check staying green, the honest one going red](project-2-example.md#the-evidence-that-came-back) |
| Compound | Here is the one change I kept; here is the later run it improved | [the retained regression case, before and after](#the-change-i-kept-before-and-after) |

Run shape (how many agents worked, how they connected, and the problem that required that shape): one agent ran the task. A second agent would add coordination without an independent check.

Human release owner (the named person who accepted this result): A. Example's
team lead, named in the release record.

Remaining risk (one sentence: what can still be wrong): the check and the
handler share a read path, so a shared key-derivation bug passes both.

## The change I kept, before and after

The week-2 duplicate delivery became a permanent case: one webhook, replayed,
asserted to land as exactly one ledger entry. Before I kept it, the weakened
check earned a clean receipt over that exact fault
([`p2-attack-weak`](project-2-example.md#the-evidence-that-came-back)). After I
kept it, the same weakening turns red before any receipt exists. The run
`p3-regression` reran the honest check with the retained case in the pack:
`node control/dr-gate.ts check p3-regression` came back ACCEPTED over the fixed
handler and signed `control/receipts/p3-regression.json` — the receipt the
card's gate-evidence line links. That pair is the before-and-after: the same
mistake, caught a week earlier, by a case I kept instead of filed.

## The one question left

> What does this evidence still not prove?

It proves duplicates are collapsed and that my check can turn red; it does not
prove the check is independent of the code it judges, and it does not prove
burst-interleaved duplicates behave — both are named risks, not tested ones.

## Why this card passes its own checklist

In your card, every row is one link that opens for a stranger — the run paths
here are illustrative. No console output is pasted.
The final claim matches the linked contract. The gate-evidence link records
the contract and checked code. The release owner is named, the risk is one
sentence, and the question is answered in three. That is the whole bar — reach
it with your own task and you are Demo Day ready.
