// The shared prefix. Two lanes that each start their own agent are comparing
// two agents; a lesson compares one control against another, which means the
// history before the control has to be one history.
//
// Forking is how that works: run the prefix once, then copy the workspace, the
// durable events, and the contract state into each lane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLive } from '../../runtime/engine.ts';
import { readLiveEvents } from '../../runtime/event-log.ts';
import { reduce } from '../../runtime/run-view.ts';
import { readLedger } from '../../runtime/tool-catalog.ts';
import { smokeProvider } from '../../providers/smoke.ts';
import { CHECK_COMMAND, makeArtifacts, makeStage, REPO, SYSTEM } from './helpers.ts';

function cli(args: string[]) {
  return spawnSync(process.execPath, [join(REPO, 'live', 'runtime', 'cli.ts'), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
}

// Builds a prefix the way a crashed lane leaves one: a real effect in the
// world, and a durable log that stops at the dispatch.
async function makePrefix(runId: string) {
  const stage = makeStage();
  const evidence = makeArtifacts('prefix');
  await runLive({
    runId,
    lane: 'shared',
    stage: stage.path,
    artifacts: evidence.artifacts,
    session: smokeProvider('payment'),
    system: SYSTEM,
    brief: 'Pay invoice-4021 exactly once.',
    checkCommand: CHECK_COMMAND,
    budget: { maxTurns: 8, maxSeconds: 120 },
  });
  // The manifest is what fork() reads to find the world.
  evidence.artifacts.updateManifest({ run_id: runId, stage: stage.path });
  return { stage, evidence };
}

test('a fork carries the workspace, the record, and the pending state', async () => {
  const { stage, evidence } = await makePrefix('fk1');
  const lane = mkdtempSync(join(tmpdir(), 'prove-it-fork-'));
  let created = '';
  try {
    assert.equal(readLedger(stage.path).length, 1, 'the prefix really paid');

    const result = cli(['fork', '--from', evidence.dir, '--to', lane, '--run-id', 'fk1-right']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /record:\s+carried forward/);

    // The world travelled: the payment the prefix made is in the lane's stage.
    created = JSON.parse(readFileSync(join(lane, 'manifest.json'), 'utf8')).stage;
    assert.equal(readLedger(created).length, 1, 'the effect came with the fork');
    assert.notEqual(created, stage.path, 'and it is a copy, not the same directory');

    // The record travelled: the lane rebuilds the same view the prefix ended in.
    const forked = reduce(readLiveEvents(join(lane, 'shared', 'events.jsonl')));
    const original = reduce(readLiveEvents(join(evidence.dir, 'shared', 'events.jsonl')));
    assert.equal(forked.conversation.length, original.conversation.length);
    assert.equal(forked.toolCalls, original.toolCalls);
  } finally {
    if (created) rmSync(created, { recursive: true, force: true });
    rmSync(lane, { recursive: true, force: true });
    evidence.cleanup();
    stage.cleanup();
  }
});

test('--drop-events forks the world without the memory of changing it', async () => {
  const { stage, evidence } = await makePrefix('fk2');
  const lane = mkdtempSync(join(tmpdir(), 'prove-it-fork-'));
  try {
    const result = cli([
      'fork',
      '--from',
      evidence.dir,
      '--to',
      lane,
      '--run-id',
      'fk2-left',
      '--drop-events',
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /record:\s+dropped/);

    const forkedStage = JSON.parse(readFileSync(join(lane, 'manifest.json'), 'utf8')).stage;
    // The effects came with it — this lane inherits what it did.
    assert.equal(readLedger(forkedStage).length, 1);
    // The memory did not. That is the control, not an oversight.
    assert.equal(
      readLiveEvents(join(lane, 'shared', 'events.jsonl')).length,
      0,
      'this lane keeps no durable log',
    );
    assert.equal(reduce(readLiveEvents(join(lane, 'shared', 'events.jsonl'))).status, 'none');
    rmSync(forkedStage, { recursive: true, force: true });
  } finally {
    rmSync(lane, { recursive: true, force: true });
    evidence.cleanup();
    stage.cleanup();
  }
});

test('a forked lane owns its stage, so one lane cannot change the other', async () => {
  const { stage, evidence } = await makePrefix('fk3');
  const left = mkdtempSync(join(tmpdir(), 'prove-it-fork-'));
  const right = mkdtempSync(join(tmpdir(), 'prove-it-fork-'));
  try {
    cli(['fork', '--from', evidence.dir, '--to', left, '--run-id', 'fk3-left', '--drop-events']);
    cli(['fork', '--from', evidence.dir, '--to', right, '--run-id', 'fk3-right']);

    const leftStage = JSON.parse(readFileSync(join(left, 'manifest.json'), 'utf8')).stage;
    const rightStage = JSON.parse(readFileSync(join(right, 'manifest.json'), 'utf8')).stage;
    assert.notEqual(leftStage, rightStage);

    // A second payment in the left lane must not appear in the right lane's world.
    writeFileSync(
      join(leftStage, 'live-state', 'ledger.jsonl'),
      readFileSync(join(leftStage, 'live-state', 'ledger.jsonl'), 'utf8') +
        JSON.stringify({
          intent: 'invoice-4021',
          idempotency_key: 'second-attempt',
          amount: 250,
          currency: 'USD',
          ts: '2026-08-02T00:00:00.000Z',
        }) +
        '\n',
    );
    assert.equal(readLedger(leftStage).length, 2);
    assert.equal(readLedger(rightStage).length, 1, 'the lanes do not share a world');

    // Each lane carries the ownership marker, so the tool boundary trusts it.
    for (const dir of [leftStage, rightStage])
      assert.ok(existsSync(join(dir, '.prove-it-live-lane')), `${dir} is an owned stage`);
    for (const dir of [leftStage, rightStage]) rmSync(dir, { recursive: true, force: true });
  } finally {
    rmSync(left, { recursive: true, force: true });
    rmSync(right, { recursive: true, force: true });
    evidence.cleanup();
    stage.cleanup();
  }
});
