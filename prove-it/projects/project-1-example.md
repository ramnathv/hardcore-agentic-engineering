# Project 1 — contracted run (worked example)

> A finished example on a fictional task, so you can see the bar. Your
> submission will differ in content and match in shape. The evidence paths
> here are illustrative; in your submission each one is a real link that
> opens on your branch.

## The result I attempted

Duplicate deliveries of `POST /webhooks/payment` with the same `event_id` no
longer create duplicate ledger entries: two deliveries, one recorded charge.

## The contract, fixed before the run started

`projects/contract-dedupe.yaml` on the branch, frozen at v2, sha `2e77…`
(v1 was `9c41…`). It carries the two ported keys from [PORT.md](../PORT.md):
`candidate_dir` points at the payments repo, and `protect` pins the dedupe
test by its full path from the contract's own directory (the contract lives
in `projects/`, not next to the repo, so both entries carry the longer
path), so the run cannot pass by weakening the test.

The loophole attack changed it: my v1 check command was `npm test -- webhooks`,
and the attack found the dedupe test file was not matched by that filter — the
command succeeds without running the check. v2 pins
`npm test -- webhook-dedupe --`, and I watched it fail red before any fix.

## The cold-start brief I gave the agent

`projects/goal-dedupe.md` (1,410 characters) and `projects/rider-dedupe.md`. The rider names the outbox table as the
only legal retry path, fences off the legacy queue, and stops on any schema
change. Nothing in the brief depends on chat history; a fresh agent starts
cold from these two files.

## What the first run actually did

Before the agent started,
`node src/loop.ts open --run-id p1-dedupe --contract projects/contract-dedupe.yaml`
pinned the v2 sha, the repo's tree and the protected test. The agent's first
plan proposed reading the legacy queue for retries. I rejected the plan with
one fact — "the legacy queue is read-only in staging" — wrote it into the
rider, and its second plan used the outbox. Its own check run came back red
(`# fail 1`, the dedupe test), it fixed the handler, and the check went green
in its workspace. Then the gate ruled:
`node control/dr-gate.ts check p1-dedupe` reran the named check from the repo
root and signed `control/receipts/p1-dedupe.json`, and
`node src/loop.ts complete p1-dedupe` verified it — both in the prove-it
clone on this branch. The payments repo was read, hashed and judged, never
written to.

## The doubt I still have

The check proves one duplicate in a row is collapsed. Ten deliveries in a
burst, interleaved with other events, is untested.
