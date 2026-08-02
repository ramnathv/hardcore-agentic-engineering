// The named check target (check-v1). Protected: dr-gate compares this file to
// the host-owned fixture in control/checks/ before every check run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slugify.mjs';

test('lowercases and dashes', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('ampersand becomes and', () => {
  assert.equal(slugify('Rock & Roll'), 'rock-and-roll');
});

test('collapses runs and trims edges', () => {
  assert.equal(slugify('  --Agentic   Engineering-- '), 'agentic-engineering');
});
