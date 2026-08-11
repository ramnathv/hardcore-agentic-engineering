import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessCheckExit } from '../control/check-exit.ts';

test('a check is satisfied when its exit status matches the contract', () => {
  assert.deepEqual(assessCheckExit(0, 0), {
    outcome: 'satisfied',
    accepted: true,
    actual: 0,
    expected: 0,
  });
  assert.equal(assessCheckExit(1, 1).accepted, true, 'nonzero expectations use the same rule');
});

test('exit 2 and a missing process status are inconclusive, not satisfied', () => {
  assert.equal(assessCheckExit(2, 0).outcome, 'inconclusive');
  assert.equal(assessCheckExit(2, 2).accepted, false, 'exit 2 is reserved, not contractable');
  assert.equal(assessCheckExit(null, 0).outcome, 'inconclusive');
});

test('any other unexpected exit status is a failed check', () => {
  assert.equal(assessCheckExit(1, 0).outcome, 'failed');
  assert.equal(assessCheckExit(0, 1).outcome, 'failed');
});
