// The gate is the only thing that completes a run. The agent's "done" is an
// opinion; a refusal is evidence the agent gets to act on; and neither the
// engine nor the adapter can issue a receipt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runLive } from '../../runtime/engine.ts';
import { readLiveEvents } from '../../runtime/event-log.ts';
import { reduce } from '../../runtime/run-view.ts';
import { smokeProvider } from '../../providers/smoke.ts';
import { withGateRoot } from '../../runtime/gate-root.ts';
import { CHECK_COMMAND, makeArtifacts, makeStage, REPO, SYSTEM } from './helpers.ts';

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

test('without a gate the run stops at the claim, and the claim is not completion', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  try {
    const view = await run(stage.path, evidence.artifacts, undefined, 'g0');
    assert.equal(view.claimedDone, true);
    assert.equal(view.status, 'needs_evidence', 'nobody judged it, so nothing completed it');
    assert.equal(view.gateAccepted, false);
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('an accepted gate is what completes a run', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  let asked = 0;
  try {
    const view = await run(
      stage.path,
      evidence.artifacts,
      () => {
        asked += 1;
        return { accepted: true, detail: 'dr-gate: ACCEPTED — receipt issued' };
      },
      'g1',
    );
    assert.equal(asked, 1, 'the gate is asked once, after the claim');
    assert.equal(view.status, 'completed');
    assert.equal(view.gateAccepted, true);

    const types = readLiveEvents(join(evidence.dir, 'shared', 'events.jsonl')).map((e) => e.type);
    assert.deepEqual(
      types.slice(-3),
      ['worker.claimed_done', 'gate.result', 'run.completed'],
      'the claim precedes the judgement, and the judgement precedes completion',
    );
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('a refusal keeps the run open and reaches the agent', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  const answers = [
    { accepted: false, detail: 'dr-gate: REFUSED — candidate tree mismatch' },
    { accepted: true, detail: 'dr-gate: ACCEPTED — receipt issued' },
  ];
  try {
    const view = await run(stage.path, evidence.artifacts, () => answers.shift()!, 'g2');

    assert.equal(view.status, 'completed', 'the second judgement completed it');
    // The refusal is in the history the agent reads, labelled as the gate's.
    const gateItems = view.conversation.filter((i) => i.kind === 'gate');
    assert.equal(gateItems.length, 2);
    assert.equal(gateItems[0].kind === 'gate' && gateItems[0].accepted, false);
    assert.match(
      gateItems[0].kind === 'gate' ? gateItems[0].text : '',
      /REFUSED/,
      "the gate's own words reach the agent",
    );

    const events = readLiveEvents(join(evidence.dir, 'shared', 'events.jsonl'));
    assert.equal(events.filter((e) => e.type === 'gate.result').length, 2);
    assert.equal(
      events.filter((e) => e.type === 'run.completed').length,
      1,
      'a refusal completes nothing',
    );
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('a gate that never accepts exhausts the budget instead of completing', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  try {
    const view = await runLive({
      runId: 'g3',
      lane: 'shared',
      stage: stage.path,
      artifacts: evidence.artifacts,
      session: smokeProvider('slugify'),
      system: SYSTEM,
      brief: BRIEF,
      checkCommand: CHECK_COMMAND,
      checkExpectedExit: 0,
      budget: { maxTurns: 6, maxSeconds: 120 },
      requestGate: () => ({ accepted: false, detail: 'dr-gate: REFUSED — no receipt' }),
      onPresent: () => {},
    });
    assert.equal(view.status, 'failed');
    assert.equal(view.failure!.code, 'budget_turns');
    assert.equal(view.gateAccepted, false, 'no amount of asking turns a refusal into a receipt');
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('the real gate refuses a red tree and accepts the tree the agent fixed', async () => {
  // The shipped dr-gate, run as its own process against the stage — no stub,
  // no reimplementation. This is the assertion that the wiring is real.
  const { spawnSync } = await import('node:child_process');
  const stage = makeStage();
  const evidence = makeArtifacts();
  // Through a lent root, the way the runtime does it: the tree is the stage's,
  // the rules and the key are the checkout's.
  const gate = (runId: string) => {
    const r = withGateRoot({ repoRoot: REPO, stage: stage.path, id: `${runId}-t` }, (root) =>
      spawnSync(process.execPath, [join(REPO, 'control', 'dr-gate.ts'), 'check', runId], {
        cwd: REPO,
        encoding: 'utf8',
        env: { ...process.env, PROVE_IT_ROOT: root, NODE_NO_WARNINGS: '1' },
      }),
    );
    return { accepted: r.status === 0, detail: ((r.stdout || '') + (r.stderr || '')).trim() };
  };

  try {
    // A run the gate can judge has to be opened before the worker starts, so
    // the contract and the starting tree are pinned first.
    const opened = spawnSync(
      process.execPath,
      [join(REPO, 'src', 'loop.ts'), 'open', '--run-id', 'g4', '--contract', 'done/contract.yaml'],
      {
        cwd: REPO,
        encoding: 'utf8',
        env: { ...process.env, PROVE_IT_ROOT: stage.path, NODE_NO_WARNINGS: '1' },
      },
    );
    assert.equal(opened.status, 0, opened.stderr);

    // Red tree: the gate refuses.
    assert.equal(gate('g4').accepted, false, 'the gate refuses the untouched stub');

    const view = await run(stage.path, evidence.artifacts, gate, 'g4');
    assert.equal(view.status, 'completed', 'the gate accepted after the agent turned it green');
    assert.equal(view.gateAccepted, true);
    assert.ok(
      existsSync(join(stage.path, 'control', 'receipts', 'g4.json')),
      'a signed receipt exists on disk',
    );
    const receipt = JSON.parse(readFileSync(join(stage.path, 'control', 'receipts', 'g4.json'), 'utf8'));
    assert.ok(receipt.sig, 'the receipt is signed by the gate, not by the runtime');
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('the signing key never enters the world the gate judges', async () => {
  const { spawnSync } = await import('node:child_process');
  const stage = makeStage();
  try {
    // The property that matters, stated directly: a worker's stage holds no key.
    assert.equal(
      existsSync(join(stage.path, 'control', 'gate.key')),
      false,
      'a stage with a signing key in it can have its receipts forged',
    );

    // And the gate still works, because the key is lent to the subprocess.
    spawnSync(
      process.execPath,
      [join(REPO, 'src', 'loop.ts'), 'open', '--run-id', 'g5', '--contract', 'done/contract.yaml'],
      { cwd: REPO, encoding: 'utf8', env: { ...process.env, PROVE_IT_ROOT: stage.path, NODE_NO_WARNINGS: '1' } },
    );
    copyFileSync(
      join(REPO, 'control', 'checks', 'fixtures', 'solution-correct.mjs'),
      join(stage.path, 'working', 'src', 'slugify.mjs'),
    );
    const result = withGateRoot({ repoRoot: REPO, stage: stage.path, id: 'g5-t' }, (root) => {
      assert.ok(existsSync(join(root, 'control', 'gate.key')), 'the lent root has the key');
      return spawnSync(process.execPath, [join(REPO, 'control', 'dr-gate.ts'), 'check', 'g5'], {
        cwd: REPO,
        encoding: 'utf8',
        env: { ...process.env, PROVE_IT_ROOT: root, NODE_NO_WARNINGS: '1' },
      });
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);

    // The receipt came back. The key did not.
    assert.ok(existsSync(join(stage.path, 'control', 'receipts', 'g5.json')));
    assert.equal(
      existsSync(join(stage.path, 'control', 'gate.key')),
      false,
      'the lent root must not leak its key back into the stage',
    );
  } finally {
    stage.cleanup();
  }
});

test('a lent root is removed even when the work inside it throws', async () => {
  const stage = makeStage();
  try {
    const { tmpdir } = await import('node:os');
    const root = join(tmpdir(), 'prove-it-gate', 'g6-t');
    assert.throws(() =>
      withGateRoot({ repoRoot: REPO, stage: stage.path, id: 'g6-t' }, () => {
        assert.ok(existsSync(root), 'the root exists while the work runs');
        throw new Error('the gate blew up');
      }),
    );
    assert.equal(existsSync(root), false, 'a key-bearing directory is not left behind on failure');
  } finally {
    stage.cleanup();
  }
});
