// Scaffolding for the live-runtime tests. Every test builds its own owned
// stage and its own artifact directory, so nothing here can touch the checkout
// and no two tests can see each other's evidence.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArtifactSet } from '../../runtime/artifacts.ts';
import { STAGE_MARKER } from '../../runtime/tool-catalog.ts';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface Stage {
  path: string;
  cleanup(): void;
}

// The same self-staging discipline as scripts/green-check.sh: start from the
// pristine red stub and the v1 check so the test tells the truth whatever
// state working/ happens to be in.
export function makeStage(): Stage {
  const path = mkdtempSync(join(tmpdir(), 'prove-it-live-test-'));
  for (const dir of ['control', 'working', 'done', 'fixtures'])
    cpSync(join(REPO, dir), join(path, dir), { recursive: true });
  mkdirSync(join(path, 'runs'), { recursive: true });
  writeFileSync(join(path, STAGE_MARKER), 'test\n');
  cpSync(
    join(path, 'control', 'checks', 'fixtures', 'solution-stub.mjs'),
    join(path, 'working', 'src', 'slugify.mjs'),
  );
  cpSync(
    join(path, 'control', 'checks', 'slugify.test.v1.mjs'),
    join(path, 'working', 'test', 'slugify.test.mjs'),
  );
  const rehash = spawnSync(
    process.execPath,
    [join(path, 'control', 'checks', 'rehash.mjs'), 'check-v1'],
    { cwd: path, encoding: 'utf8', env: { ...process.env, PROVE_IT_ROOT: path } },
  );
  if (rehash.status !== 0) throw new Error(`stage setup failed: ${rehash.stderr}`);
  // The shipped stage holds no signing key, so neither does a test stage.
  // Anything needing the gate borrows a root through withGateRoot, exactly as
  // the runtime does — a test harness that is safer than the real one proves
  // nothing about the real one.
  rmSync(join(path, 'control', 'gate.key'), { force: true });
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

export interface Evidence {
  dir: string;
  artifacts: ArtifactSet;
  cleanup(): void;
}

export function makeArtifacts(scenario = 'runtime-test'): Evidence {
  const dir = mkdtempSync(join(tmpdir(), 'prove-it-live-art-'));
  const artifacts = new ArtifactSet(dir, {
    scenario,
    mode: 'live',
    provider: 'smoke',
    startedAt: '2026-08-02T00:00:00.000Z',
  });
  return { dir, artifacts, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export const CHECK_COMMAND = 'node --test working/test/slugify.test.mjs';

export const SYSTEM = 'You are a worker inside a harness that executes every tool for you.';

export function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// Runs the operator CLI in its own process. Crash tests need this: the engine
// really does exit mid-run, which cannot be observed from inside the run.
export function cli(
  args: string[],
  extraEnv: Record<string, string> = {},
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [join(REPO, 'live', 'runtime', 'cli.ts'), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1', ...extraEnv },
  });
}
