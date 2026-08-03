# Project 2 — controlled and attacked run (worked example)

> Week 2 of the same fictional task. Same repository, same run, further along.
> Evidence paths are illustrative; yours are real links on your branch.
>
> One difference from the Session 4 steps, named up front: this example
> attacked from the check side — it weakened the check to prove the green was
> not evidence. The Session 4 steps attack from the result side — make one
> real case wrong, then strengthen the check to catch it. Either direction
> fills the same five headings and the same six grading boxes.

## The moment the run became uncertain

Mid-run, my agent's session died between sending a charge to the staging
ledger and recording that it was sent. The effect may or may not have landed,
and nothing in the transcript could say which — the same shape as the
harness's `PENDING action dispatched but never recorded`, in a repo where the
charge is real.

## The control I chose, and why

Reconcile from observation, not from hope. I queried the ledger by the
idempotency key the send carried, found the entry present, and only then let
the run continue. The ruling and the query output are committed on the branch
as `projects/p2-crash-reconcile.md` — the record says a human ruled, and on
what evidence. I chose this over rerunning the send because a blind retry is
exactly how the original double-charge happened.

## The case I made wrong on purpose

I weakened the dedupe check in a branch: the assertion that counts ledger
entries now accepts `>= 1` instead of `== 1`. Production code untouched.

## The evidence that came back

The weakened check stayed green over a real duplicate — which is the finding.
Each branch got its own ported run, opened fresh so `protect` pinned what was
actually there: on the weakened branch,
`node src/loop.ts open --run-id p2-attack-weak --contract projects/contract-dedupe.yaml`,
then `node control/dr-gate.ts check p2-attack-weak` came back ACCEPTED — a
receipt earned by an inadequate check, exactly what a receipt does not rule
out. The honest branch, same commands under `p2-attack-honest`, was refused
with `# fail 1`, the exact case red, in
`runs/p2-attack-honest/check-output.txt`. Both rulings sit in the prove-it
clone, and the diff of the weakening is one line, kept in the branch history.

## The blind spot that remains

My check reads the ledger through the same code path the handler writes it
with. A bug shared by both — wrong key derivation, say — passes clean. An
independent read path is the fix, and it is not built yet.
