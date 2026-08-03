// The tool boundary. Policy runs before dispatch, containment survives a
// symlink, the agent gets a bounded observation, and the artifact keeps
// everything. A tool that can reach outside the stage is not a tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyPolicy,
  assertOwnedStage,
  CATALOG,
  execute,
  lookup,
  prepareStageState,
  readLedger,
  toolSpecs,
  type ToolContext,
} from '../../runtime/tool-catalog.ts';
import { makeArtifacts, makeStage } from './helpers.ts';

const CHECK = 'node --test working/test/slugify.test.mjs';

function harness() {
  const stage = makeStage();
  const evidence = makeArtifacts();
  prepareStageState(stage.path);
  const lane = evidence.artifacts.lane('shared');
  let seq = 0;
  const context = (): ToolContext => {
    const callId = `c${++seq}`;
    return {
      stage: stage.path,
      checkCommand: CHECK,
      callId,
      writeArtifact: lane.toolWriter(callId),
    };
  };
  // Policy first, then execute — the same order the engine uses. A test that
  // called execute() directly would prove nothing about containment.
  const call = (tool: string, args: Record<string, unknown>) => {
    const ctx = context();
    return applyPolicy(tool, args, ctx) ?? execute(tool, args, ctx);
  };
  return {
    stage: stage.path,
    dir: evidence.dir,
    call,
    cleanup: () => {
      evidence.cleanup();
      stage.cleanup();
    },
  };
}

test('a read inside working/ is permitted', () => {
  const h = harness();
  try {
    const result = h.call('read_file', { path: 'working/BRIEF.md' });
    assert.equal(result.status, 'ok');
    assert.match((result as any).summary, /Brief/);
  } finally {
    h.cleanup();
  }
});

test('a write inside working/ is permitted and lands on disk', () => {
  const h = harness();
  try {
    const result = h.call('write_file', { path: 'working/src/note.mjs', content: 'export const a = 1;\n' });
    assert.equal(result.status, 'ok');
    assert.equal(readFileSync(join(h.stage, 'working', 'src', 'note.mjs'), 'utf8'), 'export const a = 1;\n');
  } finally {
    h.cleanup();
  }
});

test('a read outside working/ is refused before anything happens', () => {
  const h = harness();
  try {
    const result = h.call('read_file', { path: 'control/checks/manifest.json' });
    assert.equal(result.status, 'refused');
    assert.match((result as any).policy, /outside working\//);
  } finally {
    h.cleanup();
  }
});

test('a write outside working/ is refused', () => {
  const h = harness();
  try {
    const before = readFileSync(join(h.stage, 'done', 'contract.yaml'), 'utf8');
    const result = h.call('write_file', { path: 'done/contract.yaml', content: 'outcome: mine\n' });
    assert.equal(result.status, 'refused');
    assert.equal(
      readFileSync(join(h.stage, 'done', 'contract.yaml'), 'utf8'),
      before,
      'the contract is untouched',
    );
  } finally {
    h.cleanup();
  }
});

test('a symlink planted inside working/ does not launder the access', () => {
  const h = harness();
  try {
    symlinkSync(join(h.stage, 'control'), join(h.stage, 'working', 'escape'));
    const read = h.call('read_file', { path: 'working/escape/checks/manifest.json' });
    assert.equal(read.status, 'refused', 'the path resolves through the link before it is judged');

    const write = h.call('write_file', { path: 'working/escape/checks/manifest.json', content: '{}' });
    assert.equal(write.status, 'refused');
    assert.match(
      readFileSync(join(h.stage, 'control', 'checks', 'manifest.json'), 'utf8'),
      /protected/,
      'the real manifest survived',
    );
  } finally {
    h.cleanup();
  }
});

test('credential paths are refused whether or not the credential is real', () => {
  const h = harness();
  try {
    for (const path of ['control/gate.key', 'fixtures/fake-home/.ssh/id_rsa'])
      assert.equal(h.call('read_file', { path }).status, 'refused', path);
  } finally {
    h.cleanup();
  }
});

test('a tool outside the catalog is refused, and the refusal names the catalog', () => {
  const h = harness();
  try {
    for (const tool of ['run_shell', 'bash', 'http_get', 'exec']) {
      const result = h.call(tool, { command: 'rm -rf /' });
      assert.equal(result.status, 'refused', tool);
      assert.match((result as any).next, /read_file/, 'the agent is told what it may use');
    }
  } finally {
    h.cleanup();
  }
});

test('run_check runs the contract command only, and never an agent argument', () => {
  const h = harness();
  try {
    // The stage starts red on purpose.
    const red = h.call('run_check', {});
    assert.equal(red.status, 'failed');
    assert.equal((red as any).retryable, true);

    // Anything the agent adds is a schema violation, refused before dispatch.
    const smuggled = h.call('run_check', { command: 'echo pwned' });
    assert.equal(smuggled.status, 'refused');
    assert.match((smuggled as any).policy, /schema/);
  } finally {
    h.cleanup();
  }
});

test('full output goes to the artifact; the agent gets a bounded observation', () => {
  const h = harness();
  try {
    const big = 'x'.repeat(40_000) + '\nEND';
    h.call('write_file', { path: 'working/big.txt', content: big });
    const read = h.call('read_file', { path: 'working/big.txt' }) as any;

    const limit = lookup('read_file')!.resultLimit;
    assert.ok(read.summary.length < limit + 200, 'the observation is bounded');
    assert.match(read.summary, /truncated at \d+ characters/, 'the cut is declared, not silent');
    assert.equal(
      readFileSync(join(h.dir, read.artifact), 'utf8'),
      big,
      'the artifact holds every byte',
    );
  } finally {
    h.cleanup();
  }
});

test('an external effect without an idempotency key is refused', () => {
  const h = harness();
  try {
    const result = h.call('send_payment', { intent: 'invoice-1', amount: 10, idempotency_key: '' });
    assert.equal(result.status, 'refused');
    assert.match((result as any).policy, /idempotency key/);
    assert.equal(readLedger(h.stage).length, 0, 'nothing was recorded');
  } finally {
    h.cleanup();
  }
});

test('repeating a key records nothing new; a new key for the same intent pays twice', () => {
  const h = harness();
  try {
    const args = { intent: 'invoice-1', amount: 10, idempotency_key: 'k1' };
    assert.equal(h.call('send_payment', args).status, 'ok');
    assert.equal(readLedger(h.stage).length, 1);

    // The same key again: safe, and it says so.
    const repeat = h.call('send_payment', args) as any;
    assert.equal(repeat.status, 'ok');
    assert.match(repeat.summary, /already recorded/);
    assert.equal(readLedger(h.stage).length, 1, 'no second payment');

    // A blind retry that invents a new key is what duplicates the intent.
    // This is the mechanism S3 puts on screen; the tool does not hide it.
    h.call('send_payment', { ...args, idempotency_key: 'k2' });
    assert.equal(readLedger(h.stage).length, 2);
    const counted = h.call('inspect_ledger', { intent: 'invoice-1' }) as any;
    assert.match(counted.summary, /2 ledger entries/);
  } finally {
    h.cleanup();
  }
});

test('a human-owned action returns pending, never ok', () => {
  const h = harness();
  try {
    const result = h.call('request_release', { reason: 'the checks are green' }) as any;
    assert.equal(result.status, 'pending');
    assert.match(result.approvalId, /^apr-/);
  } finally {
    h.cleanup();
  }
});

test('the bridge refuses to run against a directory it does not own', () => {
  const h = harness();
  try {
    assert.throws(() => assertOwnedStage(join(h.stage, 'working')), /ownership marker/);
    assert.doesNotThrow(() => assertOwnedStage(h.stage));
  } finally {
    h.cleanup();
  }
});

test('every catalog entry declares the policy fields the boundary depends on', () => {
  for (const def of CATALOG) {
    assert.ok(def.description.length > 20, `${def.name} needs a description an agent can use`);
    assert.ok(def.resultLimit > 0, `${def.name} needs a result limit`);
    assert.equal(typeof def.screenSummary, 'function', `${def.name} needs a screen summary`);
    assert.ok(['object'].includes(typeof def.schema), `${def.name} needs an input schema`);
    // An external effect without a required key is the bug this line catches.
    if (def.effect === 'external_effect')
      assert.equal(def.idempotency, 'required_key', `${def.name} must require an idempotency key`);
  }
});

test('missing required arguments are refused before dispatch', () => {
  const h = harness();
  try {
    const result = h.call('read_file', {});
    assert.equal(result.status, 'refused');
    assert.match((result as any).policy, /missing required argument 'path'/);
  } finally {
    h.cleanup();
  }
});

test('a directory that does not exist is a failed read, not a refusal', () => {
  const h = harness();
  try {
    mkdirSync(join(h.stage, 'working', 'sub'), { recursive: true });
    writeFileSync(join(h.stage, 'working', 'sub', 'a.txt'), 'a');
    assert.equal(h.call('read_file', { path: 'working/sub/a.txt' }).status, 'ok');
    const missing = h.call('read_file', { path: 'working/sub/missing.txt' });
    assert.equal(missing.status, 'failed', 'inside the boundary, so it is a fact not a policy');
  } finally {
    h.cleanup();
  }
});

test('a lane may be given part of the catalog, and the rest is refused', () => {
  const h = harness();
  try {
    // What a lane can see is a control, and not advertising a tool is not the
    // same as refusing it — an agent can name a tool it was never offered.
    const allowed = ['read_file', 'send_payment'];
    const ctx = {
      stage: h.stage,
      checkCommand: CHECK,
      callId: 'c-subset',
      allowed,
      writeArtifact: () => 'ref',
    };

    const refused = applyPolicy('inspect_ledger', { intent: 'i-1' }, ctx);
    assert.equal(refused?.status, 'refused');
    assert.match((refused as any).policy, /not available in this lane/);
    assert.match((refused as any).next, /read_file, send_payment/, 'and it says what is');

    // The tools the lane does have are unaffected.
    assert.equal(applyPolicy('read_file', { path: 'working/BRIEF.md' }, ctx), null);
  } finally {
    h.cleanup();
  }
});

test('a hidden path is a sandbox boundary: refused both ways, and only there', () => {
  const h = harness();
  try {
    // S1's blind prefix: the check file exists — the gate and the operator use
    // it — but the worker's world does not contain it. Denied in both
    // directions, because a worker that cannot read a check must not be able
    // to rewrite it either.
    const ctx = {
      stage: h.stage,
      checkCommand: CHECK,
      callId: 'c-hidden',
      hidden: ['working/test'],
      writeArtifact: () => 'ref',
    };

    const read = applyPolicy('read_file', { path: 'working/test/slugify.test.mjs' }, ctx);
    assert.equal(read?.status, 'refused');
    assert.match((read as any).policy, /outside this lane's view/);

    const write = applyPolicy(
      'write_file',
      { path: 'working/test/slugify.test.mjs', content: 'export {}' },
      ctx,
    );
    assert.equal(write?.status, 'refused', 'hiding a file must also protect it');

    // A symlink from visible territory does not launder the access.
    symlinkSync(
      join(h.stage, 'working', 'test', 'slugify.test.mjs'),
      join(h.stage, 'working', 'src', 'peek.mjs'),
    );
    const laundered = applyPolicy('read_file', { path: 'working/src/peek.mjs' }, ctx);
    assert.equal(laundered?.status, 'refused', 'the boundary compares resolved paths');

    // The rest of working/ is untouched by the boundary.
    assert.equal(applyPolicy('read_file', { path: 'working/BRIEF.md' }, ctx), null);
    assert.equal(
      applyPolicy('write_file', { path: 'working/src/slugify.mjs', content: 'export {}' }, ctx),
      null,
    );
  } finally {
    h.cleanup();
  }
});

test('the advertised tool list is the lane subset, not the whole catalog', () => {
  const everything = toolSpecs().map((t) => t.name);
  const subset = toolSpecs(['read_file', 'run_check']).map((t) => t.name);
  assert.ok(everything.length > subset.length);
  assert.deepEqual(subset, ['read_file', 'run_check']);
  assert.ok(everything.includes('inspect_ledger'), 'the catalog still holds it');
});
