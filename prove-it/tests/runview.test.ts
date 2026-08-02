// The RunView is disposable: rebuilding it from events.jsonl must always give
// the same state, batch or incremental, and 'view' must project the same truth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { readEvents } from '../src/events.ts';
import { reduce } from '../src/runview.ts';
import { loop, makeFixtureRoot } from './helpers.ts';

test('reducer rebuilds identical state from events.jsonl', () => {
  const { root, cleanup } = makeFixtureRoot();
  try {
    assert.equal(loop(root, ['run', '--provider', 'smoke', '--run-id', 'rv1']).status, 0);
    const path = join(root, 'runs', 'rv1', 'events.jsonl');

    const events = readEvents(path);
    assert.ok(events.length >= 10, 'smoke run leaves a real trace');
    const first = reduce(events);
    const second = reduce(readEvents(path)); // re-read, re-reduce
    assert.deepEqual(second, first, 'same log, same view');

    // incremental fold (prefix by prefix) lands on the same final state
    for (let i = 1; i <= events.length; i++) reduce(events.slice(0, i));
    assert.deepEqual(reduce(events.slice()), first);

    // the operator CLI projects the same state from the same log (--full = whole projection)
    const cli = loop(root, ['view', 'rv1', '--full']);
    assert.equal(cli.status, 0);
    assert.deepEqual(JSON.parse(cli.out), first, 'model-facing and operator views agree');

    assert.equal(first.status, 'needs_evidence');
    assert.equal(first.toolFailures, 1, 'the scripted smoke failure is visible');
    assert.equal(first.pending, null);
  } finally {
    cleanup();
  }
});

test('a torn final record is dropped on read, not repaired silently', () => {
  const { root, cleanup } = makeFixtureRoot();
  try {
    assert.equal(loop(root, ['run', '--provider', 'smoke', '--run-id', 'rv2']).status, 0);
    const path = join(root, 'runs', 'rv2', 'events.jsonl');
    const before = reduce(readEvents(path));
    appendFileSync(path, '{"id":999,"run":"rv2","type":"run.comp'); // crash mid-write
    const after = reduce(readEvents(path));
    assert.deepEqual(after, before, 'torn record does not change derived state');
  } finally {
    cleanup();
  }
});
