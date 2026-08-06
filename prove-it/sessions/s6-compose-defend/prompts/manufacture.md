# S6 manufacture prompts — build the workflow component yourself

Four goal + rider pairs, one per major artifact. Paste the goal, then the rider,
into your own agent, in build order: later prompts depend on earlier
deliverables. Your build lives in `sessions/s6-compose-defend/my/`; the supplied
fixtures stay untouched so you can diff afterward. Every pair: goal ≤ 4,000
characters (`wc -m`), worker writes only inside `my/`, the gate's authority is
never negotiable.

---

## Pair 1 — the workflow definition and node contracts

Builds `my/workflow.yaml` and the four node contracts; done when the rider's "Done when" block gate-checks inspect clean.

### Goal

> Outcome: a workflow definition at `sessions/s6-compose-defend/my/workflow.yaml`
> and four node Done Contracts under `sessions/s6-compose-defend/my/contracts/`
> (inspect.yaml, implement.yaml, verify.yaml, review.yaml) for the slug-kit
> fixture task. Topology: inspect -> implement -> {verify, review} -> join;
> promotion is declared human-owned. One shared attempt budget for the whole
> workflow; one named retry owner.
>
> Posture: bounded run. Propose the four contract outcomes as one plan message
> first and wait for approval. Write only under `sessions/s6-compose-defend/my/`.
>
> Constraints: each contract must parse with the existing schema parser
> (`src/contract.ts`) and with `dr-gate`'s own check parser — same key set and
> layout as `done/contract.yaml`, `expect_exit` on the line after `command`.
> The inspect node certifies "the baseline is red" (`expect_exit: 1`). Verify
> and review are independent branches on the same candidate: verify promotes
> the runtime observation to an executable check; review is read-only with a
> static lint check. Only implement declares a non-empty write set.
>
> Stop and ask: any need to touch `src/`, `control/`, `done/`, or the supplied
> `fixtures/`; any check you cannot express without a suppression pattern.
>
> Budget: 2 gate-parse attempts per contract, 30 minutes.

### Rider

**Context.** M11: a workflow's nodes are verified runs; the join consumes
receipts, never summaries. The contract schema is fixed by the syllabus and
parsed twice — leniently by `src/contract.ts`, strictly by the regex in
`control/dr-gate.ts` (`parseChecks`). A contract that parses in one but not
the other will pass `loop open` and then fail at the gate.

**Live evidence.** From the supplied reference (do not copy it; match its
observable behavior):

```text
$ node src/loop.ts open --run-id t --contract sessions/s6-compose-defend/fixtures/contracts/inspect.yaml
run=t contract=sha256:… (fixed before run)
$ node control/dr-gate.ts check t
dr-gate: ACCEPTED — receipt at control/receipts/t.json
```

The inspect check on a red baseline exits 1 and is ACCEPTED because the
contract says `expect_exit: 1`.

**Focus files.** `done/contract.yaml` (the shape to mirror);
`control/dr-gate.ts` lines with `parseChecks` and `SUPPRESS`;
`src/contract.ts`; `working/test/slugify.test.mjs` (what red/green means);
`sessions/s6-compose-defend/fixtures/workflow.yaml` only AFTER your first
draft, as a comparison.

**Deliverable spec (3 items).**
1. `my/workflow.yaml`: workflow name, `budgets.attempts: 6`, `retry_owner`,
   four nodes each with `id/provider/contract/depends_on/write_set`, and a
   `join:` section with `requires` and `terminal` lists.
2. `my/contracts/{inspect,implement,verify,review}.yaml`: full schema
   (outcome, checks, runtime_observation, must_change, must_not_change,
   budgets, stop_and_ask, release_owner).
3. A 5-line NOTES.md stating which node owns which write set and why the
   branches cannot collide.

**Fences.** No edits outside `sessions/s6-compose-defend/my/`. No suppression
patterns anywhere (`|| true`, `--no-verify`, `--exit-zero`,
`--passWithNoTests`, trailing `exit 0`) — the gate lints for them. No new
dependencies.

**Stop-when.** All four contracts open and gate-check cleanly (inspect on the
red baseline; the other three you may only syntax-check until a runner
exists), or two parse failures on the same contract — stop and show both
error outputs.

**Done when:** in a throwaway copy (`PROVE_IT_ROOT` set), this exits 0 for
inspect and prints a refusal naming a missing run (not a parse error) for the
other three:

```sh
node src/loop.ts open --run-id p1 \
  --contract sessions/s6-compose-defend/my/contracts/inspect.yaml \
&& node control/dr-gate.ts check p1
```

---

## Pair 2 — the runner's node phase

Builds `my/runner.ts run`; done when the rider's "Done when" block prints `NODES-OK` and a bare rerun after a crash is refused.

### Goal

> Outcome: `sessions/s6-compose-defend/my/runner.ts` subcommand `run` executes
> my/workflow.yaml: nodes in dependency order, each node a real prove-it run
> (spawn `src/loop.ts`, then request `dr-gate check`), a ledger at
> `runs/<wf-id>/workflow.json` recording every run BEFORE it executes, one
> shared attempt budget enforced across all nodes and retries, and a bounded
> structured retry brief written on any gate refusal.
>
> Posture: bounded run, plan first. The runner may spawn `loop` and request
> the gate exactly as a human would; it gets no other path to `control/`.
>
> Constraints: zero npm dependencies; import only `src/root.ts`,
> `src/events.ts`, `src/contract.ts` from core. One attempt = one run opened;
> recompute spending from `run.requested` events, never from a counter alone.
> The retry brief is exactly `{class, check, artifact, attemptRemaining}` —
> no check output bytes in it, ever. On a crashed node run: refuse to rerun
> silently; adopt the run only after an operator-recovered gate receipt
> exists.
>
> Stop and ask: any design that needs to read `control/gate.key` or write
> under `control/`; any need to modify `src/loop.ts`.
>
> Budget: 3 end-to-end attempts, 60 minutes.

### Rider

**Context.** The runner is a teaching artifact for "a verified run as the
node". Its run phase must leave evidence a deterministic join can consume
later (Pair 3). Everything observable must come from the same commands a
student types by hand — the runner is choreography, not authority.

**Live evidence.** Reference behavior to match:

```text
── node implement: run demo-implement (attempt 1, shared budget 1/6 spent)
...
run=demo-implement status=needs_evidence — the worker's "done" is an opinion.
  dr-gate: ACCEPTED — receipt at control/receipts/demo-implement.json
...
workflow demo: node phase finished (4/6 attempts spent).
```

And after a `PROVE_IT_CRASH_AT_TOOL=3` crash during implement, a rerun prints
a refusal telling the operator to `loop view`, reconcile, gate-check, then
rerun — after which the runner adopts the receipt and continues.

**Focus files.** `src/root.ts` (`ROOT`, `requestGate`, `NODE_ARGS`);
`src/loop.ts` header comment (the CLI surface you drive); `src/events.ts`
(`readEvents`); `sessions/s6-compose-defend/my/workflow.yaml` (Pair 1);
reference runner only after your version runs.

**Deliverable spec (3 items).**
1. `my/runner.ts run --wf-id X [--wf PATH]`: honest path completes all four
   nodes with 4/6 attempts spent and four receipts in `control/receipts/`.
2. Ledger schema: `{wf_id, definition, definition_sha, nodes: {id: {runs[],
   accepted_run?}}}`; run appended and saved before the spawn.
3. Retry path: on gate refusal write `runs/<id>/retry-brief.json` (4 fields),
   retry only while shared budget remains, die with an escalation message
   when spent.

**Fences.** Never import `control/dr-gate.ts`. Never write outside
`runs/` and `sessions/s6-compose-defend/my/`. No `--attack` flags yet — the
honest path first.

**Stop-when.** Honest path green twice in fresh copies, or the same failure
twice — stop with both event logs.

**Done when:** in a fresh throwaway copy:

```sh
node sessions/s6-compose-defend/my/runner.ts run --wf-id p2
test -f "$PROVE_IT_ROOT/control/receipts/p2-review.json" && echo NODES-OK
```

prints `NODES-OK`, and a `PROVE_IT_CRASH_AT_TOOL=3` first attempt followed by
a bare rerun prints your refuse-silent-rerun message (nonzero exit).

---

## Pair 3 — the deterministic join and its refusals

Builds `my/runner.ts join` and `my/join-attacks.sh`; done when the attack script exits 0 with three distinct `REFUSED` reasons.

### Goal

> Outcome: `my/runner.ts join --wf-id X` — deterministic fan-in over the
> ledger and receipts, plus `my/join-attacks.sh` proving three refusals: an
> old receipt, a summary in place of evidence, and a shared-budget violation.
>
> Posture: bounded run, plan first: list the join's checks in order before
> writing code.
>
> Constraints: the join consumes receipts and event logs only — never a
> node's prose. Checks, in order: (1) every required node has its own
> receipt, a recorded summary is refused BY NAME; (2) terminal receipts
> re-verified via `dr-gate verify` against the current tree; (3) each node's
> `candidate_tree_start` equals its dependency's certified `candidate_tree`;
> (4) recorded writes inside declared write sets, no cross-node collision;
> (5) attempts recomputed from `run.requested` events across ALL runs of ALL
> nodes, refused when parent + children exceed the shared budget. Every
> refusal names the node and the missing or mismatched evidence. Exit 0 only
> when all five hold; write `runs/<wf>/join-result.json` either way.
>
> Stop and ask: any check expressible only by trusting the ledger's counters,
> or any need for the gate key.
>
> Budget: 3 attempts per attack row, 60 minutes.

### Rider

**Context.** This is the M11 acceptance surface: "the join consumes receipts,
never summaries" plus the machine-checkable budget invariant
(`parent attempts spent + all child attempts spent <= run attempt budget`).
The attack rows exist so a partner can run your script and see refusals
without trusting your word.

**Live evidence.** Reference refusal lines your version must functionally
match (wording may differ; named node + named evidence may not):

```text
join: REFUSED — node verify: old receipt refused — receipt names run 'demo-inspect', expected 'demo-verify'
join: REFUSED — node review: returned a summary (runs/demo-review/summary.md), not a receipt — a summary is not evidence
join: REFUSED — budget invariant violated: runner 0 + children 7 (inspect:1 implement:4 verify:1 review:1) > shared budget 6
```

**Focus files.** Your Pair 2 ledger and `control/receipts/*.json` (the input
shapes); `control/dr-gate.ts` verify branch (what the gate already refuses —
do not re-implement signature checking, request `verify`);
`scripts/tamper-table.sh` (the row/verdict script pattern to copy);
`sessions/s6-compose-defend/fixtures/join-attacks.sh` reference only after
yours runs.

**Deliverable spec (3 items).**
1. `join` subcommand with the five ordered checks and named-evidence
   refusals; honest path prints the invariant line with real numbers.
2. Attack hooks in `run` (`--attack summary|overspend`) that create the
   tampered state honestly and label it as a fixture in output.
3. `my/join-attacks.sh`: three rows, throwaway copy per row, each row greps
   for its expected refusal class and prints a verdict; exit 0 only if all
   rows refused for the right reason.

**Fences.** No reading `control/gate.key`. The old-receipt row must tamper
`control/receipts/` from the test script (host context), not from the runner.
No sleeps, no timestamps in assertions — determinism is the deliverable.

**Stop-when.** All three rows print the right refusal, or one row refuses for
the wrong reason twice — stop and show the diff between expected and actual.

**Done when:** `bash sessions/s6-compose-defend/my/join-attacks.sh` exits 0
and its transcript shows three distinct `REFUSED` reasons.

---

## Pair 4 — human promotion, outside the workflow

Builds `my/promote.sh`; done when the rider's "Done when" block prints `M12-OK`.

### Goal

> Outcome: `my/promote.sh` — the M12 promotion step. It refuses when invoked
> from workflow context (`PROVE_IT_WORKFLOW=1`), refuses without a named
> `--owner`, refuses without a `--rollback` path, re-runs the join for fresh
> evidence, and records `runs/<wf>/promotion.json`. Also: `my/runner.ts
> promote` exists only to refuse, explaining that promotion is not a runner
> command.
>
> Posture: single bounded run; this is a small artifact with sharp edges.
>
> Constraints: the runner must export `PROVE_IT_WORKFLOW=1` to every child it
> spawns, so the refusal is structural, not honor-system. promotion.json
> fields: `wf_id, decision, owner, rollback, decided_at, join_result`.
> "Human approved" without a name and a rollback path is an incomplete
> record — refuse it.
>
> Stop and ask: any temptation to have the runner call promote.sh "for
> convenience".
>
> Budget: 2 attempts, 20 minutes.

### Rider

**Context.** The course keeps irreversible promotion human-owned on purpose:
the decision and the residual risk must be visible and owned. The promotion
record names the rollback path because "approved" is incomplete when the
action cannot be reversed.

**Live evidence.** Reference behavior:

```text
$ PROVE_IT_WORKFLOW=1 bash .../promote.sh demo --owner "the runner" --rollback "n/a"
promote: REFUSED — promotion is a human decision outside the workflow.
$ bash .../promote.sh demo --owner "greg@specstory.com" --rollback "git checkout -- working/"
promote: re-running the join — promotion consumes fresh evidence, not a cached verdict.
...
promote: recorded at runs/demo/promotion.json
```

**Focus files.** Your Pair 2/3 runner (where children are spawned — the env
export lives there); `sessions/s6-compose-defend/fixtures/promote.sh`
reference after yours works; `MILESTONES.md` M12 row.

**Deliverable spec (3 items).**
1. `my/promote.sh` with the four refusal/consume behaviors above.
2. The `PROVE_IT_WORKFLOW=1` export in your runner's spawn env plus the
   refusing `promote` subcommand.
3. Three-line addition to `my/NOTES.md`: who owns promotion for YOUR real
   task, and its rollback or compensating path.

**Fences.** promote.sh writes exactly one file (`promotion.json`). It never
touches `control/` or `working/`.

**Stop-when.** All four behaviors demonstrated in one transcript, or any case
where the workflow context refusal can be bypassed — that is a finding, stop
and record it.

**Done when:** in a copy where your join passes:

```sh
PROVE_IT_WORKFLOW=1 bash sessions/s6-compose-defend/my/promote.sh p2 --owner x --rollback y; test $? -ne 0 \
&& bash sessions/s6-compose-defend/my/promote.sh p2 --owner "you@example.com" --rollback "git checkout -- working/" \
&& test -f "$PROVE_IT_ROOT/runs/p2/promotion.json" && echo M12-OK
```

prints `M12-OK`.
