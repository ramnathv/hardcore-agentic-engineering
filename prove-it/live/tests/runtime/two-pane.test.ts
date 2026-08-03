// The two-pane path, in real tmux.
//
// This test exists because every other test in this suite runs --seq, and --seq
// cannot see the bug it was written for. Sequentially, expectedSides is empty,
// so every barrier returns "alone" and the left lane always finishes before the
// right begins. Two panes are a different program: both lanes run at once, and
// a lane that waits for something its peer has not published yet deadlocks.
//
// S2 and S3 did exactly that. 86 passing tests and 14 clean rehearsals did not
// notice, because none of them ran two panes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { armBarriers } from '../../runtime/barriers.ts';
import { REPO } from './helpers.ts';

const tmux = (...args: string[]) => spawnSync('tmux', args, { encoding: 'utf8' });
const HAVE_TMUX = !tmux('-V').error;

// Mock keeps this keyless and quick; the deadlock was in the barriers, which
// do not care whether a lane's work was a real agent or a replay.
for (const scenario of ['s1', 's2', 's3', 's4', 's5', 's6']) {
  test(`${scenario} completes with both panes running at once`, { skip: !HAVE_TMUX }, async () => {
    const art = mkdtempSync(join(tmpdir(), `prove-it-panes-${scenario}-`));
    const session = `prove-it-test-${scenario}-${process.pid}`;
    try {
      armBarriers(art, ['left', 'right']);
      const pane = (side: string) =>
        `cd '${REPO}' && NODE_NO_WARNINGS=1 node live/runner.ts ${scenario} --mock --ci ` +
        `--lane ${side} --artifact '${art}'; sleep 120`;
      tmux('new-session', '-d', '-s', session, '-x', '240', '-y', '56', pane('left'));
      tmux('split-window', '-d', '-h', '-t', `${session}:0`, pane('right'));

      const frames = join(art, 'frames.txt');
      const deadline = Date.now() + 150_000;
      let lines: string[] = [];
      while (Date.now() < deadline) {
        lines = existsSync(frames)
          ? readFileSync(frames, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'))
          : [];
        if (lines.length >= 8) break;
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Eight frames: four each, both lanes, all arrived.
      assert.equal(
        lines.length,
        8,
        `only ${lines.length}/8 frames — a lane is blocked on something its peer never published`,
      );
      for (const side of ['left', 'right'])
        for (const frame of ['START', 'SURPRISE', 'CONTROL', 'VERDICT'])
          assert.ok(
            lines.some((l) => l.startsWith(`${side} ${frame} `)),
            `${side} never reached ${frame}`,
          );
      assert.equal(lines.filter((l) => l.includes('UNEXPECTED')).length, 0);
    } finally {
      tmux('kill-session', '-t', session);
      // The panes are still writing into the artifact as the session dies, so
      // removing it immediately races them. Give them a moment, then insist.
      await new Promise((r) => setTimeout(r, 500));
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          rmSync(art, { recursive: true, force: true });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }
  });
}
