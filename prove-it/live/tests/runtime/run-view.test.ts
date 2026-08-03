// The reducer, on hand-written logs. The engine tests prove it agrees with a
// real run; these prove it says the right thing about logs a real run is hard
// to steer into.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationFor, reduce, systemFor } from '../../runtime/run-view.ts';
import type { Actor, LiveEvent, LiveEventType } from '../../runtime/protocol.ts';

let seq = 0;
const ev = (type: LiveEventType, actor: Actor, data: Record<string, unknown> = {}): LiveEvent => ({
  id: ++seq,
  run: 'rv',
  lane: 'shared',
  ts: '2026-08-02T00:00:00.000Z',
  type,
  actor,
  data,
});

const opened = () => {
  seq = 0;
  return [
    ev('run.requested', 'operator', {
      provider: 'smoke',
      system: 'you are a worker',
      brief: 'do the thing',
      max_turns: 8,
    }),
    ev('provider.session.started', 'harness', { session_id: 's-1', model: 'test-model' }),
  ];
};

test('an empty log is a run that has not started', () => {
  const v = reduce([]);
  assert.equal(v.status, 'none');
  assert.equal(v.conversation.length, 0);
});

test('the conversation is rebuilt from events, in order', () => {
  const events = [
    ...opened(),
    ev('turn.started', 'harness', { turn: 1 }),
    ev('message.completed', 'worker', {
      text: 'reading the file',
      calls: [{ callId: 'c1', tool: 'read_file', args: { path: 'working/a.txt' } }],
    }),
    ev('tool.requested', 'worker', { call_id: 'c1', tool: 'read_file', args: { path: 'working/a.txt' } }),
    ev('tool.dispatched', 'harness', { call_id: 'c1', tool: 'read_file' }),
    ev('tool.result', 'tool', {
      call_id: 'c1',
      tool: 'read_file',
      result: { status: 'ok', summary: 'contents' },
    }),
  ];
  const v = reduce(events);

  assert.deepEqual(
    v.conversation.map((i) => i.kind),
    ['system', 'brief', 'agent', 'tool_result'],
  );
  assert.equal(systemFor(v), 'you are a worker');
  assert.equal(conversationFor(v)[0].kind, 'brief', 'the system instruction is passed separately');
  const agent = v.conversation[2];
  assert.equal(agent.kind === 'agent' && agent.calls.length, 1, 'the call rides with its message');
  assert.equal(v.status, 'running');
  assert.equal(v.pending, null);
});

test('a tool request with no preceding message still reaches the conversation', () => {
  // Some providers stream a call with no prose in front of it. The history
  // must still be well formed, or the next process cannot be started.
  const events = [
    ...opened(),
    ev('turn.started', 'harness', { turn: 1 }),
    ev('tool.requested', 'worker', { call_id: 'c1', tool: 'run_check', args: {} }),
    ev('tool.dispatched', 'harness', { call_id: 'c1', tool: 'run_check' }),
    ev('tool.result', 'tool', {
      call_id: 'c1',
      tool: 'run_check',
      result: { status: 'ok', summary: 'passed' },
    }),
  ];
  const v = reduce(events);
  const agent = v.conversation.find((i) => i.kind === 'agent');
  assert.ok(agent && agent.kind === 'agent' && agent.calls[0].callId === 'c1');
  assert.equal(v.conversation.at(-1)!.kind, 'tool_result');
});

test('a refusal is answered without a dispatch and does not block the run', () => {
  const events = [
    ...opened(),
    ev('turn.started', 'harness', { turn: 1 }),
    ev('tool.requested', 'worker', { call_id: 'c1', tool: 'read_file', args: { path: '/etc/passwd' } }),
    ev('tool.refused', 'harness', { call_id: 'c1', tool: 'read_file', policy: 'outside working/', next: 'ask' }),
  ];
  const v = reduce(events);
  assert.equal(v.status, 'running');
  assert.equal(v.pending, null);
  assert.equal(v.unansweredCalls.length, 0, 'a refusal is an answer');
  assert.equal(v.toolRefusals, 1);
});

test('dispatched and never recorded is the one state that needs a human', () => {
  const events = [
    ...opened(),
    ev('turn.started', 'harness', { turn: 1 }),
    ev('tool.requested', 'worker', { call_id: 'c1', tool: 'send_payment', args: { intent: 'i-1' } }),
    ev('tool.dispatched', 'harness', {
      call_id: 'c1',
      tool: 'send_payment',
      args: { intent: 'i-1' },
      idempotency_key: 'k1',
    }),
  ];
  const v = reduce(events);
  assert.equal(v.status, 'needs_reconcile');
  assert.equal(v.pending!.callId, 'c1');
  assert.equal(v.pending!.idempotencyKey, 'k1');
  assert.equal(v.unansweredCalls.length, 0, 'a dispatched call is pending, not unanswered');
});

test('a reconciliation answers the pending call and labels whose observation it is', () => {
  const events = [
    ...opened(),
    ev('turn.started', 'harness', { turn: 1 }),
    ev('tool.requested', 'worker', { call_id: 'c1', tool: 'send_payment', args: {} }),
    ev('tool.dispatched', 'harness', { call_id: 'c1', tool: 'send_payment', idempotency_key: 'k1' }),
    ev('tool.reconciled', 'operator', {
      call_id: 'c1',
      tool: 'send_payment',
      decision: 'ok',
      result: { status: 'ok', summary: 'operator confirmed it landed' },
    }),
  ];
  const v = reduce(events);
  assert.equal(v.status, 'running');
  assert.equal(v.pending, null);
  const kinds = v.conversation.map((i) => i.kind);
  assert.deepEqual(kinds.slice(-2), ['tool_result', 'operator'], 'the agent sees who decided');
});

test('a done claim is needs_evidence, and only a completion event completes', () => {
  const claimed = reduce([
    ...opened(),
    ev('worker.claimed_done', 'worker', { text: 'all set' }),
  ]);
  assert.equal(claimed.status, 'needs_evidence');
  assert.equal(claimed.claimedDone, true);

  const gated = reduce([
    ...opened(),
    ev('worker.claimed_done', 'worker', { text: 'all set' }),
    ev('gate.result', 'gate', { accepted: true, detail: 'dr-gate: ACCEPTED' }),
    ev('run.completed', 'harness', {}),
  ]);
  assert.equal(gated.status, 'completed');
  assert.equal(gated.gateAccepted, true);
  assert.equal(gated.conversation.at(-1)!.kind, 'gate', 'the agent can see the gate result');
});

test('a gate refusal keeps the run open and hands the result back', () => {
  const v = reduce([
    ...opened(),
    ev('worker.claimed_done', 'worker', { text: 'all set' }),
    ev('gate.result', 'gate', { accepted: false, detail: 'dr-gate: REFUSED — no receipt' }),
  ]);
  assert.equal(v.status, 'needs_evidence', 'refusal does not end the run');
  assert.equal(v.gateAccepted, false);
  const last = v.conversation.at(-1)!;
  assert.equal(last.kind === 'gate' && last.accepted, false);
});

test('a pending action outranks an interrupt', () => {
  const v = reduce([
    ...opened(),
    ev('tool.requested', 'worker', { call_id: 'c1', tool: 'send_payment', args: {} }),
    ev('tool.dispatched', 'harness', { call_id: 'c1', tool: 'send_payment' }),
    ev('run.interrupted', 'operator', { after_turn: 1 }),
  ]);
  assert.equal(v.status, 'needs_reconcile');
});

test('folding prefix by prefix lands where folding the whole log lands', () => {
  const events = [
    ...opened(),
    ev('turn.started', 'harness', { turn: 1 }),
    ev('message.completed', 'worker', { text: 'hello', calls: [] }),
    ev('tool.requested', 'worker', { call_id: 'c1', tool: 'run_check', args: {} }),
    ev('tool.dispatched', 'harness', { call_id: 'c1', tool: 'run_check' }),
    ev('tool.result', 'tool', {
      call_id: 'c1',
      tool: 'run_check',
      result: { status: 'failed', summary: 'red', retryable: true },
    }),
    ev('worker.claimed_done', 'worker', { text: 'done' }),
  ];
  const whole = reduce(events);
  for (let i = 1; i <= events.length; i++) reduce(events.slice(0, i));
  assert.deepEqual(reduce(events.slice()), whole, 'the reducer carries no hidden state');
  assert.equal(whole.toolFailures, 1);
});
