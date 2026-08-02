// check-v2: the strengthened check. Everything in v1 plus the long-title case
// that catches the seeded truncation fault (tamper table row 6). A host copies
// this over working/test/slugify.test.mjs and runs rehash.mjs check-v2.
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
