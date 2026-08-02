// check-v3: everything in check-v2 plus the digit case that catches the
// digit-drop fault (sessions/s4-attack-verify/fixtures/solution-faulty-v2.mjs).
// Host flow to adopt it:
//   cp sessions/s4-attack-verify/fixtures/slugify.test.v3.mjs working/test/slugify.test.mjs
//   node control/checks/rehash.mjs check-v3        # host action, never the worker's
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

test('long titles are not truncated', () => {
  const long = 'word '.repeat(20).trim();
  assert.equal(slugify(long), Array(20).fill('word').join('-'));
});

test('digits survive', () => {
  assert.equal(slugify('Top 10 Tools of 2026'), 'top-10-tools-of-2026');
});
