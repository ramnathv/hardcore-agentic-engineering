// Stop the process at every boundary and check what the log says afterwards.
// The rule under test is one sentence: the reducer returns the same state
// after every restart, and only a committed-but-unrecorded effect needs a
// human.
//
// These run the operator CLI in its own process. A crash cannot be observed
// from inside the run that crashes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLiveEvents } from '../../runtime/event-log.ts';
import { reduce } from '../../runtime/run-view.ts';
import { cli } from './helpers.ts';

// The suite keeps its evidence out of the checkout: these tests run the real
// CLI, and a test run must not leave artifacts behind for an operator to
// mistake for their own.
const ARTIFACTS = mkdtempSync(join(tmpdir(), 'prove-it-live-recovery-'));

// Found by run id, not by timestamp: two artifacts can share a millisecond.
function artifactFor(runId: string): string {
  for (const name of readdirSync(ARTIFACTS)) {
    const manifest = join(ARTIFACTS, name, 'manifest.json');
    if (!existsSync(manifest)) continue;
    if (JSON.parse(readFileSync(manifest, 'utf8')).run_id === runId) return join(ARTIFACTS, name);
  }
  throw new Error(`no artifact for run '${runId}'`);
}

function stateOf(dir: string) {
  const path = join(dir, 'shared', 'events.jsonl');
  const events = readLiveEvents(path);
  const view = reduce(events);
  // Reducing again, from a fresh read, must land in exactly the same place.
  assert.deepEqual(reduce(readLiveEvents(path)), view, 'the reducer is not stable');
  return { events, view };
}

function ledgerOf(runId: string): unknown[] {
  const path = join(tmpdir(), 'prove-it-live', runId, 'live-state', 'ledger.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function crashRun(point: string, runId: string) {
  const result = cli(
    ['smoke', '--script', 'payment', '--run-id', runId, '--artifact-root', ARTIFACTS],
    { PROVE_IT_LIVE_CRASH_AT: point, PROVE_IT_LIVE_CRASH_AT_CALL: '1' },
  );
  assert.equal(result.status, 9, `the process was supposed to stop at ${point}`);
  return artifactFor(runId);
}

const cleanup = (runId: string, dir?: string) => {
  rmSync(join(tmpdir(), 'prove-it-live', runId), { recursive: true, force: true });
  if (dir) rmSync(dir, { recursive: true, force: true });
};

test('stopping before the request leaves nothing to resolve', () => {
  const runId = 'rec-before-request';
  const dir = crashRun('before_request', runId);
  try {
    const { view } = stateOf(dir);
    assert.equal(view.status, 'running');
    assert.equal(view.pending, null);
    assert.equal(view.unansweredCalls.length, 0);
    assert.equal(ledgerOf(runId).length, 0, 'no effect happened');
  } finally {
    cleanup(runId, dir);
  }
});

test('stopping after the request leaves an unanswered call and no ambiguity', () => {
  const runId = 'rec-after-request';
  const dir = crashRun('after_request', runId);
  try {
    const { events, view } = stateOf(dir);
    assert.equal(events.at(-1)!.type, 'tool.requested');
    assert.equal(view.status, 'running', 'nothing was committed, so nothing is in doubt');
    assert.equal(view.pending, null);
    assert.equal(view.unansweredCalls.length, 1);
    assert.equal(view.unansweredCalls[0].tool, 'send_payment');
    assert.equal(ledgerOf(runId).length, 0, 'no effect happened');

    // A resume needs no operator here: it answers the dangling call honestly
    // and the agent retries on the same idempotency key.
    const resumed = cli(['resume', dir]);
    assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
    assert.equal(ledgerOf(runId).length, 1, 'the intent was paid exactly once');
  } finally {
    cleanup(runId, dir);
  }
});

test('stopping after dispatch demands a decision even though nothing happened', () => {
  const runId = 'rec-after-dispatch';
  const dir = crashRun('after_dispatch', runId);
  try {
    const { events, view } = stateOf(dir);
    assert.equal(events.at(-1)!.type, 'tool.dispatched');
    assert.equal(view.status, 'needs_reconcile');
    assert.equal(view.pending!.tool, 'send_payment');
    assert.equal(view.pending!.idempotencyKey, 'invoice-4021-attempt-1');
    // The harness committed and then died. It cannot know the effect did not
    // happen, and it does not get to assume.
    assert.equal(ledgerOf(runId).length, 0);

    const blind = cli(['resume', dir]);
    assert.equal(blind.status, 2, 'a bare resume fails');
    assert.match(blind.stderr, /RESUME REFUSED/);
  } finally {
    cleanup(runId, dir);
  }
});

test('stopping after the side effect is the S3 state: paid, unrecorded, blocked', () => {
  const runId = 'rec-after-effect';
  const dir = crashRun('after_effect', runId);
  try {
    const { events, view } = stateOf(dir);
    assert.equal(events.at(-1)!.type, 'tool.dispatched', 'no result was ever recorded');
    assert.equal(view.status, 'needs_reconcile');
    assert.equal(ledgerOf(runId).length, 1, 'the payment really happened');

    const blind = cli(['resume', dir]);
    assert.equal(blind.status, 2, 'a bare resume fails');
    assert.match(blind.stderr, /invoice-4021-attempt-1/, 'the operator is shown the key');

    // The operator looks at the world and records what they found.
    const recorded = cli(['reconcile', dir, '--decision', 'ok', '--note', 'one entry in the ledger']);
    assert.equal(recorded.status, 0, recorded.stderr);

    const afterDecision = stateOf(dir).view;
    assert.equal(afterDecision.pending, null);
    assert.equal(afterDecision.status, 'running');

    // The restarted agent reads the decision and does not pay again.
    const resumed = cli(['resume', dir]);
    assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
    assert.equal(ledgerOf(runId).length, 1, 'still one payment');
    assert.equal(stateOf(dir).view.status, 'needs_evidence');
  } finally {
    cleanup(runId, dir);
  }
});

test('stopping after the result record leaves a complete, resumable run', () => {
  const runId = 'rec-after-result';
  const dir = crashRun('after_result', runId);
  try {
    const { events, view } = stateOf(dir);
    assert.equal(events.at(-1)!.type, 'tool.result');
    assert.equal(view.status, 'running');
    assert.equal(view.pending, null);
    assert.equal(view.unansweredCalls.length, 0);
    assert.equal(ledgerOf(runId).length, 1);

    const resumed = cli(['resume', dir]);
    assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
    assert.equal(ledgerOf(runId).length, 1, 'the resume did not pay again');
  } finally {
    cleanup(runId, dir);
  }
});

test('a crash mid-append drops the torn record and lands on the pending state', () => {
  const runId = 'rec-during-append';
  const dir = crashRun('during_append', runId);
  try {
    const raw = readFileSync(join(dir, 'shared', 'events.jsonl'), 'utf8');
    assert.ok(raw.trimEnd().endsWith('"tool.res'), 'the record really is torn');

    const { events, view } = stateOf(dir);
    assert.equal(events.at(-1)!.type, 'tool.dispatched', 'the torn record was dropped');
    assert.equal(view.status, 'needs_reconcile', 'a half-written result is not a result');
    assert.equal(ledgerOf(runId).length, 1, 'the effect happened before the record');

    assert.equal(cli(['resume', dir]).status, 2, 'a bare resume fails');
  } finally {
    cleanup(runId, dir);
  }
});

test('reconciling as failed lets the agent retry on the same key', () => {
  const runId = 'rec-failed-decision';
  const dir = crashRun('after_dispatch', runId);
  try {
    assert.equal(ledgerOf(runId).length, 0, 'nothing happened before the stop');
    assert.equal(
      cli(['reconcile', dir, '--decision', 'failed', '--note', 'the ledger is empty']).status,
      0,
    );
    const resumed = cli(['resume', dir]);
    assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
    assert.equal(ledgerOf(runId).length, 1, 'the retry paid once, on the original key');
  } finally {
    cleanup(runId, dir);
  }
});

test('reconciling as in_doubt is survivable because the key is stable', () => {
  const runId = 'rec-in-doubt';
  const dir = crashRun('after_effect', runId);
  try {
    assert.equal(ledgerOf(runId).length, 1, 'the payment did happen');
    // The operator honestly cannot tell. The agent retries on the same key,
    // and the key is what stops a second payment.
    assert.equal(
      cli(['reconcile', dir, '--decision', 'in_doubt', '--note', 'could not reach the provider']).status,
      0,
    );
    const resumed = cli(['resume', dir]);
    assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
    assert.equal(ledgerOf(runId).length, 1, 'no duplicate: the idempotency key held');
  } finally {
    cleanup(runId, dir);
  }
});

test('reconcile refuses a decision that is not one of the three', () => {
  const runId = 'rec-bad-decision';
  const dir = crashRun('after_effect', runId);
  try {
    const bad = cli(['reconcile', dir, '--decision', 'probably_fine']);
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /ok\|failed\|in_doubt/);
    assert.equal(stateOf(dir).view.status, 'needs_reconcile', 'still blocked');
  } finally {
    cleanup(runId, dir);
  }
});
