# Session 0: Setup and catch-up

*Set up the course harness.*

Before Session 1, prove that the course harness runs on your computer.

> [!IMPORTANT]
> Session 0 is self-serve. Finish the four setup tasks before Tuesday 4 August.
> Nothing here needs an API key or another student.

- **Time:** About 30 minutes
- **Work in:** The `prove-it` root
- **Save:** `your-task-card.md`
- **Finish in:** Maven Student Home
- **Help:** Maven Student Home → `#questions`

## On this page

- [Before](#before)
- [Set up](#set-up)
- [Apply](#apply)
- [Replay](#replay)
- [Go deeper](#go-deeper)

## Before

The **harness** is the small course program that runs an agent and records its
work. The **gate** runs the agreed checks outside the agent. A **receipt** is
the signed JSON file that records what the gate checked.

You need:

- Node 22.18 or newer
- Bash
- this repository on the computer that you will use for the course

Clone the repository. Then enter the `prove-it` directory.

```sh
git clone https://github.com/specstoryai/hardcore-agentic-engineering.git
cd hardcore-agentic-engineering/prove-it
```

Node runs the TypeScript files directly. There is no install or build step.

### Windows and Linux

Linux works as written. Linux temporary paths begin with `/tmp/` instead of
the macOS `/var/folders/` path shown in some examples.

On Ubuntu and Debian, `apt install nodejs` installs a version far older than
the course needs. Install Node 22.18 or newer with nvm or from nodesource.com.
If your machine has no `shasum`, use `sha256sum` — the output is identical.

On Windows, use WSL2 with Ubuntu. Native PowerShell and Command Prompt cannot
run the course scripts.

1. Open PowerShell as an administrator.
2. Install WSL2.

   ```powershell
   wsl --install -d Ubuntu
   ```

3. Restart Windows.
4. Open the WSL shell.
5. Install Node 22.18 or newer inside WSL.
6. Clone the repository inside your WSL home directory.
7. Run every course command from the WSL shell.

Do not clone the repository under `/mnt/c/`. File operations are much slower
there.

If Git Bash fails, switch to WSL2. The course is tested with Bash on a POSIX
file system.

## Set up

### 1. Run readiness

Run this command from the `prove-it` root.

```sh
bash sessions/s0-setup/fixtures/readiness.sh
```

The required rows must say `READY`. A provider CLI is the installed command
for Claude Code or Codex. Its row can say `ABSENT` today.

```text
prove-it Session 0 readiness — every row is an actual attempt

  READY    node v22.<…> (need >= 22.18)
  READY    TypeScript runs directly: no flag, no build step
  READY    starter layout intact (gate, key, contracts, checks, scripts)
  READY    runs/ writable — events.jsonl can be appended
  PRESENT  git (<…>) — resets and the real-repo transfer use it
  ABSENT   claude CLI — smoke is keyless and enough for the required path;
           an optional real-provider turn is available under Go deeper
  ABSENT   codex CLI — smoke is keyless and enough for the required path;
           an optional real-provider turn is available under Go deeper
  INFO     no OS sandbox is wired in the starter; a later task probes
           what that means (scripts/probe.sh).

readiness: all required rows READY. Next: bash scripts/green-check.sh
```

If a row says `BLOCKED`, install Node 22.18 or newer. Then run readiness
again.

### 2. Run the whole harness

Run this command from the `prove-it` root.

```sh
bash scripts/green-check.sh
```

The last line must say:

```text
green check: 8 passed, 0 failed.
```

This command uses a temporary copy. It does not change your checkout.

The eight results prove that:

- the starting check fails
- the scripted demo agent completes its turns
- the named check passes after the run
- the gate creates a receipt
- the receipt permits completion
- a forged receipt fails
- an old receipt fails after the checked files change
- the supplied contract parses

The command does not test operating-system containment. Replay explains that
limit.

### 3. Create your task card

Choose one real task from a repository that you use. You will use the same
task for all three weeks.

Copy the task-card template.

```sh
cp sessions/s0-setup/fixtures/real-repo-task-card.md your-task-card.md
```

Fill every field. Keep the finished card under 2,000 characters.

```sh
wc -m < your-task-card.md
```

In a shell without a UTF-8 locale, `wc -m` counts bytes and reads slightly
high — so a count that passes is safely under the limit.

Paste the exact check command into the card. Run that command and make sure
that it fails today.

If the command passes, choose a task that is not complete.

If you use a coding agent, Prompt 3 in
`sessions/s0-setup/prompts/manufacture.md` can draft the card. Read the result
and correct every wrong fact.

### 4. Finish in Maven

Open Maven Student Home.

1. Mark setup complete.
2. Complete the pre-course reflection.

### This session is complete when

- [ ] Readiness shows every required row as `READY`.
- [ ] The green check prints `8 passed, 0 failed`.
- [ ] `your-task-card.md` is under 2,000 characters.
- [ ] The task-card check fails today.
- [ ] Maven shows setup and the reflection as complete.

### If something fails

Post the command and its output in Maven `#questions`.

Include:

- the step number
- what you expected
- what happened
- the smallest privacy-safe evidence that you can share

Greg checks Maven questions at least once each working day. Tag Greg when you
are blocked.

## Apply

The task card is the only Session 0 file that continues into the course.

Bring these items to Session 1:

- the computer that passed the green check
- the same repository clone
- `your-task-card.md`

Session 1 turns the task card into a Done Contract. Project 1 uses that
contract and a brief for a fresh agent.

The required setup leaves `working/` in its original failing state. It also
leaves `runs/` empty.

## Replay

Replay is a reference. It is not another assignment.

Use this section when you want to run each part of the gate by hand.

### Start with a failing check

Run this command from the `prove-it` root.

```sh
node --test working/test/slugify.test.mjs
```

The decisive lines are:

```text
# pass 0
# fail 3
```

The command exits with status 1. The starting files are wrong on purpose.

If the check passes, restore the starting files.

```sh
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs
rm -rf runs/first
```

### Run the scripted demo agent

The smoke provider is a scripted demo agent. It needs no key or network.

```sh
node src/loop.ts run --provider smoke --run-id first
```

The run ends with:

```text
run=first status=needs_evidence — the worker's "done" is an opinion.
Only the gate records completion:
  node control/dr-gate.ts check first
  node src/loop.ts complete first
```

Run the named check again.

```sh
node --test working/test/slugify.test.mjs
```

The decisive lines now are:

```text
# pass 3
# fail 0
```

### Ask the gate

```sh
node control/dr-gate.ts check first
```

The gate creates the receipt:

```text
dr-gate: ACCEPTED — receipt at control/receipts/first.json
  run=first contract=sha256:ceaaf355388b… check=check-v1 candidate=tree:a71862e1d0e8…
```

Read the receipt.

```sh
cat control/receipts/first.json
```

The receipt records:

- the run ID
- the contract hash
- the check version
- the checked code snapshot
- the check command and exit status
- the gate signature

These values must still match when the run completes.

### Complete the run

```sh
node src/loop.ts complete first
node src/loop.ts view first
```

The decisive lines are:

```text
dr-gate: VERIFIED — run=first contract=sha256:ceaaf355388b… check=check-v1 candidate=tree:a71862e1d0e8…
run=first status=completed (receipt verified by dr-gate)
```

`complete` does not decide that the work is correct. It asks the gate to
read the receipt. The status changes only after the gate accepts it.

### Read the containment report

**Containment** means that the operating system stops code from reaching
files, processes, or networks outside its allowed area.

Save the probe output.

```sh
mkdir -p s0-evidence
bash scripts/probe.sh | tee s0-evidence/probe.txt
```

The decisive footer is:

```text
4 of 6 refused by tool-layer policy · 0 of 6 contained by the OS.
No OS sandbox is active on this host: UNSUPPORTED IS NOT CONTAINED.
An uncontained run may be observed; it must not complete autonomously.
```

The tool policy refuses four actions. The operating system contains none of
them. A policy refusal is not an operating-system sandbox.

### Read the run identity

```sh
head -1 runs/first/events.jsonl
```

The first event records the contract hash and checked code snapshot before
the agent takes a turn.

### Try two receipt attacks

First, change one hexadecimal character in `sig` inside
`control/receipts/first.json`.

Then run:

```sh
node control/dr-gate.ts verify first
```

The gate refuses the forged receipt:

```text
dr-gate: REFUSED — receipt not issued by this gate: signature does not verify
```

Restore the receipt.

```sh
node control/dr-gate.ts check first
```

Next, change the checked files after the gate creates the receipt.

```sh
cp working/src/slugify.mjs /tmp/slugify-green.mjs
echo "// drift" >> working/src/slugify.mjs
node control/dr-gate.ts verify first
cp /tmp/slugify-green.mjs working/src/slugify.mjs
```

The gate refuses the old receipt:

```text
dr-gate: REFUSED — receipt stale: candidate tree mismatch
```

The fix is a new check and a new receipt for the new files.

### Reset the checkout

> [!CAUTION]
> The reset deletes run records and JSON receipts from this checkout. Copy
> any evidence that you want to keep before you run it.

```sh
cp runs/first/events.jsonl control/receipts/first.json s0-evidence/
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs
find runs -mindepth 1 ! -name .gitkeep -delete
find control/receipts -name '*.json' -delete
node --test working/test/slugify.test.mjs
```

The reset is complete when the check returns to:

```text
# pass 0
# fail 3
```

## Go deeper

Go deeper is optional. It never blocks a Project, a later session, or Demo
Day.

### Try a real provider

A real provider is the installed Claude Code or Codex command-line program.
The adapter asks it for one text-only turn.

Run one of these commands from the `prove-it` root:

```sh
mkdir -p s0-evidence
node src/loop.ts run --provider claude-cli --run-id real-turn 2>&1 | tee s0-evidence/real-turn.txt
# or: --provider codex-cli
```

If the provider is missing, the harness stops. It does not switch to smoke.

```text
provider 'claude-cli' unavailable: 'claude' not found on PATH.
No silent fallback. Use --provider smoke (keyless) or install claude.
```

If the provider runs, the harness records one text response. The provider can
use its own tools outside the harness tool policy.

The gate still judges the checked files, not the quality of the response.

Save the event log before you delete the run.

```sh
cp runs/real-turn/events.jsonl s0-evidence/real-turn-events.jsonl
rm -rf runs/real-turn/
```

### Use the Maven lessons

The lightning lessons and catch-up material live in Maven Student Home.

Start with **Definition of Done**. Maven records completion. There is nothing
else to submit.
