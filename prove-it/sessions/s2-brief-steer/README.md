# Session 2: Brief and steer a durable run

*Make corrections survive.*

A chat correction disappears. A fact in the rider survives.

**Course outcome:** Brief

**Do before class:** Read Chapter 2 and bring one fact that your agent cannot know.

**Do in class:** Watch one compare, run the launcher once, write your fact, and record an interrupt.

**Finish for Project 1:** Add the fact and its stop condition to your rider. Run a fresh agent from the goal and rider.

**Save:** `projects/project-1.md`, `projects/project-1-goal.md`, `projects/project-1-rider.md`, and `projects/project-1-evidence/first-run.md`

**Submit:** Project 1 in Maven by Friday 7 August

**Help:** Maven Student Home → `#questions`

> [!IMPORTANT]
> The supplied interrupt records where the run stopped. It does not record your fact. Write the fact on the bet card and in your rider.

## On this page

- [Before](#before)
- [During the live session](#during-the-live-session)
- [Apply](#apply)
- [Replay](#replay)
- [Go deeper](#go-deeper)

## Before

Complete these steps before 5pm ET on Thursday 6 August.

1. Read [Chapter 2](https://hardcoreagentic.com/course/reader/02-brief-steer.html). It takes about eight minutes.
2. Bring the contract for your real task from Session 1.
3. Bring one true fact about your repository that the agent cannot read from the files.

For example, a queue can be read-only in one environment even when the code does not say so.

## During the live session

During the instructor demo, watch and predict. There is nothing to type. Run the launcher once when the lab block starts.

### Watch

Both lanes start with the same short brief and no previous chat.

In the instructor's live run, `EPHEMERAL CORRECTION` uses two fresh Claude processes.

After the first run, the operator states a correction but saves it nowhere. No Claude process receives that correction.

The `--mock` command below replays a sanitized capture of the two real-agent runs.

In `DURABLE RUN EVENT`, the live run resumes the same interrupted worker with the correction recorded as a run event; your `--mock` copy uses a scripted demo agent that stops and resumes. The real run log records the interrupt position in both.

A **run log** is the ordered event file at `runs/<run-id>/events.jsonl`. It remains after the command stops.

An **interrupt** stops a run and records the stop position in that log.

The supplied event records `after_turn`. It does not record the fact that caused the interrupt.

### Decide

Answer one question at the pause:

> Does this new fact correct the route, or change the definition of done?

In the supplied starter, put a route correction in the rider. A changed result needs a new contract version.

An optional Go deeper build can also save the fact in the run log.

### Try it

After the demo, run this practice command from the `prove-it` root:

```sh
bash scripts/demo-compare.sh s2 --mock
```

The decisive result is the second fresh agent repeating the old premise in the left lane.

The right lane resumes from its event log. `--mock` needs no API key.

The launcher is the shared compare step. The interrupt below is your personal action. Neither is a Project 1 grading item.

### Your task

1. Open [fixtures/injected-facts.md](fixtures/injected-facts.md).
2. Choose one card.
3. Read only its `World truth` line.
4. Open [prompts/operate.md](prompts/operate.md).
5. Write the fact on the four-line bet card.
6. If `s2-steer` exists, replace it with a fresh run ID in the next two commands.
7. Run the interrupt from the `prove-it` root.

```sh
node src/loop.ts run --provider smoke --run-id s2-steer --interrupt-after 2
```

8. Read the interrupt event.

```sh
grep run.interrupted runs/s2-steer/events.jsonl
```

9. Restore the failing fixture.

```sh
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs
```

The `grep` output contains `after_turn`. It does not contain your fact.

The final command restores the failing fixture for the next run.

### Save

Save these results:

- the fact on your bet card
- the same fact in `projects/project-1-rider.md`
- a stop condition that catches the wrong premise

Example:

> The legacy queue is read-only in this environment. Stop and rebrief if a plan writes to it.

The bet card is a temporary working note. The rider is the durable Project artifact.

## Apply

### Use this in your project

Project 1 uses the contract for your real task. Maven Project 1 owns the grading contract.

#### Write the goal and rider

A **goal** states the result and operating limits. A **rider** holds the detailed context that a fresh agent needs.

1. Read your Project 1 contract.
2. Write a short goal that states the result and operating limits.
3. Write a rider that gives a fresh agent the context it needs.
4. Add your bet-card fact to the rider.
5. Add the matching stop condition.
6. Save the goal as `projects/project-1-goal.md` in the `prove-it` clone.
7. Save the rider as `projects/project-1-rider.md` in the `prove-it` clone.

Maven does not grade a fixed rider template or character limit. The optional engineering format is under [Go deeper](#try-the-optional-brief-format).

#### Run a fresh agent

1. Start a fresh agent with no previous chat.
2. Give it only your goal and rider.
3. Read its first tool action.
4. Save that action in `projects/project-1-evidence/first-run.md`.
5. If the agent uses a wrong premise, stop it.
6. Add the corrective fact to the rider.
7. If you revise the brief, run the task again from it.
8. Run the check that your contract names.
9. Save the final result in `projects/project-1-evidence/first-run.md`.

A **fresh agent** starts without earlier conversation context. This makes the written brief carry the work.

> [!NOTE]
> **Optional evidence upgrade:** If you want the gate to judge your repository, use [PORT.md](../../PORT.md). Project 1 does not require this receipt.

If you already opened a PORT run, use the same run ID. Do not open a duplicate run.

If you choose PORT, open the run before your agent starts:

```sh
node src/loop.ts open --run-id p1 --contract projects/project-1-contract.yaml
```

After the agent finishes, ask the gate to check the run:

```sh
node control/dr-gate.ts check p1
```

Complete the run:

```sh
node src/loop.ts complete p1
```

The decisive result is a receipt in `control/receipts/` or an honest refusal. The harness never writes to your repository.

### Save and submit

- Save the goal as `projects/project-1-goal.md` in the `prove-it` clone.
- Save the rider as `projects/project-1-rider.md` in the `prove-it` clone.
- Save the first tool action and first-run result in `projects/project-1-evidence/first-run.md`.
- Link `projects/project-1-evidence/first-run.md` from `projects/project-1.md`.
- Link the cold-start brief from the Brief row in [PROOF.md](../../PROOF.md) after submission.
- Keep private notes in `FIELD-NOTES.md`. Do not submit that file.
- Submit a link to `projects/project-1.md` in Maven Project 1 by Friday 7 August.

Project 1 uses these five headings:

```markdown
## The result I attempted
## The contract, fixed before the run started
## The cold-start brief I gave the agent
## What the first run actually did
## The doubt I still have
```

### This session is complete when

- [ ] You ran `bash scripts/demo-compare.sh s2 --mock` during the lab block.
- [ ] You wrote one hidden fact on the bet card.
- [ ] You recorded an interrupt and found that the event lacks the fact.
- [ ] You added the fact and stop condition to your rider.

### Project 1 is complete when

- [ ] Your submission names the result that you attempted.
- [ ] It includes the contract that you fixed before the run started.
- [ ] It includes the cold-start brief that you gave the agent.
- [ ] It says what the first run actually did.
- [ ] It names one doubt that you still have.

Submit Project 1 through Maven. A truthful refusal is a valid result.

### If you miss class

1. Watch the recording on Maven Student Home.
2. Name the first premise that your fresh agent gets wrong.
3. Add that fact and its stop condition to the rider.
4. Continue the Project 1 work above.

You do not need to complete Replay.

### If something fails

If the fixture stays passing after the interrupt drill, run this command from the `prove-it` root:

```sh
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs
```

If the harness still fails, run `bash scripts/green-check.sh`. Post the failing command and output in Maven `#questions`.

## Replay

Replay is a reference. It is not another assignment.

Run this command from the `prove-it` root to repeat the compare:

```sh
bash scripts/demo-compare.sh s2 --mock
```

### Create the worked run

Run this command from the `prove-it` root:

```sh
bash sessions/s2-brief-steer/fixtures/make-steering-run.sh
```

```text
runs/fx-steering ready. Walk the log, then project it:
```

The script creates `runs/fx-steering/run.json` and its supplied event log.

### Read the run identity

Run this command from the `prove-it` root:

```sh
head -1 runs/fx-steering/events.jsonl
```

```text
{"id":1,"run":"fx-steering","ts":"2026-08-06T20:04:11.000Z","type":"run.requested","actor":"operator","data":{"contract_path":"done/contract.yaml","contract_sha256":"9d2f31c0aa41e6b7c55d1e0f4a8b9c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b","candidate_tree":"tree:31b2a9","attempts":3}}
```

`run.requested` records the contract and checked-files identities before the first turn.

### Read the durable correction

Run these commands from the `prove-it` root:

```sh
grep plan.rejected runs/fx-steering/events.jsonl
grep run.rebriefed runs/fx-steering/events.jsonl
```

```text
{"id":3,"run":"fx-steering","ts":"2026-08-06T20:04:40.000Z","type":"plan.rejected","actor":"operator","data":{"fact":"the legacy queue is read-only in this environment"}}
{"id":4,"run":"fx-steering","ts":"2026-08-06T20:05:02.000Z","type":"run.rebriefed","actor":"operator","data":{"rider":"v2 — retries go through the outbox table; legacy queue is out of bounds"}}
```

This supplied log records the fact. The required `--interrupt-after` command does not.

### Measure the worked goal

Run this command from the `prove-it` root:

```sh
wc -m prompts/goal-m03.md
```

```text
1665 prompts/goal-m03.md
```

The goal stays short because the rider contains the detailed context.

### Interrupt and resume

Run this command from the `prove-it` root:

```sh
node src/loop.ts run --provider smoke --run-id s2-live --interrupt-after 2
```

The smoke provider is a scripted demo agent. It stops after turn 2.

```text
run=s2-live interrupted after turn 2. Resume with:
  node src/loop.ts resume s2-live
```

Read the saved status:

```sh
node src/loop.ts view s2-live | grep status
```

```text
  "status": "interrupted",
```

Resume from the event log:

```sh
node src/loop.ts resume s2-live
```

The runner continues from turn 3. It does not repeat the first two turns.

```text
  ● All named checks pass in my workspace. I believe this is done — the gate decides.
run=s2-live status=needs_evidence — the worker's "done" is an opinion.
Only the gate records completion:
  node control/dr-gate.ts check s2-live
  node src/loop.ts complete s2-live
```

Close the run and restore the fixture:

```sh
node control/dr-gate.ts check s2-live
node src/loop.ts complete s2-live
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs
```

The decisive output is:

```text
run=s2-live status=completed (receipt verified by dr-gate)
```

The final command restores the failing fixture.

### Run the full durable lane

This optional block has eight shell submissions, including the compare launcher.

If `s2-steer` already exists, use a fresh run ID.

```sh
bash scripts/demo-compare.sh s2 --mock
node src/loop.ts run --provider smoke --run-id s2-steer --interrupt-after 2
grep run.interrupted runs/s2-steer/events.jsonl
node src/loop.ts view s2-steer | grep status
node src/loop.ts resume s2-steer
node control/dr-gate.ts check s2-steer
node src/loop.ts complete s2-steer
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs
```

The log must show one `run.interrupted` event. The final status must be `completed`.

### Common errors

- A chat correction is not in the run log.
- A large goal hides the result and stop conditions.
- “Try again” adds no new fact.
- A changed result needs a new contract, not a steer.
- The supplied interrupt position is durable, but its cause is not.

## Go deeper

Go deeper is optional. It never blocks a Project, a later session, or Demo Day.

The optional [milestone map](../../MILESTONES.md) calls the goal-and-rider manifest extension **M3**. It calls the control-command extensions **M4**.

The supplied required path does not complete either milestone.

### Try the optional brief format

This optional M3 format keeps the goal short and moves detailed context into the rider.

1. Open `prompts/goal-m03.md` and `prompts/rider-m03.md`.
2. Use them as the shape for your own files.
3. Name one working reference.
4. Name one intentional difference from that reference.

The optional rider format has six sections:

- Context
- Live evidence
- Focus files
- Deliverable, with three items at most
- Fences
- Stop-when

Measure your goal from the `prove-it` root:

```sh
wc -m projects/project-1-goal.md
```

If the result is more than 4,000, move details from the goal to the rider.

### Project the event log

Run this command from the `prove-it` root:

```sh
node src/loop.ts view fx-steering
```

```json
{
  "run": "fx-steering",
  "status": "running",
  "contract": "9d2f31c0aa41e6b7c55d1e0f4a8b9c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
  "candidate_at_request": "tree:31b2a9",
  "receiptVerified": false
}
```

The view comes from the event log. You can delete and rebuild the view.

Read the accepted plan version:

```sh
node src/loop.ts view fx-steering --full | grep planVersion
```

```text
  "planVersion": 1,
```

Rejected plans do not increase `planVersion`.

### Crash after tool dispatch

Run this drill and its recovery together. The recovery restores the fixture.

Run this command from the `prove-it` root:

```sh
PROVE_IT_CRASH_AT_TOOL=3 node src/loop.ts run --provider smoke --run-id s2-crash
```

```text
  ✖ simulated crash after dispatching 'run_check' (fixture)
```

The command exits with code 9. Read the status:

```sh
node src/loop.ts view s2-crash | grep status
```

```text
  "status": "needs_reconcile",
```

`needs_reconcile` means that the harness does not know whether the action happened.

Try a resume without a decision:

```sh
node src/loop.ts resume s2-crash
```

```text
run=s2-crash has a PENDING action dispatched but never recorded:
  tool=run_check args={}
The side effect may or may not have happened. Decide, then resume:
  loop resume s2-crash --reconcile ok|failed|in_doubt
  loop cancel s2-crash --reason "..."
```

Run the pending check by hand:

```sh
node --test working/test/slugify.test.mjs
```

```text
not ok 2 - ampersand becomes and
…
# fail 1
```

Record the result and finish the run:

```sh
node src/loop.ts resume s2-crash --reconcile failed
node control/dr-gate.ts check s2-crash
node src/loop.ts complete s2-crash
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs
```

The decision becomes an operator-authored `tool.result` event.

### Build fact-carrying interrupts

The supplied interrupt cannot record a fact. The third build prompt adds `interrupt --fact`.

Open [prompts/manufacture.md](prompts/manufacture.md). It contains three goal-and-rider pairs.

1. P1 adds goal and rider references to the run manifest.
2. P2 adds a real plan-approval decision.
3. P3 adds `interrupt` with a required `--fact`.
4. Run each prompt’s `Done when` commands.
5. Commit between runs.
6. Run `npm test` after P3.

After P1 to P3 pass, run this optional fact-carrying drill from the `prove-it` root:

```sh
node src/loop.ts run --provider smoke --run-id s2-steer-p3
# your P2 made run stop at plan.proposed, so the turns start under approve:
node src/loop.ts approve s2-steer-p3 --turn-delay-ms 1500 &
sleep 2
node src/loop.ts interrupt s2-steer-p3 --fact "<your one sentence>"
wait
grep run.interrupted runs/s2-steer-p3/events.jsonl
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs
```

The `grep` output must show your sentence in `fact`.

### Add rejected facts to the view

Ask your agent to add these fields to `src/runview.ts`:

- `rejectedFacts: string[]` from `plan.rejected`
- `cancelReason: string | null` from `run.cancelled`

Do not remove or rename an existing `RunView` field.

Run these commands from the `prove-it` root:

```sh
bash sessions/s2-brief-steer/fixtures/make-steering-run.sh
node src/loop.ts view fx-steering --full
node src/loop.ts run --provider smoke --run-id s2-cancel --interrupt-after 1
node src/loop.ts cancel s2-cancel --reason "premise failed twice: rebriefing"
node src/loop.ts view s2-cancel --full
npm test
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs
```

The first view must contain the rejected fact. The second view must contain the cancel reason.

### Try three short exercises

Rewrite this steer as one fact and one stop condition:

> "I think there might be an issue with the approach you're taking here. If
> you look carefully at the CI logs you'll notice that the errors are about
> packages, but I'm fairly confident I ran the build on my machine this
> morning and it worked, so maybe the problem isn't really the packages
> themselves but something else? Could you maybe double-check whether the
> packages are actually missing, and also consider whether CI might be
> configured differently, and let me know what you think?"

The source is deliberately poor. Preserve it as the input, not as course instructions.

Then complete these two exercises:

1. Adapt `prompts/goal-m03.md` to your task and keep it under 4,000 characters.
2. Read `fixtures/events/steering.jsonl` and answer these questions:
   - Which premise did the operator reject?
   - What is the final `planVersion`?
   - What action is pending at the end?
   - Why is event 10 a steer instead of a changed contract?
   - What status follows if the process stops after event 8?

Then run these commands from the `prove-it` root:

```sh
bash sessions/s2-brief-steer/fixtures/make-steering-run.sh
node src/loop.ts view fx-steering --full
```

Compare the view with your answers. Save optional notes in `FIELD-NOTES.md`.

The optional engineering track is complete only when every item in the relevant milestone row has evidence.
