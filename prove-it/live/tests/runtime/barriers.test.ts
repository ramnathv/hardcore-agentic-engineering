// Pane synchronization. The rules under test are the two that stop a pane
// hanging in front of a room: every wait has a deadline, and a lane that stops
// releases its peer instead of leaving it to time out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  armBarriers,
  awaitCheckpoint,
  checkpointReached,
  expectedSides,
  releasePeer,
  signalCheckpoint,
  terminalReason,
  waitAtFrame,
} from '../../runtime/barriers.ts';

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'prove-it-barrier-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('a lane with no peer never waits', async () => {
  const s = scratch();
  try {
    // Sequential and single-lane runs arm nothing, so nothing blocks.
    assert.deepEqual(expectedSides(s.dir), []);
    const result = await waitAtFrame(s.dir, 'left', 'START', 1000);
    assert.equal(result.outcome, 'alone');
    assert.equal(result.waitedMs, 0, 'not even a poll interval was spent');
  } finally {
    s.cleanup();
  }
});

test('two lanes meeting at the same frame both proceed', async () => {
  const s = scratch();
  try {
    armBarriers(s.dir, ['left', 'right']);
    assert.deepEqual(expectedSides(s.dir), ['left', 'right']);

    // Both arrive; neither can pass until the other has.
    const [left, right] = await Promise.all([
      waitAtFrame(s.dir, 'left', 'SURPRISE', 5000),
      waitAtFrame(s.dir, 'right', 'SURPRISE', 5000),
    ]);
    assert.equal(left.outcome, 'synced');
    assert.equal(right.outcome, 'synced');
  } finally {
    s.cleanup();
  }
});

test('a lane waits for a peer that arrives late', async () => {
  const s = scratch();
  try {
    armBarriers(s.dir, ['left', 'right']);
    const waiting = waitAtFrame(s.dir, 'left', 'CONTROL', 5000);
    // The peer takes its time, as a real worker does.
    setTimeout(() => void waitAtFrame(s.dir, 'right', 'CONTROL', 5000), 300);
    const result = await waiting;
    assert.equal(result.outcome, 'synced');
    assert.ok(result.waitedMs >= 200, `it actually waited (${result.waitedMs}ms)`);
  } finally {
    s.cleanup();
  }
});

test('frames are independent: arriving at one does not release another', async () => {
  const s = scratch();
  try {
    armBarriers(s.dir, ['left', 'right']);
    await waitAtFrame(s.dir, 'right', 'START', 200);
    // right is at START; left is asking about VERDICT and must not be let through.
    const result = await waitAtFrame(s.dir, 'left', 'VERDICT', 300);
    assert.equal(result.outcome, 'timeout');
  } finally {
    s.cleanup();
  }
});

test('a stopped lane releases its peer immediately, with the reason', async () => {
  const s = scratch();
  try {
    armBarriers(s.dir, ['left', 'right']);
    releasePeer(s.dir, 'right', 'the provider was not installed');
    assert.equal(terminalReason(s.dir, 'right'), 'the provider was not installed');

    const started = Date.now();
    const result = await waitAtFrame(s.dir, 'left', 'START', 30_000);
    assert.equal(result.outcome, 'peer_failed');
    assert.match(result.detail, /the provider was not installed/);
    assert.ok(Date.now() - started < 5000, 'released at once, not after the deadline');
  } finally {
    s.cleanup();
  }
});

test('a silent peer times out rather than hanging the pane', async () => {
  const s = scratch();
  try {
    armBarriers(s.dir, ['left', 'right']);
    const result = await waitAtFrame(s.dir, 'left', 'START', 250);
    assert.equal(result.outcome, 'timeout');
    assert.match(result.detail, /did not reach START/);
  } finally {
    s.cleanup();
  }
});

test('arrival is recorded before the wait, so neither lane can miss the other', async () => {
  const s = scratch();
  try {
    armBarriers(s.dir, ['left', 'right']);
    // left arrives and gives up. Its arrival still stands, so a peer that comes
    // afterwards syncs immediately instead of waiting for a lane that has gone.
    assert.equal((await waitAtFrame(s.dir, 'left', 'START', 200)).outcome, 'timeout');
    const late = await waitAtFrame(s.dir, 'right', 'START', 200);
    assert.equal(late.outcome, 'synced');
  } finally {
    s.cleanup();
  }
});

test('a checkpoint is one-sided: the owner signals, the peer waits', async () => {
  const s = scratch();
  try {
    armBarriers(s.dir, ['left', 'right']);
    assert.equal(checkpointReached(s.dir, 'prefix'), false);

    const waiting = awaitCheckpoint(s.dir, 'right', 'prefix', 5000);
    // The owning lane does the shared work, then says so.
    setTimeout(() => signalCheckpoint(s.dir, 'prefix'), 250);
    const result = await waiting;

    assert.equal(result.outcome, 'synced');
    assert.ok(result.waitedMs >= 150, 'the peer really waited rather than racing ahead');
    assert.equal(checkpointReached(s.dir, 'prefix'), true);
  } finally {
    s.cleanup();
  }
});

test('a lane running alone does not block on a checkpoint nobody will reach', async () => {
  const s = scratch();
  try {
    const result = await awaitCheckpoint(s.dir, 'left', 'prefix', 1000);
    assert.equal(result.outcome, 'alone');
    assert.equal(result.waitedMs, 0);
  } finally {
    s.cleanup();
  }
});

test('a peer that dies before the checkpoint releases the waiter', async () => {
  const s = scratch();
  try {
    armBarriers(s.dir, ['left', 'right']);
    releasePeer(s.dir, 'left', 'the provider was not installed');
    const result = await awaitCheckpoint(s.dir, 'right', 'prefix', 30_000);
    assert.equal(result.outcome, 'peer_failed');
    assert.match(result.detail, /before prefix/);
  } finally {
    s.cleanup();
  }
});
