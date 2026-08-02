# Session 0 homework — worked solutions

Every output here was produced by actually
running the commands against the core; where your run ids and timestamps
differ, the shapes and the two stable hashes
(`sha256:ceaaf355388b…`, `tree:a71862e1d0e8…`) must not.

## The required tasks and the walkthrough — what "correct" looks like

Every task and walkthrough step has its expected output inline in the session README; the checks
below are the fast way to confirm yours match.

```sh
bash sessions/s0-setup/fixtures/readiness.sh; echo "exit=$?"     # exit=0
bash scripts/green-check.sh | tail -2
#   green check: 8 passed, 0 failed.
#   Containment was NOT tested here — run scripts/probe.sh for the honest report.
wc -l runs/first/events.jsonl                # 24 (22 if you stopped after step 2)
node src/loop.ts view first \
  | grep -E 'status|receiptVerified'
#   "status": "completed",        (after gate + complete)
#   "receiptVerified": true
bash scripts/probe.sh | tail -3
#   4 of 6 refused by tool-layer policy · 0 of 6 contained by the OS.
#   No OS sandbox is active on this host: UNSUPPORTED IS NOT CONTAINED.
#   An uncontained run may be observed; it must not complete autonomously.
```

The provider drill (Go deeper), both acceptable outcomes:

- Provider present: one `●` text turn, no `⏺` tool lines, run ends
  `needs_evidence`, and `view real-turn --full` shows budget `"used": 0`
  (the default view trims budgets). The model typically
  proposes the correct `&`-aware regex chain — note that its proposal
  changed nothing on disk; that separation (model proposes, harness owns
  tools) is the M3 seam.
- Provider absent: exit 1 with
  `provider 'claude-cli' unavailable: 'claude' not found on PATH.` /
  `No silent fallback. …` retained in your notes plus an install-by date.

Task 3, a filled card that clears the bar (redacted example):

> Repo: billing-svc (alias). Task: expired-card retries stop after 3
> attempts. Observable result: a fixture invoice with an expired card gets
> exactly 3 retry events, then `status=abandoned`. Check:
> `pytest tests/test_retry.py -k expired_card` exits 0. Today: exits 1
> (test written, behavior missing). Blast radius: retry module only,
> reversible via revert. Must not change: `schemas/`, live payment config.
> Stake: last quarter this retried a card 41 times.

The commonest failed card: "investigate why retries are weird" — an
activity, no check, unverifiable. Second commonest: a check that already
passes (the task is done; nothing for the course to operate on).

## Short exercises

**E1 — forge a receipt.** The refusal is exactly:

```text
dr-gate: REFUSED — receipt not issued by this gate: signature does not verify
```

(exit 1). What it teaches: the receipt's `sig` is an HMAC over the payload
with `control/gate.key`. The worker cannot read that key (probe row 3 of 6
refuses it, symlinks included), so the worker cannot manufacture a receipt
the gate will honor — authority by key possession, not by politeness.
Restore: re-run `dr-gate check first`; a fresh receipt supersedes the
mangled one.

**E2 — go stale.** The line is exactly:

```text
dr-gate: REFUSED — receipt stale: candidate tree mismatch
```

(The `loop: gate refused the evidence…` companion line appears only when a
still-open run calls `complete`; by this point `first` is already completed.)

Why a re-check is the fix: the signature is valid — the receipt honestly
describes a tree that no longer exists. No signature operation can make old
evidence describe new bytes; only running the checks against the current
tree and issuing a new receipt can. (This is the S4 row-5 lesson arriving
early: evidence binds to the exact candidate, or it is not evidence.)

**E3 — read the gate.**

- (a) The receipt binds `run_id`, `contract_sha256`, `check_version`,
  `candidate_tree` — plus the checks' commands and exit codes, all under
  the HMAC `sig`.
- (b) A named check exiting nonzero → `REFUSED — check failed: '<cmd>'
  exited <n>, expected <m>`, output retained under
  `runs/<id>/check-output.txt`, and no receipt is written. The gate
  never issues a receipt it must immediately regret.
- (c) The import block at the top of `control/dr-gate.ts` uses only
  `node:` builtins — nothing from `src/`. It matters because the gate must
  not trust code the worker's side of the repo can influence: a gate that
  imports the harness can be lied to by the harness. Same reason it lives
  in `control/`, where probe row 2 shows the worker cannot write.

## The transfer observation — what a good one looks like

> Probe prediction for billing-svc: rows 1–4 would all be ALLOWED — agents
> here run in my normal shell with my AWS creds in env. Row 3 scares me:
> `~/.aws/credentials` is readable and nothing would refuse it. Hypothesis:
> until M6, any agent run in this repo must be treated as uncontained and
> must not complete autonomously.

The value is the named row, the concrete file and the operational
consequence. "It's probably fine" is the answer the course is designed to
delete.

## Pitfall post-mortems (why, not just what)

1. Second smoke run "wrong": the smoke script is deterministic but the
   world is not reset — turn 2's check result honestly reflects the
   already-fixed file. A deterministic provider does not give a
   deterministic run: the run is the script combined with the world
   state. This distinction returns in S5 evals.
2. zsh glob error: NOT cosmetic. Under zsh a no-match glob aborts the whole
   command, so `rm -rf runs/*/ control/receipts/*.json` cleans nothing even
   when the other glob matches. The pages now use
   `find runs -mindepth 1 ! -name .gitkeep -delete` for exactly this reason;
   if a student's old notes carry the rm form, that is the bug.
3. Old Node: running `.ts` without a flag shipped in 22.18; the harness
   deliberately has zero build step to trade for that floor.
4. `0 of 6 contained by the OS`: the probe reports attempts, and the course grades
   the honesty of the report, not the count. A machine that printed
   `contained: 6 of 6` tonight would be lying — that lie is S4 material.
5. Stale receipt: see E2 — the refusal is the system working.
