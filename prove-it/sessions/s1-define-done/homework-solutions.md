# S1 homework — worked solutions

Attempt everything in the session guide first. These are calibration answers,
not the only correct ones — but where an exact string is stated, it is the
string the shipped gate actually prints (all verified against the core).

---

## B4 — the versioned second check (reference; README "Turn an observation into a check")

The promoted check, added under `checks:` in v2 (verified working against
the correct implementation; exits 1 against the naive one because the
ampersand case fails):

```yaml
  - command: node -e "import('./working/src/slugify.mjs').then(m => process.exit(m.slugify('Rock & Roll!') === 'rock-and-roll' ? 0 : 1))"
    expect_exit: 0
```

Evidence pair you should now hold: the v1 refusal
`dr-gate: REFUSED — contract hash mismatch: contract changed after the run
was opened`, and a v2 receipt whose `contract_sha256` differs from v1's.
Both hashes in PROOF.md.

## Attack drill — why the forger's best receipt still fails

Every field of a receipt is readable from worker context except one:
`sig` is an HMAC over the payload keyed with `control/gate.key`, and reads
of the key are refused at the tool layer (probe row: credential read →
refused). Without the key, no payload — however accurate — can be signed.
The refusal chain: out-of-band write may even succeed, but
`dr-gate verify` fails on `receipt not issued by this gate: signature does
not verify`, so `loop complete` refuses and the run stays
`needs_evidence`.

## C1 — outcome rewrites (one good answer each; yours may differ)

1. "Improve error handling in the importer" →
   **Outcome:** when row 3 of a 10-row CSV is malformed, the importer
   imports the 9 valid rows, reports row 3 with its line number, and exits
   non-zero.
   **Check:** `npm test -- importer-partial-failure`, expect_exit 0 (a new
   test you watched fail red first).
2. "Make the dashboard faster" →
   **Outcome:** the dashboard's `/summary` endpoint responds in under
   400 ms at p95 against the seeded 10k-row fixture on CI hardware.
   **Check:** `node bench/summary-p95.mjs --max-ms 400`, expect_exit 0.
   (Note the honest anchor: named fixture, named hardware. "Faster" with
   no baseline is unfalsifiable.)
3. "Refactor auth to use middleware" — trick question: this is an
   implementation, not an outcome. First name the observable result the
   refactor buys. For example, **Outcome:** every route under `/api/`
   returns 401 without a valid session, verified by one table-driven test; public
   routes are unchanged.
   **Check:** `npm test -- auth-coverage`, expect_exit 0, plus
   `must_not_change: public route list / response shapes`.

## C2 — the weak contract, mapped to the six questions

`sessions/s1-define-done/fixtures/weak-contract.yaml`:

| Q | Exploit |
|---|---|
| 1 | Check 1 (`node -e "import(...).then(() => process.exit(0))"`) is green before any work — even the red stub imports cleanly; it only proves the file parses. |
| 2 | `must_not_change` lists only `control/` — so edit `working/test/slugify.test.mjs` to assert nothing, and check 2 passes honestly. The fixture is the cheapest thing to change. |
| 3 | Outcome says "handles special characters correctly" — no named cases. Ship `&`-handling only; unicode, emphatically "special", is omitted and no written word objects. |
| 4 | Check 2 ends `\|\| echo done anyway` — exit 0 regardless. Note it evades the gate's suppression lint (which names `\|\| true` but not `\|\| echo`): a lint list is not adequacy, which is the S4 lesson arriving early. |
| 5 | Nothing binds a candidate: outcome names "the slugify function" (no path), the observation is "looks right when we read it". In a repo without prove-it's tree-hash pinning, yesterday's build passes for today's. |
| 6 | `budgets: 99 attempts / 480 minutes` is thrash-until-green with extra steps; `release_owner: whoever is around` means no accountable human. Reliability and accountability are the missing qualities. |

## C3 — the exact refusal strings (a retired drill, kept for reference)

1. `dr-gate: REFUSED — contract hash mismatch: contract changed after the run was opened`
2. `dr-gate: REFUSED — receipt not issued by this gate: signature does not verify`
   followed by `loop: gate refused the evidence; run stays needs_evidence`
3. `dr-gate: REFUSED — receipt run mismatch: replay of run '<good-id>'`
4. `dr-gate: REFUSED — receipt stale: candidate tree mismatch`

Scoring guide: (3) is the one most people miss — the signature verifies
(the payload is genuine, merely for the wrong run), so the refusal is about
run identity, not forgery. If you predicted "signature does not verify" for
(3), replay that distinction until it sticks: a true receipt can still be
the wrong receipt.

## The transfer — what a good entry looks like (shape, anonymized)

> Task: dedupe webhook deliveries in billing-sync.
> Contract v1 sha `9c41…`; peer loophole (Q4): my check was
> `npm test -- webhooks` but the dedupe test file wasn't matched by that
> filter — the command succeeds without running the check.
> Revision: check now `npm test -- webhook-dedupe --`, and I watched it
> fail red before any fix. v2 sha `2e77…`, recorded with
> `shasum -a 256 billing-dedupe.yaml`. Agent not yet started.
> (`pin-contract.mjs` is optional Go-deeper tooling from manufacture Pair 2.)

The tell of a real entry: the loophole is embarrassing and specific. Entries
where the peer "found nothing" almost always mean the attack was polite, not
that the contract was perfect — see pitfall 2.
