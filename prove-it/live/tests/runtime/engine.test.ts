// The Phase 1 acceptance gate, as tests.
//
//   a multi-turn smoke run completes
//   every tool result reaches the adapter
//   a restart reconstructs the same run view from the events alone
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runLive } from '../../runtime/engine.ts';
import { readLiveEvents } from '../../runtime/event-log.ts';
import { reduce } from '../../runtime/run-view.ts';
import { smokeProvider } from '../../providers/smoke.ts';
import type { PresentationEvent } from '../../runtime/protocol.ts';
import { CHECK_COMMAND, makeArtifacts, makeStage, SYSTEM } from './helpers.ts';

const BRIEF = 'Make working/src/slugify.mjs pass the named check.';

test('a multi-turn smoke run drives the workspace from red to green', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  try {
    const session = smokeProvider('slugify');
    const view = await runLive({
      runId: 'e1',
      lane: 'shared',
      stage: stage.path,
      artifacts: evidence.artifacts,
      session,
      system: SYSTEM,
      brief: BRIEF,
      checkCommand: CHECK_COMMAND,
      checkExpectedExit: 0,
      budget: { maxTurns: 8, maxSeconds: 120 },
    });

    assert.equal(view.status, 'needs_evidence', 'the agent claims done; the gate has not run');
    assert.ok(view.turns >= 4, `a multi-turn run, not a single shot (turns=${view.turns})`);
    assert.equal(view.claimedDone, true);
    assert.equal(view.toolFailures, 1, 'the honest failing check happened once');

    // The world really moved: the stub is gone and the named check passes.
    const written = readFileSync(join(stage.path, 'working', 'src', 'slugify.mjs'), 'utf8');
    assert.match(written, /and/, 'the ampersand case is handled in the final file');
    assert.doesNotMatch(written, /not implemented/, 'the red stub was replaced');
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('every tool result completes the round trip back to the adapter', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  try {
    const session = smokeProvider('slugify');
    const view = await runLive({
      runId: 'e2',
      lane: 'shared',
      stage: stage.path,
      artifacts: evidence.artifacts,
      session,
      system: SYSTEM,
      brief: BRIEF,
      checkCommand: CHECK_COMMAND,
      checkExpectedExit: 0,
      budget: { maxTurns: 8, maxSeconds: 120 },
    });

    // Every request the harness recorded came back to the adapter as a result.
    assert.equal(
      session.observed.length,
      view.toolCalls,
      'no tool result was dropped between the harness and the adapter',
    );
    // And the adapter branched on one of them. Without the failed check
    // arriving, the smoke script stops early and says so.
    assert.ok(
      session.observed.some((o) => o.tool === 'run_check' && o.result.status === 'failed'),
      'the failing check reached the agent',
    );
    assert.ok(
      session.observed.some((o) => o.tool === 'run_check' && o.result.status === 'ok'),
      'the agent got to run the check again and saw it pass',
    );
    const conversation = view.conversation.filter((i) => i.kind === 'tool_result');
    assert.equal(conversation.length, view.toolCalls, 'each result is in the durable conversation');
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('a refusal is returned to the agent and the turn continues', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  try {
    const session = smokeProvider('refusal');
    const view = await runLive({
      runId: 'e3',
      lane: 'shared',
      stage: stage.path,
      artifacts: evidence.artifacts,
      session,
      system: SYSTEM,
      brief: 'Establish what you may read.',
      checkCommand: CHECK_COMMAND,
      checkExpectedExit: 0,
      budget: { maxTurns: 8, maxSeconds: 120 },
    });

    assert.equal(view.toolRefusals, 1);
    assert.equal(view.status, 'needs_evidence', 'a refusal does not end the run');
    assert.ok(
      session.observed.some((o) => o.result.status === 'refused'),
      'the agent read the refusal',
    );
    // No tool.dispatched for the refused call: policy ran before the effect.
    const events = readLiveEvents(join(evidence.dir, 'shared', 'events.jsonl'));
    const refused = events.find((e) => e.type === 'tool.refused')!;
    assert.ok(refused, 'the refusal is durable');
    assert.ok(
      !events.some(
        (e) => e.type === 'tool.dispatched' && e.data.call_id === refused.data.call_id,
      ),
      'nothing was dispatched for a refused call',
    );
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('the run view rebuilds identically from the events alone', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  try {
    const view = await runLive({
      runId: 'e4',
      lane: 'shared',
      stage: stage.path,
      artifacts: evidence.artifacts,
      session: smokeProvider('slugify'),
      system: SYSTEM,
      brief: BRIEF,
      checkCommand: CHECK_COMMAND,
      checkExpectedExit: 0,
      budget: { maxTurns: 8, maxSeconds: 120 },
    });

    const path = join(evidence.dir, 'shared', 'events.jsonl');
    const events = readLiveEvents(path);
    assert.ok(events.length >= 12, 'the run left a real trace');

    // A fresh process would do exactly this and nothing else.
    assert.deepEqual(reduce(events), view, 'same log, same view');
    assert.deepEqual(reduce(readLiveEvents(path)), view, 're-read, re-reduce, same view');

    // Folding prefix by prefix lands on the same final state.
    for (let i = 1; i <= events.length; i++) reduce(events.slice(0, i));
    assert.deepEqual(reduce(events.slice()), view);

    // The conversation a restarted process would receive is derived, not stored.
    assert.equal(view.conversation[0].kind, 'system');
    assert.equal(view.conversation[1].kind, 'brief');
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('a provider failure stops the lane and never starts a replay', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  const seen: PresentationEvent[] = [];
  try {
    const view = await runLive({
      runId: 'e5',
      lane: 'shared',
      stage: stage.path,
      artifacts: evidence.artifacts,
      session: smokeProvider('failure'),
      system: SYSTEM,
      brief: BRIEF,
      checkCommand: CHECK_COMMAND,
      checkExpectedExit: 0,
      budget: { maxTurns: 8, maxSeconds: 120 },
      onPresent: (event) => seen.push(event),
    });

    assert.equal(view.status, 'failed');
    assert.equal(view.failure!.code, 'smoke_scripted_failure');
    assert.equal(view.toolCalls, 0, 'nothing ran');
    assert.ok(
      seen.some((e) => e.kind === 'error'),
      'the failure is on screen as an error, not as a lesson surprise',
    );
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});

test('the turn budget is a hard stop, not a suggestion', async () => {
  const stage = makeStage();
  const evidence = makeArtifacts();
  try {
    const view = await runLive({
      runId: 'e6',
      lane: 'shared',
      stage: stage.path,
      artifacts: evidence.artifacts,
      session: smokeProvider('slugify'),
      system: SYSTEM,
      brief: BRIEF,
      checkCommand: CHECK_COMMAND,
      checkExpectedExit: 0,
      budget: { maxTurns: 2, maxSeconds: 120 },
    });
    assert.equal(view.status, 'failed');
    assert.equal(view.failure!.code, 'budget_turns');
    assert.equal(view.claimedDone, false);
  } finally {
    evidence.cleanup();
    stage.cleanup();
  }
});
