# Recovery drill script — kill, inspect, decide, rebrief (S2 and S3)

Repeating the same prompt is not recovery: recover the state of the work,
then brief from ground truth.

## 1. Kill between dispatch and record

```sh
PROVE_IT_CRASH_AT_TOOL=3 node src/loop.ts run --provider smoke --run-id drill-1
```

The log's last event is `tool.requested` with no result. The world may or may
not have changed.

## 2. Inspect — do not resume yet

```sh
node src/loop.ts view drill-1
```

Status is `needs_reconcile`; the pending action is named. A blind
`loop resume drill-1` is refused on purpose.

## 3. Decide

Look at the world by hand (here: run the named check yourself; in real work:
query the service by idempotency key). Then one of:

```sh
node src/loop.ts resume drill-1 --reconcile ok        # it happened
node src/loop.ts resume drill-1 --reconcile failed    # it did not
node src/loop.ts resume drill-1 --reconcile in_doubt  # cannot tell; recorded as uncertain
node src/loop.ts cancel drill-1 --reason "..."        # premise dead; rebrief
```

## 4. The rebrief paragraph (if you canceled)

Assert ground truth; do not re-send the old prompt:

> The previous attempt crashed after dispatching the check but before recording
> its result. I verified by hand: the check DID run and failed on the ampersand
> case. The plan of record is unchanged through step 2. Start at step 3 with
> that failure as your first observation. Do not re-run steps 1–2.
