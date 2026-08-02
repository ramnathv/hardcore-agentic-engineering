# S1 failure-first fixture — "all tests pass"

Hand this transcript to each group cold. One question, five minutes:
**Is this run complete? Decide yes or no, and write down the standard you used.**

Do not tell them the ending until every group has committed to a standard.

---

## The brief that was given to the agent

> Fix export reliability. Users have reported problems with the CSV export
> job. The code is in `src/export/`. Tests are in `test/export/`.

## Transcript (worker agent, single run, 11 minutes)

```text
● Reading src/export/runner.js and src/export/retry.js.

● I can see the issue. The retry logic in retry.js uses a fixed 100ms
  delay and gives up after 2 attempts. Under load this is far too
  aggressive. I'll implement exponential backoff with jitter and raise
  the attempt ceiling.

⏺ edit src/export/retry.js
  - const RETRIES = 2, DELAY = 100;
  + const RETRIES = 5;
  + const backoff = (n) => Math.min(2 ** n * 100, 3000) + Math.random() * 50;

● Adding tests for the new backoff behaviour.

⏺ write test/export/backoff.test.js
  ✓ retries five times before giving up
  ✓ delay grows exponentially and is capped at 3s

● Running the full suite to confirm nothing regressed.

⏺ npm test
  ...............................................
  47 passing (2.3s)

● All 47 tests pass, including the 2 new backoff tests. The export
  reliability issue is fixed: transient failures now retry with
  exponential backoff instead of failing after 200ms. This run is
  complete.
```

---

## The reveal (spoiler — read only after you have committed your prediction)

The reported defect was **duplicate exports after a crash**: the job dies
between sending the file and recording that it was sent; on restart it sends
the file again. Customers received the same export twice.

Nothing in this transcript touches that. The retry change is plausible,
competently executed, test-covered — and aimed at a requirement nobody had.
"47 passing" answers a question nobody asked.

Watch what happens in the room: every group that said "yes, complete" now
wants to add a criterion — *after seeing the result*. That is review by
surprise. The standard moved because it was never fixed.

The session's claim: the fix is not a smarter agent. It is a contract that
exists **before** the run, names the crash case as an observable outcome, and
a gate that refuses everything else.
