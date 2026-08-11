// The Session 3 viewer is a one-screen teaching aid after the live demo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO } from './helpers.ts';

const event = (id: number, type: string, actor: string, data: Record<string, unknown>) =>
  JSON.stringify({ id, run: 's3-test', lane: 'shared', ts: `2026-08-11T20:00:${String(id).padStart(2, '0')}.000Z`, type, actor, data });

test('the S3 viewer shows a condensed log for each recovery path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prove-it-s3-evidence-'));
  try {
    for (const path of [
      'prefix/shared',
      'left/shared',
      'right/shared',
      'right/operator',
    ]) mkdirSync(join(dir, path), { recursive: true });

    const prefix = [
      event(1, 'run.requested', 'operator', { brief: 'Pay ops-5 exactly once.' }),
      event(2, 'tool.requested', 'worker', {
        call_id: 'pay-1',
        tool: 'send_payment',
        args: { intent: 'ops-5', amount: 5, idempotency_key: 'key-1' },
      }),
      event(3, 'tool.dispatched', 'harness', {
        call_id: 'pay-1',
        tool: 'send_payment',
        args: { intent: 'ops-5', amount: 5, idempotency_key: 'key-1' },
        idempotency_key: 'key-1',
      }),
    ];
    const recovery = [
      ...prefix,
      event(4, 'tool.reconciled', 'operator', {
        call_id: 'pay-1',
        tool: 'send_payment',
        decision: 'in_doubt',
        note: 'operator inspected the world',
      }),
      event(5, 'run.resumed', 'operator', { from_turn: 1 }),
      event(6, 'tool.result', 'tool', {
        call_id: 'inspect-1',
        tool: 'inspect_ledger',
        result: { status: 'ok', summary: "intent 'ops-5': 1 ledger entry" },
      }),
    ];
    writeFileSync(join(dir, 'prefix/shared/events.jsonl'), prefix.join('\n') + '\n');
    writeFileSync(join(dir, 'right/shared/events.jsonl'), recovery.join('\n') + '\n');
    writeFileSync(
      join(dir, 'left/shared/events.jsonl'),
      event(1, 'run.requested', 'operator', { brief: 'fresh process with no prefix' }) + '\n',
    );
    writeFileSync(
      join(dir, 'right/operator/world-observation.json'),
      JSON.stringify({
        source: 'external payment ledger',
        pending: { tool: 'send_payment', intent: 'ops-5', idempotency_key: 'key-1' },
        matching_entries: [{ intent: 'ops-5', idempotency_key: 'key-1', amount: 5 }],
      }),
    );
    writeFileSync(
      join(dir, 'frames.txt'),
      [
        'left START │ record: dropped (this lane keeps no durable log)',
        'right START │ record: carried forward',
        'left SURPRISE │ confirmation lost',
        'right SURPRISE │ status needs_reconcile',
        'left CONTROL │ paid again',
        'right CONTROL │ RESUME REFUSED',
        'left VERDICT │ ledger: FAIL — 2 entries for intent ops-5',
        'right VERDICT │ ledger: PASS — 1 entry for intent ops-5',
      ].join('\n') + '\n',
    );
    writeFileSync(
      join(dir, 'decision.txt'),
      'question: What can you truthfully record?\nanswer: in_doubt\ndefault-used: no\n',
    );
    writeFileSync(
      join(dir, 'prefix/manifest.json'),
      JSON.stringify({ mode: 'live', provider: 'claude-cli', model: 'test-model' }),
    );
    writeFileSync(join(dir, 'right.log'), 'world evidence then decision\n');

    const result = spawnSync(
      process.execPath,
      [join(REPO, 'scripts', 's3-evidence.mjs'), dir],
      { cwd: REPO, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const heading of ['SHARED · BEFORE THE CRASH', 'LEFT · BLIND RETRY', 'RIGHT · RECONCILE BY EVIDENCE', 'DISCUSSION'])
      assert.match(result.stdout, new RegExp(heading));
    assert.match(result.stdout, /send_payment\(ops-5\) → DISPATCHED/);
    assert.match(result.stdout, /pre-crash history → DROPPED/);
    assert.match(result.stdout, /pre-crash history → RETAINED/);
    assert.match(result.stdout, /operator records → in_doubt/);
    assert.match(result.stdout, /send_payment after resume → NONE/);
    assert.match(result.stdout, /ledger: FAIL — 2 entries/);
    assert.match(result.stdout, /ledger: PASS — 1 entry/);
    assert.match(result.stdout, /durable record did not know/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
