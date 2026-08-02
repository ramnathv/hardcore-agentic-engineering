# S3 homework — worked solutions

Solutions marked **[verified]** were run against
the starter as-is; those marked **[sketch]** are one sound shape among
several — your Done-when check, not this file, decides acceptance.

## 1.1 Budget enforcement **[verified]**

Two small edits. In `src/loop.ts`, inside `runTurns`:

```ts
  const ctx = toolContext(runId, manifest);
  let observation: string | null = null;
  let failures = 0; // seed from reduce(events).toolFailures if resuming
```

and immediately after the existing `tool.result` append + console line:

```ts
      if (res.status === 'failed' && ++failures >= manifest.budgets.attempts) {
        log.append('run.budget_exhausted', 'harness', {
          boundary: 'attempts',
          attempts: manifest.budgets.attempts,
        });
        console.log(
          `run=${runId} status=budget_exhausted — stop or escalate. Do not reset the budget with a child run.`,
        );
        return;
      }
```

In `src/runview.ts`: add `'budget_exhausted'` to the status union and

```ts
      case 'run.budget_exhausted':
        v.status = 'budget_exhausted';
        break;
```

Verified output against the red contract:

```text
  ⏺ run_check → failed — check failed (exit 1): node -e "console.error('POST https://api.example.test/v1/send: connect timeout (simulated)'); process.exit(1)"
run=b1 status=budget_exhausted — stop or escalate. Do not reset the budget with a child run.
```

`grep '"type":"run.budget_exhausted"'` hits, `model_claimed_done` absent,
`view` shows `"status": "budget_exhausted"`, `npm test` stays green (9 pass).

Grading notes: the event must be appended before returning (a crash between
decision and record loses the boundary); actor is `harness`, not `worker` —
the worker does not get to declare its own budget state. Seeding `failures`
from the prior view on resume is the difference between a boundary and a
suggestion; accept it as a follow-up if noted honestly.

## 1.2 Idempotent external action **[key discipline verified via ledger; tool wiring is a sketch]**

The discipline, run end-to-end against the fixture:

```text
$ ledger send --to ops --amount 5 --key pay-2026-08-11-ops-5 --crash-before-record
ledger: simulated crash AFTER the external effect, BEFORE the confirmation reached the caller (entry #1 IS in the ledger)   [exit 9]
$ ledger query --key pay-2026-08-11-ops-5
{"id":1,"ts":"…","to":"ops","amount":5,"key":"pay-2026-08-11-ops-5"}
$ ledger send --to ops --amount 5 --key pay-2026-08-11-ops-5
idempotent replay: key 'pay-2026-08-11-ops-5' already recorded as entry #1 — no new external effect
$ ledger assert-count --to ops --n 1
ledger: PASS — exactly 1 entry to=ops
```

Tool shape in `src/tools.ts` (sketch):

```ts
    case 'send_ledger': {
      const to = String(args.to);
      const amount = Number(args.amount);
      const key = `${String(args.run)}-send-${to}-${amount}`; // intent, not attempt
      const cmd = [
        'sessions/s3-control-plane/fixtures/ledger.mjs',
        'send', '--to', to, '--amount', String(amount), '--key', key,
        ...(args.crash ? ['--crash-before-record'] : []),
      ];
      const r = spawnSync(process.execPath, cmd, { cwd: ROOT, encoding: 'utf8' });
      const out = (r.stdout || '') + (r.stderr || '');
      mkdirSync(ctx.runDir, { recursive: true });
      writeFileSync(join(ctx.runDir, `ledger-${key}.txt`), out);
      if (r.status === 0)
        return { status: 'ok', summary: out.trim().split('\n')[0], changed: [] };
      return {
        status: 'in_doubt',
        summary: `ledger send exited ${r.status}; effect unknown`,
        reconcile: `node sessions/s3-control-plane/fixtures/ledger.mjs query --key ${key}`,
      };
    }
```

Why this passes the drill: the crash attempt returns `in_doubt` naming the
query; the recovery dispatch reuses the same derived key, the server answers
`idempotent replay`, and the count stays 1. The classic failing submission
appends a timestamp to the key "for uniqueness" — which is pitfall 2
committing itself.

## 1.3 Approval flow **[sketch]**

- `loop approve <run-id> <approvalId>` → `log.append('approval.granted',
  'operator', { approvalId })`. Operator-actored: the worker must not be able
  to emit this event through any tool.
- `RunView` gains `approvals: string[]` (reduce `approval.granted` by
  collecting ids).
- `send_message` reads the run's events (the log is the only memory — no flag
  files) and: no grant → `{ status: 'pending', approvalId, summary }` with a
  stable approvalId derived from the action (so the operator can grant it
  before the retry); grant present → execute once against the ledger with an
  idempotency key → `ok`.

Precedence comment worth full credit: refuse beats ask beats allow; most
specific class wins; and an `approval.granted` for one approvalId approves
that action only — approval applies at the point of action.

Red flag to check in review: can any sequence of approvals make a `control/`
write succeed? If yes, that is an S4 finding pre-discovered.

## 1.4 Probe extension **[sketch]**

Two rows most environments can add honestly:

```ts
// 7. repeated external action, same key — proves server-side dedupe, and
//    NOTHING about what an unkeyed client would do
// 8. read an absolute path outside the repo (e.g. /etc/hosts) — on the stock
//    tool layer this is REFUSED by the working/ containment test; label from
//    the actual dispatch, and note it does not prove OS-level containment
```

Each row's note must state what the label does not prove — row 7's PASS is
a claim about `ledger.mjs`, not about your harness; row 8's refusal is
tool-layer policy, not a sandbox.

## 2. Real-repo transfer — what good looks like

A strong FIELD-NOTES entry (written in rehearsal as a model answer — the repo
and the names are invented; the shape is what yours must match):

> 2026-08-12, repo: billing-svc. 14 tools classified; 11 read/worktree-write,
> enforced by nothing but convention. `stripe refund create` is the
> irreversible effect: no idempotency key in our wrapper (Stripe supports
> one — we don't pass it), retried by a bare `for i in 1 2 3` loop on any
> nonzero exit. Replay window: any crash after the API accepted and before our
> DB row landed. Approver today: nobody — it runs from CI on merge. Approver
> from Friday: J. Alvarez, by name, at the point of action. First change:
> pass `Idempotency-Key` derived from invoice id.

The two most common weak answers: classifying only the agent's tools and
forgetting the CI pipeline's (the harness is everything around the model),
and naming a team ("platform approves it") where the exercise demands a
human.

## 3a. The torn record **[verified]**

`view` prints `events: dropped one torn final record (crash mid-write)` and
the RunView is identical to pre-corruption. What was lost: at most the single
record that was mid-write at the crash — an event that was never durably
claimed. Why dropping loudly is honest: a "repaired" half-record would assert
that something happened whose write never completed — manufacturing history.
The recovery contract is: everything fsync'd survives, the torn tail is
announced, and the reconciliation machinery (not a guess) decides what the
lost record would have said. (You see the warning twice: the log writer and
the view each read the file independently.)

## 3b. Two projections **[verified]**

Both the transcript line and `lastObservation` come from the same
`tool.result` event: `loop.ts` prints `summarize(res)` at dispatch time and
`runview.ts` sets `lastObservation` from `d.summary` of the recorded event —
same field, same event, one meaning. The operational danger: the day they
diverge, the model retries against a failure the operator cannot see (or the
operator kills a run the model had already fixed) — and the audit trail
cannot settle who was right, because there are now two truths.

## 3c. Status quiz

1. **in_doubt.** The push may have landed on the remote before the timeout.
   Reconcile: `git ls-remote origin <branch>` and compare the head SHA to
   your local commit.
2. **failed**, retryable — with the assertion as the new evidence justifying
   the retry.
3. **refused.** Destructive action outside the workspace: policy, not error.
   No retry; the `next` field routes to the operator.
4. **in_doubt.** A 500 means the server errored, not that it did not act —
   the effect may have committed before the error. Reconcile: query the
   resource (by idempotency key if you sent one — you did, right?).
5. **pending**, with an approvalId; nothing proceeds until the release owner
   acts.
6. **failed**, `retryable: false` — retrying a missing file without changing
   the world is spend, not strategy.

The pattern behind the quiz: `failed` means "the world is unchanged and says
no", `in_doubt` means "the world may have changed and I cannot see it",
`refused` means "the harness says no", `pending` means "a human has not said
yes yet". Only one of the four is an invitation to retry.
