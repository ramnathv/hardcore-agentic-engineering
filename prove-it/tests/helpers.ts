// Test scaffolding: every test runs against a throwaway copy of the harness
// data (control/, working/, done/, fixtures/) so the checkout is never touched.
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function makeFixtureRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'prove-it-test-'));
  for (const d of ['control', 'working', 'done', 'fixtures'])
    cpSync(join(REPO, d), join(root, d), { recursive: true });
  mkdirSync(join(root, 'runs'), { recursive: true });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export interface RunResult {
  status: number | null;
  out: string;
}

export function run(
  root: string,
  file: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): RunResult {
  const opts: SpawnSyncOptions = {
    cwd: REPO,
    encoding: 'utf8',
    env: {
      ...process.env,
      PROVE_IT_ROOT: root,
      NODE_NO_WARNINGS: '1',
      ...extraEnv,
    },
  };
  const r = spawnSync(
    process.execPath,
    [join(REPO, file), ...args],
    opts,
  );
  return { status: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}

export const loop = (root: string, args: string[], env?: Record<string, string>) =>
  run(root, 'src/loop.ts', args, env);
export const gate = (root: string, args: string[]) => run(root, 'control/dr-gate.ts', args);
