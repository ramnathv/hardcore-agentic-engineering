// The retained record. It has to be complete enough to answer "what actually
// happened", and clean enough to hand to somebody. Those pull in opposite
// directions, so both are tested.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { artifactDir, sanitize } from '../../runtime/artifacts.ts';
import { runLive } from '../../runtime/engine.ts';
import { smokeProvider } from '../../providers/smoke.ts';
import { CHECK_COMMAND, makeArtifacts, makeStage, readJson, sha256, SYSTEM } from './helpers.ts';

test('home paths and credentials never reach an artifact', () => {
  const home = homedir();
  assert.ok(!sanitize(`error at ${home}/.claude/config`).includes(home), 'home path is replaced');
  assert.match(sanitize(`error at ${home}/x`), /^error at ~\//);

  for (const [input, pattern] of [
    ['ANTHROPIC_API_KEY=abcdef123456', /ANTHROPIC_API_KEY=«redacted»/],
    ['authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', /Bearer «redacted»/],
    ['using sk-ant-api03-AAAAAAAAAAAAAAAAAAAA now', /sk-«redacted»/],
    ['{"api_key": "supersecretvalue"}', /"api_key": "«redacted»"/],
  ] as Array<[string, RegExp]>)
    assert.match(sanitize(input), pattern, input);
});

test('the manifest records what identifies a run, and nothing that identifies a machine', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts('smoke-slugify');
  try {
    const contractSha = sha256('contract bytes');
    await runLive({
      runId: 'a1',
      lane: 'shared',
      stage: stage.path,
      artifacts: evidence.artifacts,
      session: smokeProvider('slugify'),
      system: SYSTEM,
      brief: 'Make the check pass.',
      checkCommand: CHECK_COMMAND,
      checkExpectedExit: 0,
      budget: { maxTurns: 8, maxSeconds: 120 },
      contractSha,
      workspaceHash: 'tree:abc123',
    });
    evidence.artifacts.close('2026-08-02T00:10:00.000Z');

    const manifest = readJson(join(evidence.dir, 'manifest.json'));
    for (const field of [
      'scenario',
      'runtime_version',
      'mode',
      'provider',
      'model',
      'provider_session_ids',
      'contract_sha256',
      'workspace_tree_start',
      'started_at',
      'stopped_at',
    ])
      assert.ok(field in manifest, `manifest is missing ${field}`);

    assert.equal(manifest.contract_sha256, contractSha);
    assert.equal(manifest.workspace_tree_start, 'tree:abc123');
    assert.equal(manifest.model, 'smoke-deterministic', 'the model identity is recorded');
    assert.deepEqual(manifest.provider_session_ids, ['smoke-slugify']);
    assert.ok(!JSON.stringify(manifest).includes(homedir()), 'no home path in the manifest');
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('the lane keeps raw provider output, full tool output, and a transcript', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  try {
    const lane = evidence.artifacts.lane('shared');
    await runLive({
      runId: 'a2',
      lane: 'shared',
      stage: stage.path,
      artifacts: evidence.artifacts,
      session: smokeProvider('slugify', { raw: (line) => lane.raw(line) }),
      system: SYSTEM,
      brief: 'Make the check pass.',
      checkCommand: CHECK_COMMAND,
      checkExpectedExit: 0,
      budget: { maxTurns: 8, maxSeconds: 120 },
    });

    const laneDir = join(evidence.dir, 'shared');
    for (const file of ['events.jsonl', 'provider.raw.jsonl', 'presentation.log'])
      assert.ok(existsSync(join(laneDir, file)), `missing ${file}`);

    // The raw stream holds the deltas the durable log deliberately drops.
    const raw = readFileSync(join(laneDir, 'provider.raw.jsonl'), 'utf8');
    assert.match(raw, /"message.delta"/, 'raw output keeps the streaming text');
    const events = readFileSync(join(laneDir, 'events.jsonl'), 'utf8');
    assert.doesNotMatch(events, /message\.delta/, 'the durable log keeps completed messages only');

    // Every call left its arguments and its result on disk, under its call id.
    const calls = JSON.parse(`[${events.trim().split('\n').join(',')}]`)
      .filter((e: any) => e.type === 'tool.requested')
      .map((e: any) => e.data.call_id);
    assert.ok(calls.length >= 5);
    for (const callId of calls) {
      assert.ok(existsSync(join(laneDir, 'tools', `${callId}.args.json`)), `${callId} args`);
      assert.ok(existsSync(join(laneDir, 'tools', `${callId}.result.json`)), `${callId} result`);
    }

    const transcript = readFileSync(join(laneDir, 'presentation.log'), 'utf8');
    assert.match(transcript, /^AGENT /m);
    assert.match(transcript, /^TOOL run_check/m);
    assert.match(transcript, /^RESULT run_check failed/m);
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('a run_check keeps both streams, and the summary points at the retained one', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  try {
    const lane = evidence.artifacts.lane('shared');
    await runLive({
      runId: 'a3',
      lane: 'shared',
      stage: stage.path,
      artifacts: evidence.artifacts,
      session: smokeProvider('slugify', { raw: (line) => lane.raw(line) }),
      system: SYSTEM,
      brief: 'Make the check pass.',
      checkCommand: CHECK_COMMAND,
      checkExpectedExit: 0,
      budget: { maxTurns: 8, maxSeconds: 120 },
    });
    const laneDir = join(evidence.dir, 'shared');
    const results = readFileSync(join(laneDir, 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
      .filter((e) => e.type === 'tool.result' && e.data.tool === 'run_check');

    assert.equal(results.length, 2, 'the check ran twice: red, then green');
    for (const record of results) {
      const reference = record.data.result.artifact as string;
      assert.ok(existsSync(join(evidence.dir, reference)), `dangling artifact reference ${reference}`);
      assert.ok(existsSync(join(laneDir, 'tools', `${record.data.call_id}.stderr.txt`)));
    }
    // The failing check's full output is longer than what the agent was told.
    const failing = results.find((r) => r.data.result.status === 'failed')!;
    const full = readFileSync(join(evidence.dir, failing.data.result.artifact), 'utf8');
    assert.ok(full.length > 0, 'the whole check output is retained');
    assert.match(full, /fail 1/, 'and it is the real output, not a summary of it');
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('the artifact directory is named for its scenario and its moment', () => {
  const dir = artifactDir('/x/live/artifacts', 's3', new Date('2026-08-02T14:05:09.123Z'));
  assert.equal(dir, '/x/live/artifacts/s3-2026-08-02T14-05-09-123');
});
