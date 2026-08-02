// The S4 tamper table script must show every row refused (or rechecked /
// fault-caught where the syllabus says so). This drives the real script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO } from './helpers.ts';

test('tamper-table.sh: all six rows behave as the syllabus requires', () => {
  const r = spawnSync('bash', [join(REPO, 'scripts', 'tamper-table.sh')], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.equal(r.status, 0, `tamper table exited ${r.status}:\n${out}`);
  assert.match(out, /row 1:[\s\S]*?→ REFUSED/);
  assert.match(out, /row 2:[\s\S]*?suppressed check: '\|\| true'[\s\S]*?→ REFUSED/);
  assert.match(out, /row 3:[\s\S]*?protected check target missing[\s\S]*?→ REFUSED/);
  assert.match(out, /row 4:[\s\S]*?replay of run[\s\S]*?→ REFUSED/);
  assert.match(out, /row 5:[\s\S]*?receipt stale: candidate tree mismatch[\s\S]*?RECHECKED/);
  assert.match(out, /row 6:[\s\S]*?CHECK STRENGTHENED, THEN FAULT CAUGHT/);
  for (const pat of ['\\|\\| true', '--no-verify', '--exit-zero', '--passWithNoTests'])
    assert.match(out, new RegExp(`'${pat}' → refused`));
  assert.match(out, /'; exit 0' → refused/);
  assert.match(out, /all six rows behaved/);
});
