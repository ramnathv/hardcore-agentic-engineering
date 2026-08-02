# AS-BUILT — <system or component>

<!-- Maps are claims. Stamp them, and make every claim rerunnable where
     possible. A stale stamp is honest; a missing stamp is a rumor.
     Structure is checkable: handoff-check.sh. A fresh reader tracing one
     path is the real test — a line count can reveal drift, it cannot prove
     semantic accuracy. -->

Stamp: YYYY-MM-DD commit <sha-or-tree>

## Entry point

<!-- Where execution starts, as a path and a command. -->

## Critical path

<!-- The one data-and-action path that must be understood before editing
     anything: input → transform → side effect. Name files and functions. -->

## State ownership

<!-- Who may write what. In prove-it terms: control/ is host-owned,
     working/ is worker-owned, runs/ is append-only via the event log. -->

## Interfaces

<!-- The seams: contracts, tool unions, event vocabulary, receipts. Where a
     future change will be felt first. -->

## Gate and release boundary

<!-- What decides done, where the receipt lives, what completion requires,
     who owns promotion beyond the gate. -->

## Recheck commands

<!-- Commands that re-verify the claims above, runnable from the repo root.
     If a claim has no recheck command, say so on the claim. -->

```sh

```

## Known drift

<!-- Claims above that are suspected stale, and the check that would tell. -->
