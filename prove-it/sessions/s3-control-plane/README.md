# Session 3: Build the control plane

*Recover a crashed action.*

A crashed run must not repeat an external action until you know what happened.

**Course outcome:** Operate

- **Do before class:** Read Chapter 3 and bring one run log that shows a failure or refusal.
- **Do in class:** Run one comparison and write one stable request ID.
- **Finish for Project 2:** Describe one uncertain moment, the control you chose, and why you chose it.
- **Save:** `FIELD-NOTES.md` for the session action and `projects/project-2.md` for Project 2
- **Submit:** Maven Student Home → Project 2
- **Help:** Maven Student Home → `#questions`

> [!IMPORTANT]
> The live task is the comparison and one written request ID. The longer ledger exercise and engineering builds are optional.

## On this page

- [Before](#before)
- [During the live session](#during-the-live-session)
- [Apply](#apply)
- [Replay](#replay)
- [Go deeper](#go-deeper)

## Before

1. Read [Chapter 3](https://hardcoreagentic.com/course/reader/03-control-plane.html). Allow about 12 minutes.
2. Find one run log that shows a tool failure or refusal.
3. Bring that run log before 5pm Tuesday 11 August.

A **run log** is the saved record of one run.

The session is Tuesday 11 August, 5pm to 7pm ET. The live comparison needs no key or network access.

## During the live session

During the instructor demo, watch and predict. There is nothing to type. Run the launcher once when the lab block starts.

### Watch

Both lanes start after the same simulated crash. The crash occurs after a payment but before the caller records the result.

The **blind retry** sends the payment again. The **evidence-first recovery** reads the ledger before it acts.

The lanes use a scripted demo agent so that the crash occurs at the same point. The ledger and the harness checks are real local programs.

`needs_reconcile` means that the harness does not know whether the action happened. It does not mean that the action failed.

### Decide

Read the ledger before you decide. The supplied ledger contains one matching payment, so `ok` is the only honest result.

The full control plane also supports `failed` and `in_doubt`. If the evidence cannot settle what happened, use `in_doubt`.

### Try it

After the demo, run this command from the `prove-it` root:

```sh
bash scripts/demo-compare.sh s3 --mock
```

The decisive result is the right lane reading the ledger before it records the outcome. The launcher saves the compare artifact under `live/artifacts/`.

### Your task

Write one **idempotency key** for an external action in your Project. An idempotency key is a stable request ID that makes a repeated request harmless.

Name the intent, not the attempt. For example, `pay-2026-08-11-ops-5` identifies one payment and stays the same after a retry.

Do not use a new timestamp or UUID for each attempt. A new value describes a new request.

The three ledger commands that use `--key` are optional practice in [Replay](#idempotency-by-key). You only need to write your key in class.

### Save

Add the request ID and its external action to your private `FIELD-NOTES.md`. This session action is not a Project 2 grading item.

## Apply

### Use this in your project

1. Name the moment when your run became uncertain.
2. State the evidence that you read before you continued.
3. State the control that you chose.
4. Explain why that control fit the evidence.

If your Project needs an example, use a sent email, published package, dropped table, or charged card.

If no control exists, write `no control exists`.

### Optional reflection

Name one action that is not practical to reverse. Then name the person who approves that action.

This reflection is useful preparation for later sessions. It is not a Project 2 grading item.

### Save and submit

- **Save:** Add this work to `projects/project-2.md` on your `project-2` branch.
- **Link from:** After submission, add the final control-evidence link to the Operate row of [`PROOF.md`](../../PROOF.md).
- **Submit:** Use the Maven Project 2 item.
- **Due:** Friday 14 August.

The Maven Project 2 page owns the grading rules. Session 4 supplies the wrong case and verification evidence for the same Project.

### This session is complete when

- [ ] You ran `bash scripts/demo-compare.sh s3 --mock`.
- [ ] You wrote one stable request ID for your own action.

### Project 2 is complete when

- [ ] Your submission satisfies every item on the Maven Project 2 page.
- [ ] You submitted the `project-2` branch link in Maven.

### If you miss class

Watch the recording on Maven Student Home. Then name one action in your environment that can partly happen before a crash.

Assume that the evidence cannot tell you whether that action happened. Write your response in `projects/project-2.md`.

You do not need to run Replay to recover the session.

### If something fails

Run the launcher again from the `prove-it` root. The launcher stages a new temporary copy.

If the second run fails, post the command and its output in Maven `#questions`. Include the step, expected result, and privacy-safe evidence.

## Replay

Replay is a reference. It is not another assignment.

Use it to inspect the complete crash and recovery at your own pace.

### Run the comparison again

Run this command from the `prove-it` root:

```sh
bash scripts/demo-compare.sh s3 --mock
```

The launcher uses temporary copies. It does not change the checked files in your checkout.

### Prepare a scratch copy

Run these commands from the `prove-it` root:

```sh
node --version                 # need >= 22.18
```

```sh
bash scripts/green-check.sh
```

The decisive result is `green check: 8 passed, 0 failed.`

Save the path of your checkout:

```sh
PIT="$(pwd)"
```

Create a scratch copy:

```sh
S3_LAB="$(bash sessions/s3-control-plane/fixtures/scratch.sh)"
```

Enter the scratch copy:

```sh
cd "$S3_LAB"
```

```sh
pwd
```

The printed path is in your temporary directory. Save notes in `$PIT/FIELD-NOTES.md`, not in this copy.

### See the double payment

Reset the local ledger:

```sh
node sessions/s3-control-plane/fixtures/ledger.mjs reset
```

Send a payment and simulate the crash:

```sh
node sessions/s3-control-plane/fixtures/ledger.mjs send --to ops --amount 5 --crash-before-record
```

Send the payment again:

```sh
node sessions/s3-control-plane/fixtures/ledger.mjs send --to ops --amount 5
```

Check the number of payments:

```sh
node sessions/s3-control-plane/fixtures/ledger.mjs assert-count --to ops --n 1
```

The decisive output is the final failure:

```text
ledger: reset (…/runs/s3-ledger.jsonl)
ledger: simulated crash AFTER the external effect, BEFORE the confirmation reached the caller (entry #1 IS in the ledger)
sent: entry #2 to=ops amount=5 key=none
ledger: FAIL — expected 1 entry to=ops, found 2
```

The file represents a network service. The file is simulated, but the uncertain external effect is real.

### Inspect a pending action

Put the supplied implementation in place:

```sh
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs
```

Crash after the harness dispatches the tool:

```sh
PROVE_IT_CRASH_AT_TOOL=3 node src/loop.ts run \
  --provider smoke --run-id fx-crash
```

```text
  ✖ simulated crash after dispatching 'run_check' (fixture)
```

Read the run state:

```sh
node src/loop.ts view fx-crash --full
```

```json
  "status": "needs_reconcile",
  "pending": {
    "tool": "run_check",
    "args": {},
    "eventId": 12
  },
```

Try to resume without a decision:

```sh
node src/loop.ts resume fx-crash
```

```text
run=fx-crash has a PENDING action dispatched but never recorded:
  tool=run_check args={}
The side effect may or may not have happened. Decide, then resume:
  loop resume fx-crash --reconcile ok|failed|in_doubt
  loop cancel fx-crash --reason "..."
```

The refusal exits 1. Read the external state before you choose a result.

Run the named check:

```sh
node --test working/test/slugify.test.mjs
```

The test exits 1. Record `failed` because the evidence shows that result:

```sh
node src/loop.ts resume fx-crash --reconcile failed
```

Ask the gate to check the run:

```sh
node control/dr-gate.ts check fx-crash
```

Complete the run:

```sh
node src/loop.ts complete fx-crash
```

```text
dr-gate: ACCEPTED — receipt at control/receipts/fx-crash.json
  run=fx-crash contract=sha256:ceaaf355388b… check=check-v1 candidate=tree:a71862e1d0e8…
dr-gate: VERIFIED — run=fx-crash contract=sha256:ceaaf355388b… check=check-v1 candidate=tree:a71862e1d0e8…
run=fx-crash status=completed (receipt verified by dr-gate)
```

Read the recorded decision:

```sh
grep reconciliation runs/fx-crash/events.jsonl
```

```text
{"id":…,"run":"fx-crash","ts":"…","type":"tool.result","actor":"operator","data":{"tool":"run_check","status":"failed","summary":"operator reconciliation: marked failed after crash between dispatch and record","retryable":true}}
```

The actor is `operator` because a person made this decision.

If the evidence cannot settle the result, use `--reconcile in_doubt`.

### Idempotency by key

Reset the ledger:

```sh
node sessions/s3-control-plane/fixtures/ledger.mjs reset
```

Send the payment with a stable key and simulate the crash:

```sh
node sessions/s3-control-plane/fixtures/ledger.mjs send --to ops --amount 5 \
  --key pay-2026-08-11-ops-5 --crash-before-record
```

```text
ledger: reset (…/runs/s3-ledger.jsonl)
ledger: simulated crash AFTER the external effect, BEFORE the confirmation reached the caller (entry #1 IS in the ledger)
```

Read the ledger by key:

```sh
node sessions/s3-control-plane/fixtures/ledger.mjs query --key pay-2026-08-11-ops-5
```

Send the same request again:

```sh
node sessions/s3-control-plane/fixtures/ledger.mjs send --to ops --amount 5 --key pay-2026-08-11-ops-5
```

Check the number of payments:

```sh
node sessions/s3-control-plane/fixtures/ledger.mjs assert-count --to ops --n 1
```

```text
{"id":1,"ts":"…","to":"ops","amount":5,"key":"pay-2026-08-11-ops-5"}
idempotent replay: key 'pay-2026-08-11-ops-5' already recorded as entry #1 — no new external effect
ledger: PASS — exactly 1 entry to=ops
```

The repeated request causes no second payment because both attempts use the same key.

### Leave the scratch copy

Return to your checkout:

```sh
cd "$PIT"
```

Resolve the temporary base and scratch paths:

```sh
S3_TEMP_BASE="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
```

```sh
S3_LAB_RESOLVED="$(cd "$S3_LAB" && pwd -P)"
```

Remove only a scratch path that matches the S3 temporary-directory pattern:

```sh
case "$S3_LAB_RESOLVED" in
  "$S3_TEMP_BASE"/prove-it-s3.*) rm -rf -- "$S3_LAB_RESOLVED" ;;
  *) printf 'refusing cleanup outside the S3 temp path: %s\n' "$S3_LAB_RESOLVED" >&2 ;;
esac
```

Clear the scratch variables:

```sh
unset PIT S3_LAB S3_TEMP_BASE S3_LAB_RESOLVED
```

## Go deeper

Go deeper is optional. It never blocks a Project, a later session, or Demo Day.

The optional engineering map names two extensions for this session:

- **M5** adds durable recovery, stable request IDs, and retry budgets.
- **M6** adds tool statuses, approval rules, and probe rows.

The demonstrations on this page do not complete either milestone. Use [MILESTONES.md](../../MILESTONES.md) for the full evidence rules.

### Read the five statuses

Run the status tour from the `prove-it` root:

```sh
node sessions/s3-control-plane/fixtures/toolresult-tour.mjs
```

```text
ToolResult tour — every result below comes from a real dispatch

== ok — read_file working/BRIEF.md
== failed — run_check (exit 1, artifact retained, observation bounded)
== refused — read_file control/gate.key (credential policy)
== pending — request_release (human-owned action)
== in_doubt — never returned by dispatch in the starter (and the tour will not fake one)

See reader ch. 3 "Tool contracts": the exact type is not important; the distinctions are.
```

Each status requires a different action:

| Status | Meaning | Next action |
|---|---|---|
| `ok` | The tool finished successfully. | Continue. |
| `failed` | The tool finished with an error. | If new evidence supports a retry, retry. |
| `refused` | A policy blocked the action. | Use the stated alternative or ask for authority. |
| `pending` | A person must decide. | Wait for that decision. |
| `in_doubt` | The result is unknown. | Read external evidence before you continue. |

### Read the containment probe

Run the probe from the `prove-it` root:

```sh
bash scripts/probe.sh
```

```text
5. child-process escape (run_shell)
   label: UNSUPPORTED  (arbitrary child processes are not allowlisted in the starter)
   note:  tool-layer policy refused the spawn; OS-level containment is NOT active on this host

4 of 6 refused by tool-layer policy · 0 of 6 contained by the OS.
No OS sandbox is active on this host: UNSUPPORTED IS NOT CONTAINED.
An uncontained run may be observed; it must not complete autonomously.
```

The tool policy refused four attempts. The operating system contained none of them.

> [!NOTE]
> `UNSUPPORTED` does not mean `CONTAINED`. The starter has no operating-system sandbox on this host.

### Check a failed budget

The starter counts attempts, but it does not stop a run when the budget ends. This drill shows that limit.

```sh
node src/loop.ts run --provider smoke \
  --contract sessions/s3-control-plane/fixtures/red-contract.yaml --run-id burn
```

```text
  ⏺ run_check → failed — check failed (exit 1): node -e "console.error('POST https://api.example.test/v1/send: connect timeout (simulated)'); process.exit(1)"
  ● All named checks pass in my workspace. I believe this is done — the gate decides.
```

Read the budget state:

```sh
node src/loop.ts view burn --full
```

```json
  "toolFailures": 2,
  "budgets": {
    "attempts": 2,
    "used": 2
  },
```

Ask the gate to check the failed run:

```sh
node control/dr-gate.ts check burn
```

```text
dr-gate: REFUSED — check failed: '…' exited 1, expected 0 (output in runs/burn/check-output.txt)
```

The gate catches the false completion claim. It does not recover the attempts that the run already spent.

### Compare the log and view

Put the supplied implementation in place:

```sh
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs
```

Run the scripted agent:

```sh
node src/loop.ts run --provider smoke --run-id s3-demo
```

```text
run=s3-demo contract=sha256:ceaaf355388b… (fixed before run)
  ● Reading the brief and the current implementation.
  ⏺ read_file → ok — read working/src/slugify.mjs (200 bytes): …
  ● Writing a first implementation and running the named check.
  ⏺ write_file → ok — wrote working/src/slugify.mjs
  ⏺ run_check → failed — check failed (exit 1): node --test working/test/slugify.test.mjs
  ● The check failed on the ampersand case. Fixing and re-running.
  ⏺ write_file → ok — wrote working/src/slugify.mjs
  ⏺ run_check → ok — check passed: node --test working/test/slugify.test.mjs
  ● All named checks pass in my workspace. I believe this is done — the gate decides.
run=s3-demo status=needs_evidence — the worker's "done" is an opinion.
Only the gate records completion:
  node control/dr-gate.ts check s3-demo
  node src/loop.ts complete s3-demo
```

Read the last tool result from the run log:

```sh
grep '"type":"tool.result"' runs/s3-demo/events.jsonl | tail -1
```

```json
{"id":19,"run":"s3-demo","ts":"2026-07-30T16:55:20.217Z","type":"tool.result","actor":"harness","data":{"tool":"run_check","status":"ok","summary":"check passed: node --test working/test/slugify.test.mjs","artifact":"…/runs/s3-demo/tool-output-2.txt"}}
```

Each event records an ID, run, time, type, actor, and data. The run log is `runs/s3-demo/events.jsonl`.

Read the reduced view:

```sh
node src/loop.ts view s3-demo --full
```

```json
"lastObservation": "check passed: node --test working/test/slugify.test.mjs"
```

The log and the view agree because both use the same `tool.result` event.

### Inspect a torn record

Append an incomplete JSON record:

```sh
printf '{"id":99,"run":"s3-demo","ts":"2026-08-11T18:' >> runs/s3-demo/events.jsonl
```

Read the damaged log:

```sh
node src/loop.ts view s3-demo --full
```

```text
events: dropped one torn final record (crash mid-write)
events: dropped one torn final record (crash mid-write)
```

Two readers load the log, so the warning prints twice. The harness drops the incomplete final record and reports the loss.

### Classify probe results

Use the probe output for four attempts. Record each attempt with this format:

```text
attempt → label (refused|contained|allowed|unsupported) — evidence: <the printed line>
```

Use the printed label. Do not infer operating-system containment from a tool-policy refusal.

### Build optional M5 and M6 extensions

Work in your fork, not the scratch copy. Use the goals and riders in [prompts/manufacture.md](prompts/manufacture.md).

Choose one starting point:

- Prompt 1 adds budget enforcement and prints `M5-BUDGET-OK`.
- Prompt 2 adds the idempotent ledger tool and prints `M5-IDEM-OK`.
- Prompt 3 adds the approval flow and prints `M6-APPROVAL-OK`.
- Prompt 4 adds probe rows and prints `M6-PROBE-OK`.

After each change, run the prompt's `Done when` command yourself.

Create the run directory:

```sh
mkdir -p runs
```

Copy the supplied crashed run:

```sh
cp -R sessions/s3-control-plane/fixtures/crash-after-dispatch runs/fx-golden
```

Check that the reducer still produces the supplied view:

```sh
node src/loop.ts view fx-golden --full \
  | diff - sessions/s3-control-plane/fixtures/crash-after-dispatch/expected-runview.json \
  && echo REDUCER-OK
```

Remove the copied run:

```sh
rm -rf runs/fx-golden
```

`REDUCER-OK` means that the reducer still reports the supplied crash correctly.

Restore the supplied file after your extensions:

```sh
git checkout -- working/src/slugify.mjs
```

Run the unit tests:

```sh
npm test
```

Run the green check:

```sh
bash scripts/green-check.sh
```

Put the supplied implementation in place:

```sh
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs
```

Open a new run on the extended fork:

```sh
node src/loop.ts run --provider smoke --run-id m5m6-close
```

Ask the gate to check the run:

```sh
node control/dr-gate.ts check m5m6-close
```

Complete the run:

```sh
node src/loop.ts complete m5m6-close
```

```text
dr-gate: ACCEPTED — receipt at control/receipts/m5m6-close.json
  run=m5m6-close contract=sha256:ceaaf355388b… check=check-v1 candidate=tree:a71862e1d0e8…
dr-gate: VERIFIED — run=m5m6-close contract=sha256:ceaaf355388b… check=check-v1 candidate=tree:a71862e1d0e8…
run=m5m6-close status=completed (receipt verified by dr-gate)
```

This receipt shows that the original gate path still works after your changes. It does not complete M5 or M6 by itself.

### Classify six situations

Classify each result as `ok`, `failed`, `in_doubt`, `refused`, or `pending`. Write the evidence query for each `in_doubt` result.

1. `git push` printed "Enumerating objects…" before the connection timed out.
2. A unit test exited 1 with a clear assertion message.
3. The agent asks to `rm -rf` a path outside `working/`.
4. An external POST returned `500 Internal Server Error`.
5. A deploy needs the release owner, who has not answered.
6. A file read reports that the file does not exist.

### Optional depth is complete when

- [ ] Each extension that you built prints its stated OK line.
- [ ] `npm test` and `bash scripts/green-check.sh` pass on your extended fork.
- [ ] The reducer command prints `REDUCER-OK`.
- [ ] Your policy matrix covers all seven action classes.
- [ ] You compared your evidence with the full M5 or M6 row in [`MILESTONES.md`](../../MILESTONES.md).
