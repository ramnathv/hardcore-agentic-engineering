# S4 homework — worked solutions

Every command and output below was run
against the starter; if yours differs, diff your build against the pristine
starter before assuming the solutions drifted.

## 1. Milestone extension — reference owner sequence (adequacy class)

The full M8 sequence, end to end, using the supplied second fault. Each step's
output is what the starter actually prints:

```sh
# throwaway copy so your checkout stays clean
T="$(mktemp -d)"; cp -R control working done fixtures "$T/"; mkdir -p "$T/runs"
export PROVE_IT_ROOT="$T"; N() { node "$@"; }

# honest baseline: run, check, verify
N src/loop.ts run --provider smoke --run-id m8-close        # …status=needs_evidence
N control/dr-gate.ts check m8-close                          # ACCEPTED … check=check-v1
# host strengthens to v2 (the in-session flow), recheck under the correct solution
cp "$T/control/checks/slugify.test.v2.mjs" "$T/working/test/slugify.test.mjs"
node "$T/control/checks/rehash.mjs" check-v2
N control/dr-gate.ts verify m8-close
#   dr-gate: REFUSED — receipt stale: checks are now check-v2, receipt was issued under check-v1
cp "$T/control/checks/fixtures/solution-correct.mjs" "$T/working/src/slugify.mjs"
N control/dr-gate.ts check m8-close                          # ACCEPTED … check=check-v2

# reproduce the weakness: the digit fault is green under v2
cp sessions/s4-attack-verify/fixtures/solution-faulty-v2.mjs "$T/working/src/slugify.mjs"
node --test "$T/working/test/slugify.test.mjs"               # GREEN — that is the weakness

# make the attack red: adopt v3 (host actions)
cp sessions/s4-attack-verify/fixtures/slugify.test.v3.mjs "$T/working/test/slugify.test.mjs"
node "$T/control/checks/rehash.mjs" check-v3
N control/dr-gate.ts check m8-close
#   dr-gate: REFUSED — check failed: 'node --test working/test/slugify.test.mjs' exited 1 …

# restore, re-earn, regression sweep
cp "$T/control/checks/fixtures/solution-correct.mjs" "$T/working/src/slugify.mjs"
N control/dr-gate.ts check m8-close && N control/dr-gate.ts verify m8-close   # ACCEPTED, VERIFIED under check-v3
unset PROVE_IT_ROOT
bash scripts/tamper-table.sh                                 # exits 0
```

Residual line for the note: check-v3 still accepts unicode mangling
(`'Café' → 'caf'` vs any policy), all-punctuation input (`slugify('!!!') ===
''`), and non-idempotence — none of the five cases exercises them.

## 2. Real-repo transfer — what "good" looks like

A passing write-up has four concrete lines, for example:

- Attacked: `test_refund_flow` — replaced `assert refund.state == "settled"`
  with `assert refund.state in ("settled", "pending")`.
- Review result: PR approved by the standard process; the reviewer read the
  production diff (empty) and skimmed the test diff. The weakening was named
  only when I pointed at it. → our review process does not treat verification
  diffs as first-class.
- Fault + catcher: forced `settle()` to return early; `test_refund_flow`
  (unweakened) goes red in 2s — `pytest tests/test_refunds.py -k refund_flow`.
- Left to a human: whether "pending after 24h" is acceptable UX — no
  deterministic check decides policy.

The common failing write-up says "review would probably catch it". The
exercise says confirm; "probably" means it was not run.

## 3a. The lint gap

Several patterns pass the lint; the smallest is `|| :` (`:` is the shell
builtin true). Verified against the starter with the stub still red:

```sh
T="$(mktemp -d)"; cp -R control working done fixtures "$T/"; mkdir -p "$T/runs"
export PROVE_IT_ROOT="$T"
sed -i.bak 's#command: node --test working/test/slugify.test.mjs#& || :#' "$T/done/contract.yaml"
node src/loop.ts open --run-id lintgap
node control/dr-gate.ts check lintgap
#   dr-gate: ACCEPTED — receipt at control/receipts/lintgap.json     ← failing suite, green receipt
```

Other working answers: `; :`, `|| /usr/bin/true`, `2>/dev/null; test $? -lt
200`, or an `expect_exit: 1` authored for a check that "fails" trivially.

(1) Smallest fix: add `'|| :'` to the `SUPPRESS` list in `control/dr-gate.ts`
— a host change, one array element. (2) A blocklist can never finish the job
because the shell gives unbounded ways to map failure to exit 0; enumeration
always loses. The mechanism that limits damage for suppression added after
open is the contract sha pinned in `run.json` — any post-open edit is refused
as `contract hash mismatch` before the lint even matters. So the lint's real
job is narrow: catching suppression already present at open (an innocently
adopted or agent-drafted contract) — which is why contract review at M1, not
the lint, is the primary control. Note the exercise's deliberate order:
`sed` first, `open` second. Reverse them and you get the hash refusal instead
of the lint gap.

## 3b. Receipt anatomy

| Row | Attack | Identity attacked | Refusal |
|---|---|---|---|
| 1 | forged marker | signature (HMAC over payload with `gate.key`) | `receipt not issued by this gate` |
| 2 | `\|\| true` on a check | none — pre-execution command policy (lint), not a binding | `suppressed check` |
| 3 | named test deleted | check version (protected-target hash in `manifest.json`) | `protected check target missing` |
| 4 | replayed receipt | run id | `receipt run mismatch: replay of run '…'` |
| 5 | post-receipt drift | candidate tree | `receipt stale: candidate tree mismatch` |
| 6 | seeded fault | none — no binding catches it; only check adequacy (question 3) | none, until the check is strengthened |

Rows 2 and 6 are the instructive ones: 2 is policy (refused before anything
runs), 6 is the row where every binding holds and the product is still wrong.
The fifth identity, contract sha256, is the one the supplied table never
attacks — which is exactly why it is the row-7 exercise.

## 3c. The second red

With `fixtures/slugify.test.v3.mjs` in place and the correct solution green,
the nearby fault `.replace(/&/g, ' and ')` → `.replace(/&/, ' and ')` (only
the first ampersand converted) stays green under v3 — the ampersand case
uses a single `&`, so `'Salt & Pepper & Vinegar'` silently becomes
`salt-and-pepper-vinegar`. The nearby fault `/[^a-z0-9]+/g` → `/[^a-z]+/g`
goes red (the digit case catches it), and so does dropping the trailing
edge-strip (the collapse/trim case covers both edges). All are correct
answers; the point is the record: v3 covers a region around digits, length
and edge-trimming, and has a blind spot at repeated ampersands — which goes
straight into the residual-risk note. A check version is a map of what is
defended; the second-red survey draws its borders.

## Reference implementations

- Artifact 1 (stager): `sessions/s4-attack-verify/fixtures/stage-attack-lab.sh`
- Artifact 3 (fault + check pair):
  `sessions/s4-attack-verify/fixtures/solution-faulty-v2.mjs` and
  `sessions/s4-attack-verify/fixtures/slugify.test.v3.mjs`
- Artifact 2 (row 7), reference body — verified refusal:

```sh
#!/usr/bin/env bash
# row 7: moving the goalposts — contract edited AFTER open. Attacks the
# contract_sha256 binding (the identity rows 1–6 never touch).
set -euo pipefail
cd "$(dirname "$0")/../../.."
NODE="node"
T="$(mktemp -d "${TMPDIR:-/tmp}/prove-it-row7.XXXXXX")"; trap 'rm -rf "$T"' EXIT
cp -R control working done fixtures "$T/"; mkdir -p "$T/runs"
export PROVE_IT_ROOT="$T"
printf '\n%s\n' "── row 7: the contract is edited after the run was opened"
$NODE src/loop.ts run --provider smoke --run-id goalposts >/dev/null   # honest green first
$NODE control/dr-gate.ts check goalposts >/dev/null
printf '\n# relaxed after the fact\n' >> "$T/done/contract.yaml"
if OUT="$($NODE control/dr-gate.ts check goalposts 2>&1)"; then
  printf '   → ACCEPTED (BUG)\n'; exit 1
else
  printf '   %s\n   → REFUSED\n' "$OUT"
fi
```

Expected output:

```text
── row 7: the contract is edited after the run was opened
   dr-gate: REFUSED — contract hash mismatch: contract changed after the run was opened
   → REFUSED
```
