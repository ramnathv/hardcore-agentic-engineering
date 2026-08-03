// The log is the authority. It flushes before it returns, it continues its own
// sequence across processes, and it drops a torn record instead of guessing
// what the crashed write meant to say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyPrefix, LiveEventLog, readLiveEvents } from '../../runtime/event-log.ts';
import type { LiveEvent } from '../../runtime/protocol.ts';

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'prove-it-log-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('an appended event is on disk before append returns', () => {
  const s = scratch();
  try {
    const path = join(s.dir, 'events.jsonl');
    const log = new LiveEventLog(path, 'r1', 'left');
    log.append('run.requested', 'operator', { provider: 'smoke' });
    // Read the file, not the object: a durable event is one another process
    // can see.
    const onDisk = readLiveEvents(path);
    assert.equal(onDisk.length, 1);
    assert.equal(onDisk[0].type, 'run.requested');
    assert.equal(onDisk[0].lane, 'left');
    assert.equal(onDisk[0].id, 1);
  } finally {
    s.cleanup();
  }
});

test('reopening a log continues its sequence instead of restarting it', () => {
  const s = scratch();
  try {
    const path = join(s.dir, 'events.jsonl');
    const first = new LiveEventLog(path, 'r2', 'shared');
    first.append('run.requested', 'operator');
    first.append('turn.started', 'harness', { turn: 1 });

    // A new process, the same run.
    const second = new LiveEventLog(path, 'r2', 'shared');
    const resumed = second.append('run.resumed', 'operator');
    assert.equal(resumed.id, 3, 'one monotonic id space across processes');
    assert.deepEqual(
      readLiveEvents(path).map((e) => e.id),
      [1, 2, 3],
    );
  } finally {
    s.cleanup();
  }
});

test('subscribers fire after the flush, never before', () => {
  const s = scratch();
  try {
    const path = join(s.dir, 'events.jsonl');
    const log = new LiveEventLog(path, 'r3', 'shared');
    const seen: LiveEvent[] = [];
    const stop = log.subscribe((event) => {
      // Nothing on screen may describe a fact the log does not hold yet.
      assert.equal(readLiveEvents(path).length, event.id, 'the event was durable first');
      seen.push(event);
    });
    log.append('turn.started', 'harness', { turn: 1 });
    log.append('turn.started', 'harness', { turn: 2 });
    stop();
    log.append('turn.started', 'harness', { turn: 3 });
    assert.equal(seen.length, 2, 'unsubscribe stops the notifications');
  } finally {
    s.cleanup();
  }
});

test('a torn final record is dropped on read, not repaired silently', () => {
  const s = scratch();
  try {
    const path = join(s.dir, 'events.jsonl');
    const log = new LiveEventLog(path, 'r4', 'shared');
    log.append('run.requested', 'operator');
    log.append('tool.dispatched', 'harness', { call_id: 'c1', tool: 'send_payment' });
    const before = readLiveEvents(path);

    appendFileSync(path, '{"id":3,"run":"r4","type":"tool.res'); // the crash landed here
    const after = readLiveEvents(path);
    assert.deepEqual(after, before, 'the half-written record changes nothing');
  } finally {
    s.cleanup();
  }
});

test('the shared prefix copies into a lane so each lane log stands alone', () => {
  const s = scratch();
  try {
    const shared = join(s.dir, 'shared', 'events.jsonl');
    const left = join(s.dir, 'left', 'events.jsonl');
    const sharedLog = new LiveEventLog(shared, 'r5', 'shared');
    sharedLog.append('run.requested', 'operator');
    sharedLog.append('message.completed', 'worker', { text: 'shared history', calls: [] });

    assert.equal(copyPrefix(shared, left), 2);
    const leftLog = new LiveEventLog(left, 'r5', 'left');
    leftLog.append('turn.started', 'harness', { turn: 3 });

    const events = readLiveEvents(left);
    assert.deepEqual(
      events.map((e) => e.id),
      [1, 2, 3],
      'the lane continues the prefix sequence',
    );
    assert.equal(events[0].type, 'run.requested', 'the lane holds the whole history it needs');
    // The prefix is a copy: appending to the lane does not touch shared.
    assert.equal(readLiveEvents(shared).length, 2);
  } finally {
    s.cleanup();
  }
});

test('every record is one line of parseable JSON', () => {
  const s = scratch();
  try {
    const path = join(s.dir, 'events.jsonl');
    const log = new LiveEventLog(path, 'r6', 'shared');
    log.append('message.completed', 'worker', {
      text: 'a message\nwith a newline and a "quote"',
      calls: [],
    });
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
    assert.equal(lines.length, 1, 'a newline inside data does not tear the record');
    assert.match(JSON.parse(lines[0]).data.text, /\n/);
  } finally {
    s.cleanup();
  }
});
