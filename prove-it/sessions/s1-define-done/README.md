# Session 1: Define done before the run

*Make done testable.*

Write the result, limits, and checks before the agent starts.

**Course outcome:** Define

**Do before class:** Read Chapter 1 and save your unedited Session 0 task card.

**Do in class:** Watch one compare, run the launcher once, and close one loophole in the weak contract.

**Finish for Project 1:** Draft, attack, and revise a contract for your real task.

**Save:** `projects/project-1.md`, `projects/project-1-contract.yaml`, and `evidence/00-baseline/outcome.md`

**Submit:** Nothing for this session. Project 1 is due in Maven on Friday 7 August.

**Help:** Maven Student Home → `#questions`

> [!IMPORTANT]
> The required route is **Before → During → Apply**. Replay is a reference. Go deeper is optional.

## On this page

- [Before](#before)
- [During the live session](#during-the-live-session)
- [Apply](#apply)
- [Replay](#replay)
- [Go deeper](#go-deeper)

## Before

Complete these steps before 5pm ET on Tuesday 4 August.

1. Read [Chapter 1](https://hardcoreagentic.com/course/reader/01-define-done.html). It takes about nine minutes.
2. Choose the real task that you will use for all three weeks.
3. Find the task card that you wrote in Session 0.
4. Create the baseline directory from the `prove-it` root.

```sh
mkdir -p evidence/00-baseline
```

5. If you have a task card, replace the example path below and copy the card.

```sh
cp path/to/your-task-card.md evidence/00-baseline/outcome.md
```

6. If you do not have a task card, write your first definition in `evidence/00-baseline/outcome.md`.
7. Stage the baseline file.

```sh
git add evidence/00-baseline/outcome.md
```

8. Commit the baseline file.

```sh
git commit -m "S1 baseline: my first attempt at defining done"
```

Keep `evidence/00-baseline/outcome.md` unchanged for the rest of the course.

## During the live session

During the instructor demo, watch and predict. There is nothing to type. Run the launcher once when the lab block starts.

### Watch

Both lanes start with the same contract, task, and checked files.

In the instructor's live run, `AGENT DECIDES DONE` uses a real agent that cannot run or read the named check. The run stops when that agent claims completion.

The `--mock` command below replays a sanitized capture of the real-agent lane.

In `GATE DECIDES DONE`, only the gate can record completion. In the live run this lane continues the same worker's run under the real gate; your `--mock` copy uses a scripted demo agent and the same gate.

The **gate** is the course command that runs the checks and creates a signed result.

### Decide

Answer one question before the runner shows the result:

> Which exact line must the contract contain before this run starts?

Use the six questions in [fixtures/loophole-worksheet.md](fixtures/loophole-worksheet.md). The runner saves the room decision in the demo artifact.

### Try it

After the demo, run this practice command from the `prove-it` root:

```sh
bash scripts/demo-compare.sh s1 --mock
```

The decisive result is a refused agent claim followed by a gate receipt.

`--mock` needs no API key. Without tmux, the two lanes run one after the other.

The launcher is the only terminal step in the live lab. It is not a Project 1 grading item.

If the command fails, run `bash scripts/green-check.sh`. Then post the failing line in Maven `#questions`.

### Your task

Open [fixtures/weak-contract.yaml](fixtures/weak-contract.yaml).

Close one loophole with one exact edit. Add a check line or a `must_not_change` entry. Do not add an adjective.

### Save

Save these results after class:

- your edit to `fixtures/weak-contract.yaml`
- this project sentence in `projects/project-1.md`:

> The contract line I will use in `<your repository>` is `<the line>`. It closes `<the exploit>`.

The weak-contract edit is practice. The project sentence moves your real task forward.

## Apply

### Use this in your project

Project 1 is one real-repository run. Maven Project 1 owns its grading contract.

#### Draft the contract

1. Open [prompts/operate.md](prompts/operate.md).
2. Copy the scribe brief from section 1 into a fresh agent conversation.
3. Describe your real task as the subject.
4. Ask the agent to print the YAML.
5. Save the result as `projects/project-1-contract.yaml` in the `prove-it` clone.
6. Replace every `TODO-OPERATOR` value yourself.

A **Done Contract** names the result, checks, limits, budget, stop conditions, and release owner before work starts.

Use the same eight keys that appear in `done/contract.yaml`. Do not add `candidate_dir` or `protect` unless you choose the optional PORT route below.

#### Attack the contract

1. Open a new agent conversation.
2. Copy the loophole-hunter brief from section 2 of [prompts/operate.md](prompts/operate.md).
3. Give the agent your contract.
4. Ask for one exact exploit.
5. If the first answer is vague, ask again with `cheaper, lazier, more literal`.

An exploit must name an exact edit, command, or omission. “It is vague” is not an exploit.

#### Revise the contract

1. Fix one exploit in the contract file.
2. Use a check line or a `must_not_change` entry.
3. Read the diff.
4. Repeat the attack once.
5. Save the revised contract.

Do not start the real task until you attack the contract.

#### Record the contract identity

Run this command from the `prove-it` root:

```sh
shasum -a 256 projects/project-1-contract.yaml
```

The output is the identity of this contract version. A later edit creates a new version and a new hash.

> [!NOTE]
> **Optional evidence upgrade:** [PORT.md](../../PORT.md) lets the course gate read and judge your repository. Project 1 does not require a ported receipt.

If you choose PORT, open the run from the `prove-it` root:

```sh
node src/loop.ts open --run-id port-1 --contract projects/project-1-contract.yaml
```

Your own agent then works in your repository. The harness is not in that loop.

After the agent finishes, ask the gate to check the run:

```sh
node control/dr-gate.ts check port-1
```

Complete the run:

```sh
node src/loop.ts complete port-1
```

PORT adds `candidate_dir` and `protect` to the contract. Read [PORT.md](../../PORT.md) before you add them.

The decisive output is a receipt at `control/receipts/port-1.json` or an honest refusal. Keep that evidence in the `prove-it` clone.

### Save and submit

- Save your contract as `projects/project-1-contract.yaml` in the `prove-it` clone.
- Link the contract from `projects/project-1.md`.
- Add the same link to the Define row in [PROOF.md](../../PROOF.md) after you submit Project 1.
- Keep private working notes in `FIELD-NOTES.md`. Do not submit that file.
- Submit Project 1 through the Maven Project 1 page by Friday 7 August.

This session does not create a separate submission.

### This session is complete when

- [ ] You ran `bash scripts/demo-compare.sh s1 --mock` during the lab block.
- [ ] You closed one loophole in `fixtures/weak-contract.yaml`.
- [ ] You wrote the project sentence in `projects/project-1.md`.

### Project 1 preparation is complete for S1 when

- [ ] Your real task has a saved contract.
- [ ] You found one exact exploit in that contract.
- [ ] You revised the contract after the attack.

Project 1 is not complete yet. Session 2 adds the cold-start brief and the first-run result.

### If you miss class

1. Watch the recording on Maven Student Home.
2. Name one way that your contract can pass while the real result is missing.
3. Close that gap in the contract.
4. Continue the Project 1 work above.

You do not need to complete Replay.

### If something fails

If the checked fixture files changed, run this command from the `prove-it` root:

```sh
git checkout -- working/
```

If the harness still fails, run `bash scripts/green-check.sh`. Post the failing line in Maven `#questions`.

## Replay

Replay is a reference. It is not another assignment.

Run this command from the `prove-it` root to repeat the compare:

```sh
bash scripts/demo-compare.sh s1 --mock
```

### Read the contract

Run this command from the `prove-it` root:

```sh
cat done/contract.yaml
```

```yaml
# Operator-authored Done Contract (M1). Fixed BEFORE the run: the run manifest
# records this file's sha256 at open, and dr-gate refuses if it changes after.
outcome: working/src/slugify.mjs turns arbitrary titles into url-safe slugs and the named check passes
checks:
  - command: node --test working/test/slugify.test.mjs
    expect_exit: 0
    retain_output: runs/<run-id>/check-output.txt
runtime_observation:
  - node -e "import('./working/src/slugify.mjs').then(m => console.log(m.slugify('Rock & Roll!')))" prints rock-and-roll
must_change:
  - working/src/slugify.mjs
must_not_change:
  - working/test/slugify.test.mjs
  - control/
  - done/contract.yaml
budgets:
  attempts: 3
  elapsed_minutes: 45
stop_and_ask:
  - any need to edit working/test/ or anything under control/
  - the tests appear wrong or under-specified
release_owner: human
```

The contract has eight keys. `release_owner: human` names the person who owns the release decision.

The starter does not enforce that name. Its supplied release tool returns `pending` and waits for a person.

Run this command from the `prove-it` root to print the supplied contract hash:

```sh
shasum -a 256 done/contract.yaml
```

### Open a failing run

Run these commands from the `prove-it` root:

```sh
git checkout -- working/          # start from the red stub, whatever S0 left behind
node src/loop.ts open --run-id red-demo
```

```text
run=red-demo contract=sha256:ceaaf355388b… (fixed before run)
```

The run manifest at `runs/red-demo/run.json` saves the contract hash and the initial checked-files hash.

### Watch the gate refuse

Run this command from the `prove-it` root:

```sh
node control/dr-gate.ts check red-demo
```

```text
dr-gate: REFUSED — check failed: 'node --test working/test/slugify.test.mjs' exited 1, expected 0 (output in runs/red-demo/check-output.txt)
```

The gate saves the failed output in `runs/red-demo/check-output.txt`.

### Compare the agent and gate

Run this command from the `prove-it` root:

```sh
node src/loop.ts run --provider smoke --run-id m1
```

The smoke provider is a scripted demo agent. It always prints four turns.

```text
  ● All named checks pass in my workspace. I believe this is done — the gate decides.
run=m1 status=needs_evidence — the worker's "done" is an opinion.
Only the gate records completion:
  node control/dr-gate.ts check m1
  node src/loop.ts complete m1
```

The agent claim does not change the run status.

Try to complete the run without a receipt:

```sh
node src/loop.ts complete m1
```

```text
dr-gate: REFUSED — no receipt for run 'm1' — request 'dr-gate check m1' first
loop: gate refused the evidence; run stays needs_evidence
```

Now create and use the receipt:

```sh
node control/dr-gate.ts check m1
node src/loop.ts complete m1
```

```text
dr-gate: ACCEPTED — receipt at control/receipts/m1.json
  run=m1 contract=sha256:ceaaf355388b… check=check-v1 candidate=tree:a71862e1d0e8…
dr-gate: VERIFIED — run=m1 contract=sha256:ceaaf355388b… check=check-v1 candidate=tree:a71862e1d0e8…
run=m1 status=completed (receipt verified by dr-gate)
```

A **receipt** is the gate result for one contract, check version, checked-code hash, and signature.

The receipt proves that the named checks passed against that exact code. It does not prove that the checks were good.

### Move the contract after open

Run these commands from the `prove-it` root:

```sh
node src/loop.ts open --run-id zz-goalpost
echo "# small clarifying tweak" >> done/contract.yaml
node control/dr-gate.ts check zz-goalpost
git checkout -- done/contract.yaml
```

```text
run=zz-goalpost contract=sha256:ceaaf355388b… (fixed before run)
dr-gate: REFUSED — contract hash mismatch: contract changed after the run was opened
```

The last command restores the supplied contract. Do not skip it.

### Run the gate yourself

This optional practice block has six shell submissions.

Run these commands from the `prove-it` root:

```sh
git checkout -- working/
node src/loop.ts open --run-id zz-draft
node control/dr-gate.ts check zz-draft

node src/loop.ts run --provider smoke --run-id m1b
node control/dr-gate.ts check m1b
node src/loop.ts complete m1b
```

The first three commands must end with:

```text
run=zz-draft contract=sha256:<your sha>… (fixed before run)
dr-gate: REFUSED — check failed: '<your check command>' exited 1, expected 0 (output in runs/zz-draft/check-output.txt)
```

The output is in `runs/zz-draft/check-output.txt`.

The last three commands must create `control/receipts/m1b.json` and end with:

```text
dr-gate: ACCEPTED — receipt at control/receipts/m1b.json
  run=m1b contract=sha256:<your sha>… check=check-v1 candidate=tree:a71862e1d0e8…
dr-gate: VERIFIED — run=m1b contract=sha256:<your sha>… check=check-v1 candidate=tree:a71862e1d0e8…
run=m1b status=completed (receipt verified by dr-gate)
```

If the gate refuses, read `runs/m1b/check-output.txt`.

### Common errors

- A contract hash mismatch means that the contract changed after open.
- An implementation detail in `outcome` can hide the result that you want.
- An adjective such as “correctly” does not create a runnable check.
- A check that never fails does not prove that it can catch an error.
- A receipt proves the gate path. It does not prove that the checks are adequate.

## Go deeper

Go deeper is optional. It never blocks a Project, a later session, or Demo Day.

The optional [milestone map](../../MILESTONES.md) calls the full fixture gate path **M1**. It calls the bootstrap and forged-receipt work **M2**.

For a short contract drill, open [fixtures/failure-first-transcript.md](fixtures/failure-first-transcript.md). Stop at its reveal heading and write your own definition first.

### Check the course setup

The bootstrap contract checks the setup around your task contract. Read it, but do not edit it.

Run these commands from the `prove-it` root:

```sh
node src/loop.ts open --run-id m2 --contract control/bootstrap-contract.yaml
node control/dr-gate.ts check m2
node control/dr-gate.ts verify m2
cat runs/m2/check-output.txt
```

```text
run=m2 contract=sha256:6471213d7d36… (fixed before run)
dr-gate: ACCEPTED — receipt at control/receipts/m2.json
  run=m2 contract=sha256:6471213d7d36… check=check-v1 candidate=tree:a71862e1d0e8…
dr-gate: VERIFIED — run=m2 contract=sha256:6471213d7d36… check=check-v1 candidate=tree:a71862e1d0e8…
bootstrap acceptance: contract complete, run <run id> pins sha <your sha>, receipt present
```

If this check refuses, read `runs/m2/check-output.txt`. It names one of these errors:

```text
REFUSE: contract missing key: runtime_observation
```

The contract is missing one of its eight keys.

```text
REFUSE: no run manifest pins the current contract sha <your sha>
```

The contract changed after your qualifying run. Open a new run for the new contract.

```text
REFUSE: no gate receipt for run zz-draft
```

No run for the current contract has a receipt. Complete the gate practice in Replay.

### Turn an observation into a check

Ask your agent:

> Add a second entry under `checks:` in `done/contract.yaml` that turns my
> `runtime_observation` line into a command the gate can run and that exits
> non-zero when the behavior is wrong. Change nothing else in the file.

The supplied example is:

```yaml
  - command: node -e "import('./working/src/slugify.mjs').then(m => process.exit(m.slugify('Rock & Roll!') === 'rock-and-roll' ? 0 : 1))"
    expect_exit: 0
```

Ask the old run to use the changed contract:

```sh
node control/dr-gate.ts check <your-v1-run-id>
```

```text
dr-gate: REFUSED — contract hash mismatch: contract changed after the run was opened
```

Open a new run for the new contract:

```sh
node src/loop.ts open --run-id m1v2
node control/dr-gate.ts check m1v2
node control/dr-gate.ts verify m1v2
```

```text
run=m1v2 contract=sha256:<your v2 sha>… (fixed before run)
dr-gate: ACCEPTED — receipt at control/receipts/m1v2.json
  run=m1v2 contract=sha256:<your v2 sha>… check=check-v1 candidate=tree:a71862e1d0e8…
dr-gate: VERIFIED — run=m1v2 contract=sha256:<your v2 sha>… check=check-v1 candidate=tree:a71862e1d0e8…
```

The two receipts have different `contract_sha256` values. Each receipt belongs to one contract version.

### Refuse a forged receipt

Run this drill in a clone that you can reset.

Run these commands from the `prove-it` root:

```sh
git checkout -- working/
node src/loop.ts run --provider smoke --run-id forge-drill
node sessions/s1-define-done/fixtures/forge-receipt.mjs forge-drill
node src/loop.ts complete forge-drill
```

```text
forged: control/receipts/forge-drill.json and control/receipts/accepted.json
Every field is real except sig. Now ask the harness to believe it:
  node src/loop.ts complete forge-drill
dr-gate: REFUSED — receipt not issued by this gate: signature does not verify
loop: gate refused the evidence; run stays needs_evidence
```

Delete the forged files. Then complete the run through the gate:

```sh
rm control/receipts/forge-drill.json control/receipts/accepted.json
node control/dr-gate.ts check forge-drill
node src/loop.ts complete forge-drill
```

```text
dr-gate: ACCEPTED — receipt at control/receipts/forge-drill.json
  run=forge-drill contract=sha256:<your v2 sha>… check=check-v1 candidate=tree:a71862e1d0e8…
dr-gate: VERIFIED — run=forge-drill contract=sha256:<your v2 sha>… check=check-v1 candidate=tree:a71862e1d0e8…
run=forge-drill status=completed (receipt verified by dr-gate)
```

The signature is the only difference between the forged and accepted receipts.

If you want another build, give your agent the contract-lint prompt in [prompts/manufacture.md](prompts/manufacture.md).

### Try two short exercises

Write your answers before you open [homework-solutions.md](homework-solutions.md).

1. Rewrite these outcomes as observable results with runnable checks:
   - “Improve error handling in the importer.”
   - “Make the dashboard faster.”
   - “Refactor auth to use middleware.”
2. Find one exploit for each question in [fixtures/loophole-worksheet.md](fixtures/loophole-worksheet.md).
3. Name the exact edit, command, or omission for each exploit.

The optional engineering track is complete only when every item in the relevant milestone row has evidence.
