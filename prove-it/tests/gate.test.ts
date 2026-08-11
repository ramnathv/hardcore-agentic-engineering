// Receipt binding: contract fixed before the run, forged markers refused,
// replayed receipts refused, stale candidates refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gate, loop, makeFixtureRoot } from './helpers.ts';

test('contract hash is fixed before the run; a changed contract is refused', () => {
  const { root, cleanup } = makeFixtureRoot();
  try {
    assert.equal(loop(root, ['run', '--provider', 'smoke', '--run-id', 'r1']).status, 0);
    const manifest = JSON.parse(readFileSync(join(root, 'runs', 'r1', 'run.json'), 'utf8'));
    assert.match(manifest.contract_sha256, /^[0-9a-f]{64}$/, 'run.json pins the pre-run contract sha');

    appendFileSync(join(root, 'done', 'contract.yaml'), '# moved goalposts\n');
    const r = gate(root, ['check', 'r1']);
    assert.notEqual(r.status, 0);
    assert.match(r.out, /contract hash mismatch/);
  } finally {
    cleanup();
  }
});

test('a forged accepted.json not issued by the gate is refused', () => {
  const { root, cleanup } = makeFixtureRoot();
  try {
    assert.equal(loop(root, ['run', '--provider', 'smoke', '--run-id', 'r2']).status, 0);
    const forged = {
      run_id: 'r2',
      contract_sha256: '0'.repeat(64),
      check_version: 'check-v1',
      candidate_tree: 'tree:forged',
      checks: [],
      issued_at: new Date().toISOString(),
      sig: 'deadbeef'.repeat(8),
    };
    writeFileSync(join(root, 'control', 'receipts', 'r2.json'), JSON.stringify(forged));
    writeFileSync(join(root, 'control', 'receipts', 'accepted.json'), JSON.stringify(forged));

    const v = gate(root, ['verify', 'r2']);
    assert.notEqual(v.status, 0);
    assert.match(v.out, /not issued by this gate/);

    // and the harness refuses to transition to completed on it
    const c = loop(root, ['complete', 'r2']);
    assert.notEqual(c.status, 0);
    assert.match(c.out, /gate refused/);
  } finally {
    cleanup();
  }
});

test('an older receipt replayed against a new run is refused', () => {
  const { root, cleanup } = makeFixtureRoot();
  try {
    assert.equal(loop(root, ['run', '--provider', 'smoke', '--run-id', 'old']).status, 0);
    assert.equal(gate(root, ['check', 'old']).status, 0);
    assert.equal(loop(root, ['open', '--run-id', 'new']).status, 0);
    writeFileSync(
      join(root, 'control', 'receipts', 'new.json'),
      readFileSync(join(root, 'control', 'receipts', 'old.json')),
    );
    const v = gate(root, ['verify', 'new']);
    assert.notEqual(v.status, 0);
    assert.match(v.out, /receipt run mismatch: replay of run 'old'/);
  } finally {
    cleanup();
  }
});

test('old receipt + changed working tree prints "receipt stale: candidate tree mismatch"', () => {
  const { root, cleanup } = makeFixtureRoot();
  try {
    assert.equal(loop(root, ['run', '--provider', 'smoke', '--run-id', 'r3']).status, 0);
    assert.equal(gate(root, ['check', 'r3']).status, 0);
    assert.equal(gate(root, ['verify', 'r3']).status, 0, 'receipt verifies before drift');

    appendFileSync(join(root, 'working', 'src', 'slugify.mjs'), '// drift\n');
    const v = gate(root, ['verify', 'r3']);
    assert.notEqual(v.status, 0);
    assert.match(v.out, /receipt stale: candidate tree mismatch/);
  } finally {
    cleanup();
  }
});

test('the gate accepts a nonzero exit status when the contract names it', () => {
  const { root, cleanup } = makeFixtureRoot();
  try {
    const contractPath = join(root, 'done', 'contract.yaml');
    const contract = readFileSync(contractPath, 'utf8').replace(
      '  - command: node --test working/test/slugify.test.mjs\n    expect_exit: 0',
      '  - command: node -e "process.exit(1)"\n    expect_exit: 1',
    );
    writeFileSync(contractPath, contract);

    const run = loop(root, ['run', '--provider', 'smoke', '--run-id', 'expected-one']);
    assert.equal(run.status, 0, run.out);
    assert.match(run.out, /check passed \(exit 1 as contracted\)/);
    const result = gate(root, ['check', 'expected-one']);

    assert.equal(result.status, 0, result.out);
    const receipt = JSON.parse(
      readFileSync(join(root, 'control', 'receipts', 'expected-one.json'), 'utf8'),
    );
    assert.deepEqual(receipt.checks[0], {
      command: 'node -e "process.exit(1)"',
      exit: 1,
      expected: 1,
      outcome: 'satisfied',
    });
  } finally {
    cleanup();
  }
});

test('the gate refuses exit 2 as inconclusive when the contract expects another status', () => {
  const { root, cleanup } = makeFixtureRoot();
  try {
    const contractPath = join(root, 'done', 'contract.yaml');
    const contract = readFileSync(contractPath, 'utf8').replace(
      '  - command: node --test working/test/slugify.test.mjs\n    expect_exit: 0',
      '  - command: node -e "console.error(\'unavailable\'); process.exit(2)"\n' +
        '    expect_exit: 0',
    );
    writeFileSync(contractPath, contract);

    assert.equal(loop(root, ['open', '--run-id', 'inconclusive']).status, 0);
    const result = gate(root, ['check', 'inconclusive']);

    assert.notEqual(result.status, 0);
    assert.match(result.out, /check inconclusive: .* returned exit 2, expected exit 0/);
    assert.equal(
      readFileSync(join(root, 'runs', 'inconclusive', 'check-output.txt'), 'utf8'),
      'unavailable\n',
      'the explanation is retained as evidence, but the exit status decides the outcome',
    );
  } finally {
    cleanup();
  }
});
