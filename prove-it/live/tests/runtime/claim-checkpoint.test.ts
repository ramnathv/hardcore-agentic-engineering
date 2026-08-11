// The S1 checkpoint and the identity the gate needs after it.
//
// One worker runs to its DONE claim and is stopped there, before anything has
// judged it. Both lanes fork that point; the left accepts the claim, the right
// resumes under the gate. Two properties make that comparison honest: the stop
// really lands between the claim and the judgement, and the resumed fork asks
// the gate about a run the gate can actually find — the one the stage was
// opened under, not the lane's new name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLive } from '../../runtime/engine.ts';
import { readLiveEvents } from '../../runtime/event-log.ts';
import { reduce } from '../../runtime/run-view.ts';
import { smokeProvider } from '../../providers/smoke.ts';
import { CHECK_COMMAND, cli, makeArtifacts, makeStage, REPO, SYSTEM } from './helpers.ts';

const BRIEF = 'Make working/src/slugify.mjs pass the named check.';

function run(stage: string, artifacts: any, requestGate: any, runId: string) {
  return runLive({
    runId,
    lane: 'shared',
    stage,
    artifacts,
    session: smokeProvider('slugify'),
    system: SYSTEM,
    brief: BRIEF,
    checkCommand: CHECK_COMMAND,
    checkExpectedExit: 0,
    budget: { maxTurns: 8, maxSeconds: 120 },
    requestGate,
    onPresent: () => {},
  });
}

async function atClaim<T>(work: () => Promise<T>): Promise<T> {
  process.env.PROVE_IT_LIVE_INTERRUPT_AT_CLAIM = '1';
  try {
    return await work();
  } finally {
    delete process.env.PROVE_IT_LIVE_INTERRUPT_AT_CLAIM;
  }
}

test('the claim checkpoint stops between the claim and the judgement', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  let asked = 0;
  try {
    const view = await atClaim(() =>
      run(stage.path, evidence.artifacts, () => {
        asked += 1;
        return { accepted: true, detail: 'dr-gate: ACCEPTED' };
      }, 'cc1'),
    );

    assert.equal(view.claimedDone, true, 'the claim is on the record');
    assert.equal(view.status, 'interrupted', 'and the run stopped there');
    assert.equal(asked, 0, 'the gate was never asked — nothing has judged the claim');

    const types = readLiveEvents(join(evidence.dir, 'shared', 'events.jsonl')).map((e) => e.type);
    assert.deepEqual(
      types.slice(-2),
      ['worker.claimed_done', 'run.interrupted'],
      'the stop lands after the claim and before any gate.result',
    );
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('a run stopped at the claim resumes, and the gate is what completes it', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  try {
    await atClaim(() => run(stage.path, evidence.artifacts, undefined, 'cc2'));

    const view = await run(
      stage.path,
      evidence.artifacts,
      () => ({ accepted: true, detail: 'dr-gate: ACCEPTED — receipt issued' }),
      'cc2',
    );
    assert.equal(view.status, 'completed');
    assert.equal(view.gateAccepted, true);

    const types = readLiveEvents(join(evidence.dir, 'shared', 'events.jsonl')).map((e) => e.type);
    assert.ok(types.includes('run.interrupted'), 'the checkpoint is durable history');
    assert.ok(
      types.indexOf('run.resumed') > types.indexOf('run.interrupted'),
      'the resume follows the checkpoint',
    );
    assert.deepEqual(
      types.slice(-3),
      ['worker.claimed_done', 'gate.result', 'run.completed'],
      'completion still runs claim → judgement → receipt',
    );
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('a resumed fork asks the gate about the run the stage was opened under', async () => {
  // The S1 right lane, end to end and keyless: prefix stopped at the claim,
  // forked under a new name, resumed under the real dr-gate. Before
  // gate_run_id, this path could only ever collect "no run manifest" — the
  // stage's harness run wears the prefix's name, and the fork does not rename it.
  const stage = makeStage();
  const evidence = makeArtifacts();
  const lane = mkdtempSync(join(tmpdir(), 'prove-it-claim-'));
  let laneStage = '';
  try {
    // Pin the contract and starting tree under the prefix's name, the way
    // createStage does, so the gate has a manifest to judge.
    const opened = spawnSync(
      process.execPath,
      [join(REPO, 'src', 'loop.ts'), 'open', '--run-id', 'cc3', '--contract', 'done/contract.yaml'],
      { cwd: REPO, encoding: 'utf8', env: { ...process.env, PROVE_IT_ROOT: stage.path, NODE_NO_WARNINGS: '1' } },
    );
    assert.equal(opened.status, 0, opened.stderr);

    await atClaim(() => run(stage.path, evidence.artifacts, undefined, 'cc3'));
    evidence.artifacts.updateManifest({
      run_id: 'cc3',
      stage: stage.path,
      smoke_script: 'slugify',
      gated: true,
      gate_run_id: 'cc3',
    });

    const forked = cli(['fork', '--from', evidence.dir, '--to', lane, '--run-id', 'cc3-right']);
    assert.equal(forked.status, 0, forked.stdout + forked.stderr);
    const manifest = JSON.parse(readFileSync(join(lane, 'manifest.json'), 'utf8'));
    laneStage = manifest.stage;
    assert.equal(manifest.run_id, 'cc3-right', 'the lane wears its own name');
    assert.equal(manifest.gate_run_id, 'cc3', 'and remembers the name the gate can find');

    const resumed = cli(['resume', lane]);
    assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
    const view = reduce(readLiveEvents(join(lane, 'shared', 'events.jsonl')));
    assert.equal(view.status, 'completed', 'the real gate accepted the resumed fork');
    assert.ok(
      existsSync(join(laneStage, 'control', 'receipts', 'cc3.json')),
      'the receipt on disk wears the name the gate judged',
    );
  } finally {
    if (laneStage) rmSync(laneStage, { recursive: true, force: true });
    rmSync(lane, { recursive: true, force: true });
    evidence.cleanup();
    stage.cleanup();
  }
});
