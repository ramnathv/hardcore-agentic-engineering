# Session 0 — operating prompts

Session 0 has no attack drills (S1) and no interrupts (S2). Tonight you
operate the smoke/real distinction, the honest-failure paths, and a
read-only diagnosis brief for when setup breaks. Core banks:
`prompts/interrupts.md`, `prompts/attack-briefs.md`,
`prompts/rebrief-after-kill.md`.

---

## 1. The first real provider turn (run this yourself, not via an agent)

```sh
node src/loop.ts run --provider claude-cli --run-id real-turn
# or: --provider codex-cli
```

What to watch for, in order:

1. First line: `run=real-turn contract=sha256:ceaaf355388b… (fixed before
   run)` — the contract pin happens before the model is even contacted.
2. One `●` text turn: the model proposes an implementation. No `⏺` tool
   lines. The starter adapter is deliberately one text-only turn; the
   harness owns all tool execution, and bridging real tools is M3.
3. `run=real-turn status=needs_evidence` with budget `"used": 0` in
   `view real-turn` — a live model spoke, nothing changed, nothing
   completed.

Smoke tests harness plumbing, and the real provider tests the wire. Neither is
evidence of task completion. This real-provider turn is optional and does not
need to pass the gate.

## 2. The honest missing-capability drill

Run the real-provider command on a PATH without the binary:

```sh
env PATH="$(dirname "$(command -v node)"):/usr/bin:/bin" \
  node src/loop.ts run --provider claude-cli --run-id absent
```

Expected, and required (eval case `fixtures/eval/cases/04-missing-capability.yaml`):

```text
provider 'claude-cli' unavailable: 'claude' not found on PATH.
No silent fallback. Use --provider smoke (keyless) or install claude.
```

exit 1. If this command ever quietly produces a smoke-style scripted run
instead, that is a harness bug worth a regression case: a missing
capability says so loudly, never silently claims it.

## 3. Probe expectations on your machine

```sh
bash scripts/probe.sh
```

The supplied baseline (macOS or Linux, no OS sandbox): rows 2, 3, 4 and 6
REFUSED by tool-layer policy, row 1 ALLOWED, row 5 UNSUPPORTED, closing
lines `contained: 0 of 6.` and `UNSUPPORTED IS NOT CONTAINED`. Operate it
like an instrument, not a test to pass:

- Same output as baseline → write "matches baseline; tool-layer refusals
  only, no OS containment" in FIELD-NOTES.md.
- Any row differs → that difference is your first field observation.
  Record the row, the label, and your best one-sentence hypothesis. Do not
  "fix" the probe to match the baseline.

## 4. Read-only diagnosis brief — when green-check fails on a student machine

Paste into your agent, verbatim except the output block. Modeled on
`prompts/read-only-diagnosis.md`; same posture: narrow tools, compact
evidence report, no fixes.

> Repo: this prove-it checkout. Read-only diagnosis task. `bash
> scripts/green-check.sh` fails on this machine; full output pasted below.
> Do not edit any file. Do not re-run anything except: `node --version`,
> `bash sessions/s0-setup/fixtures/readiness.sh`, and re-running
> `bash scripts/green-check.sh` at most once.
>
> Deliver a report of at most 10 lines:
> 1. The first ❌ line and which of the eight green-check claims it breaks.
> 2. The most likely cause, citing a file:line in scripts/green-check.sh or
>    a readiness row — mark it read-verified or inferred.
> 3. The smallest fix, as a command I run myself. If the fix would touch
>    `control/`, `src/`, or `working/test/`, say STOP-AND-ASK instead.
>
> Evidence over narrative. Do not edit files.
>
> ```
> [paste the full green-check output here]
> ```

Operator checks afterward: `git status --short` is empty (the fence held);
the proposed fix names a command, not a vibe; you ran the fix yourself and
re-ran green-check to 8/8.

## 5. Reset to red (end of every Session 0 work block)

```sh
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs
find runs -mindepth 1 ! -name .gitkeep -delete
find control/receipts -name '*.json' -delete
node --test working/test/slugify.test.mjs   # must fail: the honest red state
```

The re-run of the failing check is not optional — the reset is only proven
by the red. Session 1 assumes you start here.
