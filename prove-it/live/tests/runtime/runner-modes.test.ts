// The two display modes, asserted against the shipped runner.
//
//   --details changes how much reaches the screen, and nothing else.
//   --capture replays, and never starts a provider.
//
// These drive live/runner.ts as an operator does. They are slower than the
// unit tests because they are the only thing that can prove the wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO } from './helpers.ts';

function runner(args: string[], artifact: string) {
  return spawnSync(
    process.execPath,
    [join(REPO, 'live', 'runner.ts'), ...args, '--artifact', artifact],
    { cwd: REPO, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
  );
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'prove-it-modes-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '');
// Run ids are derived from the clock, so two runs never share one. Everything
// else in the evidence has to match.
const normalize = (text: string) => text.replace(/s1r-[a-z0-9]+/g, 'RUNID');

test('--details changes the screen and leaves the artifact alone', () => {
  const plain = scratch();
  const detailed = scratch();
  try {
    const a = runner(['s1', '--mock', '--seq', '--ci'], plain.dir);
    const b = runner(['s1', '--mock', '--seq', '--ci', '--details'], detailed.dir);
    assert.equal(a.status, 0, a.stdout + a.stderr);
    assert.equal(b.status, 0, b.stdout + b.stderr);

    for (const file of ['frames.txt', 'decision.txt']) {
      const left = normalize(readFileSync(join(plain.dir, file), 'utf8'));
      const right = normalize(readFileSync(join(detailed.dir, file), 'utf8'));
      assert.equal(right, left, `--details changed ${file}, and it must not`);
    }

    // The evidence is identical; the screen is allowed to differ. What it must
    // never do is exceed one pane, in either mode.
    for (const output of [strip(a.stdout), strip(b.stdout)]) {
      const overwide = output.split('\n').filter((line) => line.length > 118);
      assert.equal(overwide.length, 0, `a rendered line exceeded one pane: ${overwide[0]}`);
    }
  } finally {
    plain.cleanup();
    detailed.cleanup();
  }
});

test('--capture replays the recorded worker and starts no provider', () => {
  const s = scratch();
  try {
    const result = runner(['s1', '--seq', '--ci', '--capture'], s.dir);
    assert.equal(result.status, 0, result.stdout + result.stderr);

    const output = strip(result.stdout + result.stderr);
    assert.match(output, /REPLAY/, 'the replay is labelled on screen');
    // The provenance line wraps to the pane, so match a fragment that survives it.
    assert.match(output, /--capture was given/, 'and its provenance is named');
    // The decisive assertion: --capture is real mode with no provider in it.
    assert.doesNotMatch(output, /\$ claude /, 'no provider command was issued');

    // A replay still produces the full evidence shape, or it is not a rehearsal
    // of anything.
    const frames = readFileSync(join(s.dir, 'frames.txt'), 'utf8');
    for (const frame of ['START', 'SURPRISE', 'CONTROL', 'VERDICT'])
      for (const side of ['left', 'right'])
        assert.match(frames, new RegExp(`^${side} ${frame} `, 'm'), `${side} ${frame} is missing`);
  } finally {
    s.cleanup();
  }
});

test('a live step that fails names --capture instead of replaying by itself', () => {
  // The runner is asked to run a scenario in real mode with a provider that is
  // not there. It must stop and say so, not quietly show a recording.
  const s = scratch();
  try {
    const result = spawnSync(
      process.execPath,
      [join(REPO, 'live', 'runner.ts'), 's1', '--seq', '--ci', '--artifact', s.dir],
      {
        cwd: REPO,
        encoding: 'utf8',
        // An empty PATH entry for the provider: `claude` cannot be found.
        env: { ...process.env, NODE_NO_WARNINGS: '1', PATH: '/usr/bin:/bin' },
      },
    );
    const output = strip(result.stdout + result.stderr);
    assert.match(output, /UNEXPECTED/, 'the failure is reported as a failure');
    assert.match(output, /--capture/, 'and the operator is told the next command');
    assert.doesNotMatch(
      output,
      /replaces the live worker because the live step/,
      'nothing fell back to a recording on its own',
    );
    assert.notEqual(result.status, 0, 'a failed live step is not a passing run');
  } finally {
    s.cleanup();
  }
});
