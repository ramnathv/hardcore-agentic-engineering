# S3 manufacture prompts — build M5 and M6 with your own agent

Four goal + rider pairs. Paste each pair into a fresh agent session on your
fork, no other context, and run the "Done when" check yourself before you
believe the agent. Form reference: the worked M3 pair
(`prompts/goal-m03.md`, `prompts/rider-m03.md`).

---

## Prompt 1 — budget enforcement (M5: stop at the boundary)

Builds the stop at the attempts boundary; done when `M5-BUDGET-OK` prints.

### Goal (paste first)

Extend prove-it so a run STOPS when its attempts budget is exhausted, instead
of counting silently and letting the worker claim done. Bounded run: propose a
one-paragraph plan and wait for approval. Only `src/loop.ts` and
`src/runview.ts` may change. Done is decided by the executable check in the
rider, not by your report. Stop and ask if you want to touch any other file,
and after two failed attempts on the same premise.

### Rider

**Context.** prove-it's loop (`src/loop.ts`, `runTurns`) dispatches tools and
records `tool.result` events. `src/runview.ts` reduces `events.jsonl` into a
`RunView` whose `budgets: { attempts, used }` already counts failed tool
results. Nothing acts on the count: a run with `used == attempts` keeps
running and ends with `run.stopped` / `model_claimed_done`. Budget rules are
in the reader ch. 3 "Budgets and no-progress": at the boundary, stop or
escalate; never reset the budget by spawning a child run.

**Live evidence.** Run
`node src/loop.ts run --provider smoke --contract sessions/s3-control-plane/fixtures/red-contract.yaml --run-id pre`
— the check fails twice (attempts budget is 2), then the log still gets
`run.stopped` with `model_claimed_done`. `loop view pre --full` shows
`"used": 2` of `"attempts": 2` and status `needs_evidence`.

**Focus files.** `src/loop.ts` (runTurns), `src/runview.ts` (status union +
reducer cases), `sessions/s3-control-plane/fixtures/red-contract.yaml`
(read-only fixture).

**Deliverable (3 items max).**
1. In `runTurns`: after a `failed` tool result, when failures reach
   `manifest.budgets.attempts`, append a `run.budget_exhausted` event
   (actor `harness`, data naming the boundary) and return without emitting
   `run.stopped`.
2. In `runview.ts`: add `budget_exhausted` to the status union and reduce
   `run.budget_exhausted` to it.
3. A printed line telling the operator to stop or escalate — and explicitly
   not to reset the budget with a child run.

**Fences.** No new dependencies. Do not touch `control/`, `done/`,
`sessions/`, tests, or the event schema of existing types. Do not "fix" the
red-contract fixture — it is supposed to fail.

**Stop-when.** You want to change any file outside the two named; the same
check fails twice for the same reason; you are tempted to enforce
`elapsed_minutes` too (that is a follow-up, not this run).

**Done when** (run it yourself):

```sh
node src/loop.ts run --provider smoke \
  --contract sessions/s3-control-plane/fixtures/red-contract.yaml --run-id b1
grep -q '"type":"run.budget_exhausted"' runs/b1/events.jsonl \
  && ! grep -q model_claimed_done runs/b1/events.jsonl \
  && node src/loop.ts view b1 | grep -q '"status": "budget_exhausted"' \
  && npm test && echo M5-BUDGET-OK
```

---

## Prompt 2 — idempotent external action + reconciliation (M5)

Builds the `send_ledger` tool with a key-first crash recovery; done when
`M5-IDEM-OK` prints.

### Goal

Add one worker tool, `send_ledger`, that performs an external write against
the simulated service `sessions/s3-control-plane/fixtures/ledger.mjs` using an
idempotency key created BEFORE the effect, and make crash recovery query by
key instead of re-sending. Bounded run: plan first, wait for approval. Only
`src/tools.ts` may change (plus reducer if you record a new event type). Done
is the executable drill in the rider. Stop and ask before widening any fence.

### Rider

**Context.** The reader ch. 3 sequence is law: (1) create key, (2) record
intent, (3) pass key to the service, (4) execute, (5) record result. The
ledger fixture is a file standing in for a network service; its at-least-once
boundary is real. `send --key K` is idempotent server-side: a repeated key
appends nothing and prints `idempotent replay`. `query --key K` is the
reconciliation read (exit 1 if absent). The starter's `send_message` tool
returns `refused` — leave it; `send_ledger` is a *new, allowlisted, simulated*
action class.

**Live evidence.**
`node sessions/s3-control-plane/fixtures/ledger.mjs send --to ops --amount 5 --crash-before-record`
exits 9 *after* the ledger gained entry #1. A naive second `send` makes it 2
entries — `assert-count --to ops --n 1` then fails. That double-charge is the
bug your tool must make impossible.

**Focus files.** `src/tools.ts` (new dispatch case, spawn the ledger via
`node sessions/s3-control-plane/fixtures/ledger.mjs …`),
`sessions/s3-control-plane/fixtures/ledger.mjs` (read-only — this is the
external world, you do not get to edit the world).

**Deliverable (3 items max).**
1. `send_ledger` dispatch case: derive the key from run id + action
   (`<run-id>-send-<to>-<amount>` is fine), always pass `--key`, return `ok`
   with the confirmation line as summary.
2. On any uncertain outcome (nonzero exit that is not a clean refusal), return
   `in_doubt` with `reconcile` naming the exact query command
   (`ledger.mjs query --key <K>`).
3. Keep the full ledger output as an artifact under the run dir; summary stays
   one line.

**Fences.** Do not modify ledger.mjs. Do not generate a fresh key on retry —
a new key per attempt is the double-charge bug wearing a disguise. No
network, no new dependencies.

**Stop-when.** You need a schema change to `Ev`; you want the ledger to
behave differently; the drill below fails twice for the same reason.

**Done when** (the crash drill, run it yourself):

```sh
node sessions/s3-control-plane/fixtures/ledger.mjs reset
node --input-type=module -e "
  const { dispatch } = await import('./src/tools.ts');
  console.log(JSON.stringify(dispatch('send_ledger', { to: 'ops', amount: 5, run: 'hw', crash: true }, { runDir: 'runs/hw', checkCommand: 'true' })));
  console.log(JSON.stringify(dispatch('send_ledger', { to: 'ops', amount: 5, run: 'hw' }, { runDir: 'runs/hw', checkCommand: 'true' })));
"
node sessions/s3-control-plane/fixtures/ledger.mjs assert-count --to ops --n 1 && npm test && echo M5-IDEM-OK
```

(First dispatch simulates the crash — pass a `crash: true` arg through to
`--crash-before-record`; second dispatch is the recovery. Exactly one entry
must exist.)

---

## Prompt 3 — approval flow for `pending` + remaining action classes (M6)

Builds `loop approve` and the seven-class policy table; done when
`M6-APPROVAL-OK` prints.

### Goal

Make `pending` mean something: add an operator command that records an
approval event, and make one external action class proceed only when a
matching approval exists in the log. The drill sends to `review`, so use that
recipient. Add a policy table covering all seven action classes to
the policy table in `src/tools.ts` with refuse/ask/allow defaults. Bounded
run; plan first; only `src/loop.ts`, `src/tools.ts`, `src/runview.ts` may
change. Done is the executable check in the rider. Stop and ask before
touching anything else.

### Rider

**Context.** Reader ch. 3 authority matrix: read local / write worktree /
network read / external write / credential read / destructive / release each
carry different defaults, and approval applies **at the point of action** —
a plan approval is not an external-write approval. In the starter,
`request_release` returns `pending` with an `approvalId` and then nothing can
happen: there is no way to grant, and no tool checks for grants. Precedence
rule to implement and state in a comment: refuse beats ask beats allow; most
specific class wins.

**Live evidence.**
`node --input-type=module -e "const { dispatch } = await import('./src/tools.ts'); console.log(JSON.stringify(dispatch('request_release', {}, { runDir: 'runs/x', checkCommand: 'true' })))"`
prints `pending` with a fresh `approvalId` — and there is nowhere to take that
id. `send_message` is refused unconditionally, even for an operator who wants
to approve it.

**Focus files.** `src/loop.ts` (new `approve` subcommand appending
`approval.granted` with actor `operator`), `src/tools.ts` (dispatch gains a
way to see granted approvals; `send_message` proceeds — simulated, e.g. via
the ledger fixture — only with one), `src/runview.ts` (track granted
approvals in the view).

**Deliverable (3 items max).**
1. `loop approve <run-id> <approvalId>` → appends `approval.granted`;
   `loop view <run-id> --full` shows it (approvals are not in the trimmed default view).
2. `send_message` with no matching grant → `pending` (with the id to
   approve); with a grant → executes once against the ledger fixture with an
   idempotency key and returns `ok`.
3. A `POLICY` table (data, not prose) in `src/tools.ts` listing all seven
   action classes with default refuse/ask/allow and one-line examples.

**Fences.** The gate, key, contracts and receipts stay host-owned — an
approval event must never make a `control/` write possible; that would be an
S4 finding, not a feature. No blanket approvals: a grant names one approvalId.

**Stop-when.** You find yourself passing approval state outside the event log
(a flag file, an env var — the log is the only memory); or any fence chafes.

**Done when:**

```sh
RID=apr1
node src/loop.ts open --run-id $RID
node sessions/s3-control-plane/fixtures/ledger.mjs reset
# 1) unapproved → pending, not executed
# 2) loop approve $RID <the-printed-id>
# 3) approved retry → ok, exactly one ledger entry (send to 'review')
grep -q '"type":"approval.granted"' runs/$RID/events.jsonl \
  && node sessions/s3-control-plane/fixtures/ledger.mjs assert-count --to review --n 1 \
  && npm test && echo M6-APPROVAL-OK
```

(Your agent scripts steps 1 to 3 as CLI invocations; the greps are the
non-negotiable part.)

---

## Prompt 4 — extend the probe with your environment's rows (M6)

Builds probe rows true of your fork and your machine; done when
`M6-PROBE-OK` prints.

### Goal

Add at least two rows to the worker-context authority probe that are true of
YOUR machine and this fork — every label produced by an actual attempt, never
inferred from configuration. Only `src/probe.ts` may change. Done is the
executable check in the rider. Stop and ask before adding a row whose attempt
could cause real damage.

### Rider

**Context.** `src/probe.ts` runs six attempts through `dispatch` and labels
each contained / refused / allowed / unsupported. The honest-label rules:
unsupported is not contained; a missing capability is reported loudly; the
probe exits 1 if anything unexpected is `allowed`. Your fork differs from the
starter (new tools from prompts 2–3, your OS, your shell) — the probe must
describe *your* worker context, not the stock one.

**Live evidence.** `bash scripts/probe.sh` currently prints 6 rows and
`0 of 6 contained by the OS` — none of your new tools (`send_ledger`, approved
`send_message`) appear, so the probe under-reports your actual surface.

**Focus files.** `src/probe.ts`. Read-only: `src/tools.ts`,
`scripts/probe.sh`.

**Deliverable (3 items max).**
1. One row attempting your new external-action tool WITHOUT an approval/key —
   expected label from the actual result, not from your intention.
2. One row true of your environment (examples: read a path outside the repo
   that exists on your machine; a second symlink shape; an attempt on a path
   your OS protects). The probe sandbox copies only `control working done
   fixtures`, so a row that shells out to anything under `sessions/` fails for
   the wrong reason.
3. A one-line note per new row stating what the label does NOT prove.

**Fences.** No row may write outside the repo or touch real credentials —
fake-home only. Do not weaken existing rows or the exit-code policy.

**Stop-when.** A planned attempt could mutate anything you cannot restore;
or a row's label would have to be guessed rather than observed.

**Done when:**

```sh
bash scripts/probe.sh && bash scripts/probe.sh | grep -c '^ *[0-9]\+\. ' | awk '{exit $1<8}' && echo M6-PROBE-OK
```

(exit 0 from the probe, and 8 or more numbered rows — the six stock rows plus
yours.)
