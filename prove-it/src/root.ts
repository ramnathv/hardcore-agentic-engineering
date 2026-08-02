// Shared worker-side plumbing. control/dr-gate.ts deliberately does NOT import
// this file: the gate must not depend on code the student extends.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const ROOT =
  process.env.PROVE_IT_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Node >= 22.18 runs .ts directly; no flag, no build step.
export const NODE_ARGS: string[] = [];

export const sha256 = (b: Buffer | string): string =>
  createHash('sha256').update(b).digest('hex');

// Content identity of a candidate tree (works without git in working/).
export function treeHash(dir: string): string {
  const h = createHash('sha256');
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const p = join(d, e.name);
      if (e.isSymbolicLink()) h.update(relative(dir, p) + ':symlink');
      else if (e.isDirectory()) walk(p);
      else {
        h.update(relative(dir, p));
        h.update(readFileSync(p));
      }
    }
  };
  walk(dir);
  return 'tree:' + h.digest('hex');
}

// The only sanctioned path from worker context to the gate: request a run.
export function requestGate(cmd: 'check' | 'verify', runId: string) {
  const r = spawnSync(
    process.execPath,
    [...NODE_ARGS, join(ROOT, 'control', 'dr-gate.ts'), cmd, runId],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, PROVE_IT_ROOT: ROOT, NODE_NO_WARNINGS: '1' },
    },
  );
  return { ok: r.status === 0, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}
