// Lending the gate its key without giving it to the worker.
//
// dr-gate reads $PROVE_IT_ROOT/control/gate.key, and it has to judge the tree
// the worker actually produced. Those two facts used to be satisfied the easy
// way — point PROVE_IT_ROOT at the worker's stage — which put the signing key
// inside the world the worker could read. A provider with a shell found it.
//
// So the pairing is built per call instead:
//
//   control/   from the pristine checkout — rules, checks, and the key
//   the rest   from the stage — the candidate, the run state, the fixtures
//
// The tree being judged is the worker's. The rules judging it never were. What
// the gate produces comes back; the key does not, and the root is removed.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface GateRootOptions {
  repoRoot: string; // the pristine checkout — the only source of control/
  stage: string; // the worker's world
  id: string; // distinguishes concurrent roots
}

// Everything a gate-capable subprocess needs that the worker legitimately owns.
const FROM_STAGE = ['working', 'done', 'runs', 'sessions', 'src', 'fixtures'];

export function withGateRoot<T>(options: GateRootOptions, run: (root: string) => T): T {
  const root = join(tmpdir(), 'prove-it-gate', options.id);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });

  cpSync(join(options.repoRoot, 'control'), join(root, 'control'), { recursive: true });
  for (const dir of FROM_STAGE)
    if (existsSync(join(options.stage, dir)))
      cpSync(join(options.stage, dir), join(root, dir), { recursive: true });
  mkdirSync(join(root, 'runs'), { recursive: true });

  try {
    return run(root);
  } finally {
    // What the subprocess produced comes back. working/ is on this list
    // because a workflow node changes the candidate tree, and the next node
    // has to see it — leaving it behind meant node three ran against node
    // one's world. Never control/ itself, and never the key.
    for (const dir of ['working', 'runs', join('control', 'receipts')]) {
      const produced = join(root, dir);
      if (!existsSync(produced)) continue;
      mkdirSync(join(options.stage, dir), { recursive: true });
      cpSync(produced, join(options.stage, dir), { recursive: true });
    }
    rmSync(root, { recursive: true, force: true });
  }
}
