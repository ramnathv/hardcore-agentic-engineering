# S6 homework — worked solutions

Every answer below was executed against the supplied fixtures; the quoted
lines are real output, not paraphrase.

## 1. Milestone extension — reference sketch

`evals` node contract: outcome names the eval pack; check runs your case
runner (for the supplied pack a workable check is the S5 case commands
chained with `&&` — never `||`); `depends_on: verify`; `write_set:` empty.
Budget: the node adds exactly 1 honest attempt (one `open` + gate check), and
the supplied `attempts: 6` already carries two attempts of headroom over the
four-node honest path. The defensible answer is to raise nothing and say why in
the comment line — an unneeded raise is exactly the headroom the invariant
exists to deny. Expected join tail:

```text
join: invariant — attempts spent 5 (runner 0 + inspect:1 implement:1 verify:1 review:1 evals:1) <= budget 6 — PASS
join: PASSED — all required receipts verified …
```

Remember to add `evals` to `join.requires` — if you forget, the join passes
without it, which is itself a finding: the join is only as complete as its
`requires` list. A good new attack row for step 3 is exactly that: remove a
node from `requires` and show your row catches the mismatch between `nodes:`
and `requires:` (the supplied join does not).

## 2. Topology memo — what a strong one looks like

The deliverable is falsifiable sentences, for example: "Bounded run. One coherent
change set (parser + its tests), same context throughout, clear check
(`npm test -w parser`). I would switch to a workflow if the fixture
regeneration turns out to write into `tests/fixtures/**` while the parser
change is in flight — overlapping write sets are my tripwire." Weak memos
say "workflow, because it is complex." Complexity is not a seam.

Comparison tables usually show the single agent winning on wall time and the
workflow winning on evidence quality (four receipts vs one transcript). The
honest conclusion for most tasks: one agent, plus a read-only review branch
only when the change is consequential.

## 3a. Refusal race

Observed:

```text
join: REFUSED — node review: returned a summary (runs/demo-review/summary.md), not a receipt — a summary is not evidence
```

The summary refusal fires, not the stale-tree one. Order in `cmdJoin`:
check 1 (complete fan-in, per node in `requires` order) runs before check 2
(terminal `dr-gate verify`), and review's missing receipt is found in
check 1. The drift would have been caught at check 2.

Is the order defensible? Yes: completeness is the cheapest check and its
refusal is the most actionable ("a node never earned a receipt" beats
"something about the tree moved"). The counter-argument — that stale
evidence is the more severe finding — is worth a sentence, but the join
stops at the first missing piece of evidence by design: it refuses, it does
not produce a ranked audit. If you want the full list, that is a different
tool (and a fine extension).

## 3b. The forged write

Observed:

```text
join: REFUSED — node review wrote working/src/slugify.mjs, outside its declared write set [none]
```

Prediction check: the write-set violation (check 4) fires before the
collision test, because per-node bounds are checked as each node's paths are
collected; the same forged path would also have collided with implement's
recorded write.

Bonus: the forgery violates the append-only log's id discipline — the
real review log ends at a low id and your event claims `id: 99` with a
plausible-but-fake timestamp. `readEvents` accepts any well-formed JSON
line; nothing re-derives or cross-signs ids. That is M5's lesson surfacing
again: the event log is trustworthy exactly to the extent that only the
harness writes it. In worker-writable state, an event log is a claim, not
proof — which is why completion lives in `control/receipts/`, not in
`events.jsonl`.

## 3c. The trust audit — residual-risk note (model answer)

> The join verifies terminal receipts through the gate but accepts
> non-terminal receipts (inspect, implement) on identity fields alone:
> run_id, contract sha, candidate-tree chaining. It never checks their HMAC.
> An attacker with write access to `control/receipts/` (host context only —
> the tool layer refuses worker writes there) could forge an inspect receipt
> with the right run_id, contract sha and tree hash, all computable without
> the key. The join cannot simply re-verify old receipts: running
> `dr-gate verify demo-inspect` after the workflow prints
> `dr-gate: REFUSED — receipt stale: candidate tree mismatch`, because
> verify binds to the CURRENT tree and inspect certified the pre-implement
> baseline. Closing the gap needs a gate capability the 163-line gate does
> not expose: signature-only attestation of a receipt without the tree
> binding. Until then: non-terminal receipt integrity rests on `control/`
> write protection, and this note belongs in the dossier's residual-risk
> section.

Full credit requires the tried-and-quoted stale refusal and the named
minimal capability. ("The gate should just verify everything" is the wrong
answer — it would re-introduce stale refusals on every legitimately
superseded baseline.)
