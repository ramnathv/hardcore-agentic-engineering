// The Claude stream parser, tested against a recorded run and against the
// shapes a recording cannot be made to produce on demand.
//
// The assertions are on canonical events only. Nothing here checks Claude's
// prose: a lesson that depends on a model phrasing something a particular way
// is a lesson that breaks on the next model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../../providers/claude-cli.ts';
import type { ProviderEvent } from '../../runtime/protocol.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'provider-fixtures');

function parse(file: string): ProviderEvent[] {
  const out: ProviderEvent[] = [];
  for (const line of readFileSync(join(FIXTURES, file), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    for (const event of normalize(JSON.parse(line))) out.push(event);
  }
  return out;
}

// One line per case, so a failure names the case that broke.
function parseLines(file: string): Array<{ label: string; events: ProviderEvent[] }> {
  return readFileSync(join(FIXTURES, file), 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const raw = JSON.parse(line);
      return { label: raw._case ?? raw.type, events: [...normalize(raw)] };
    });
}

test('a recorded run maps to the canonical event sequence', () => {
  const events = parse('claude-slugify.jsonl');

  const started = events.filter((e) => e.type === 'session.started');
  assert.equal(started.length, 1, 'exactly one session start');
  assert.equal((started[0] as any).model, 'claude-sonnet-5');
  assert.match((started[0] as any).sessionId, /^SESSION-/);

  const completed = events.filter((e) => e.type === 'turn.completed');
  assert.equal(completed.length, 1, 'one terminal turn');
  assert.equal(events.at(-1)!.type, 'turn.completed', 'and it comes last');

  assert.equal(
    events.filter((e) => e.type === 'provider.failed').length,
    0,
    'a successful run reports no failure',
  );

  // Only the four canonical types this stream can produce. Anything else means
  // provider vocabulary is leaking through the adapter.
  const kinds = new Set(events.map((e) => e.type));
  assert.deepEqual([...kinds].sort(), ['message.completed', 'session.started', 'turn.completed']);
});

test('the recorded run carries the tool calls the harness went on to execute', () => {
  const calls = parse('claude-slugify.jsonl')
    .filter((e) => e.type === 'message.completed')
    .flatMap((e) => ((e as any).message.calls ?? []) as Array<{ tool: string; callId: string }>);

  assert.ok(calls.length >= 4, `a real run made several calls (saw ${calls.length})`);
  // The server namespace is the provider's business, not the harness's.
  for (const call of calls) {
    assert.doesNotMatch(call.tool, /^mcp__/, `'${call.tool}' still carries the MCP prefix`);
    assert.match(call.callId, /^toolu_/, 'the provider call id is preserved for recovery');
  }
  assert.ok(calls.some((c) => c.tool === 'run_check'));
  assert.ok(calls.some((c) => c.tool === 'write_file'));
});

test('thinking blocks and empty messages produce no conversation entry', () => {
  const byCase = new Map(parseLines('claude-edge-cases.jsonl').map((c) => [c.label, c.events]));

  assert.deepEqual(
    byCase.get('an assistant message carrying only thinking'),
    [],
    'private reasoning is not a message the harness records',
  );
  assert.deepEqual(byCase.get('an empty assistant message'), []);
});

test('several tool requests in one message stay in one message', () => {
  const [event] = parseLines('claude-edge-cases.jsonl').find(
    (c) => c.label === 'several tool requests in one assistant message',
  )!.events;

  assert.equal(event.type, 'message.completed');
  const message = (event as any).message;
  assert.equal(message.calls.length, 2, 'both calls ride with the message that made them');
  assert.deepEqual(
    message.calls.map((c: any) => c.callId),
    ['toolu_a', 'toolu_b'],
    'in the order the provider emitted them',
  );
  assert.equal(message.text, 'Reading both files before I decide.');
});

test('an un-namespaced tool name passes through unharmed', () => {
  const [event] = parseLines('claude-edge-cases.jsonl').find(
    (c) => c.label === 'a tool name that is not namespaced by the harness server',
  )!.events;
  assert.equal((event as any).message.calls[0].tool, 'run_check');
});

test('a provider error becomes a terminal failure, never a completed turn', () => {
  for (const label of [
    'the provider reports an error result',
    'the provider hits its own usage limit',
  ]) {
    const events = parseLines('claude-edge-cases.jsonl').find((c) => c.label === label)!.events;
    assert.equal(events.length, 1, label);
    assert.equal(events[0].type, 'provider.failed', label);
    assert.match((events[0] as any).code, /^claude_/, label);
    assert.ok((events[0] as any).detail.length > 0, `${label} keeps the provider's own words`);
  }
});

test('provider chatter the harness already owns is dropped', () => {
  for (const label of [
    'noise the harness already holds the authoritative version of',
    'a rate limit notice is not a run event',
    "a hook fired on the operator's machine and must not reach the lesson",
  ]) {
    const events = parseLines('claude-edge-cases.jsonl').find((c) => c.label === label)!.events;
    assert.deepEqual(events, [], label);
  }
});

test('a stream that ends without a result yields no completed turn', () => {
  // The adapter reports the exit code as a provider failure; the parser's job
  // is only to not invent an ending that never arrived.
  const truncated = readFileSync(join(FIXTURES, 'claude-slugify.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .filter((line) => JSON.parse(line).type !== 'result');

  const events = truncated.flatMap((line) => [...normalize(JSON.parse(line))]);
  assert.equal(events.filter((e) => e.type === 'turn.completed').length, 0);
  assert.ok(events.length > 0, 'everything before the cut still parsed');
});

test('the fixtures carry no machine identity', () => {
  for (const file of ['claude-slugify.jsonl', 'claude-edge-cases.jsonl']) {
    const raw = readFileSync(join(FIXTURES, file), 'utf8');
    assert.doesNotMatch(raw, /\/Users\//, `${file} leaks a home path`);
    assert.doesNotMatch(raw, /\/var\/folders\//, `${file} leaks a machine temp path`);
    assert.doesNotMatch(raw, /sk-[A-Za-z0-9]{8}/, `${file} leaks something key-shaped`);
  }
});
