// The in_doubt boundary: a crash between tool dispatch (recorded) and result
// (never recorded) must surface a pending action that demands a deliberate
// decision. No automatic retry, no silent resume.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readEvents } from '../src/events.ts';
import { reduce } from '../src/runview.ts';
import { loop, makeFixtureRoot } from './helpers.ts';

test('crash between dispatch and record resumes to a pending action requiring a decision', () => {
  const { root, cleanup } = makeFixtureRoot();
  try {
    // Kill the harness right after the 3rd tool dispatch is durably logged
    // (turn 2's run_check) and before it executes.
    const crashed = loop(root, ['run', '--provider', 'smoke', '--run-id', 'cx1'], {
      PROVE_IT_CRASH_AT_TOOL: '3',
    });
    assert.equal(crashed.status, 9, 'the fixture crash happened');

    const events = readEvents(join(root, 'runs', 'cx1', 'events.jsonl'));
    assert.equal(events.at(-1)!.type, 'tool.requested', 'dispatch was durable; result never landed');

    const view = reduce(events);
    assert.equal(view.status, 'needs_reconcile');
    assert.equal(view.pending!.tool, 'run_check');

    // resume without a decision is refused and names the pending action
    const blind = loop(root, ['resume', 'cx1']);
    assert.notEqual(blind.status, 0);
    assert.match(blind.out, /PENDING action/);
    assert.match(blind.out, /tool=run_check/);
    assert.match(blind.out, /--reconcile ok\|failed\|in_doubt/);

    // a deliberate cancel is one valid decision
    // (on a copy of the same shape, a deliberate reconcile is the other)
    const resumed = loop(root, ['resume', 'cx1', '--reconcile', 'in_doubt']);
    assert.equal(resumed.status, 0, resumed.out);
    const after = reduce(readEvents(join(root, 'runs', 'cx1', 'events.jsonl')));
    assert.equal(after.pending, null, 'reconciliation recorded a result for the pending action');
    assert.equal(after.status, 'needs_evidence', 'run continued to the done-claim after reconcile');
  } finally {
    cleanup();
  }
});

test('cancel is the other deliberate exit from a pending action', () => {
  const { root, cleanup } = makeFixtureRoot();
  try {
    assert.equal(
      loop(root, ['run', '--provider', 'smoke', '--run-id', 'cx2'], {
        PROVE_IT_CRASH_AT_TOOL: '3',
      }).status,
      9,
    );
    const noReason = loop(root, ['cancel', 'cx2']);
    assert.notEqual(noReason.status, 0, 'every cancellation needs a reason');
    const cancelled = loop(root, ['cancel', 'cx2', '--reason', 'world state unknown; rebriefing']);
    assert.equal(cancelled.status, 0);
    const view = reduce(readEvents(join(root, 'runs', 'cx2', 'events.jsonl')));
    assert.equal(view.status, 'cancelled');
  } finally {
    cleanup();
  }
});
