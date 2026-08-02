// Minimal parser for the Done Contract schema in syllabus.md ("The Done Contract").
// It parses exactly that shape — zero dependencies, no general YAML.
import { readFileSync } from 'node:fs';
import { sha256 } from './root.ts';

export interface Check {
  command: string;
  expect_exit: number;
  retain_output?: string;
}

export interface Contract {
  outcome: string;
  checks: Check[];
  runtime_observation: string[];
  must_change: string[];
  must_not_change: string[];
  budgets: { attempts: number; elapsed_minutes: number };
  stop_and_ask: string[];
  release_owner: string;
  // Ported runs (PORT.md): both OPTIONAL. Absent → today's behavior, unchanged.
  // candidate_dir: the tree the gate hashes as the candidate — the student's own
  //   repo root. Absolute, or relative to the directory holding the contract file.
  // protect: files pinned at `loop open` and verified at check/verify — the
  //   student's own test files. Same path resolution as candidate_dir.
  candidate_dir: string | null;
  protect: string[];
}

// An inline `# comment` (whitespace before the #, YAML's rule) is not part of
// a value. Check commands are exempt: a shell command may contain '#', and the
// gate reads commands from the raw bytes anyway.
const uncomment = (v: string) => v.replace(/\s+#.*$/, '').trim();

export function parseContract(raw: string): Contract {
  const c: Contract = {
    outcome: '',
    checks: [],
    runtime_observation: [],
    must_change: [],
    must_not_change: [],
    budgets: { attempts: 0, elapsed_minutes: 0 },
    stop_and_ask: [],
    release_owner: '',
    candidate_dir: null,
    protect: [],
  };
  let section = '';
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = line.match(/^([a-z_]+):\s*(.*)$/);
    if (top) {
      section = top[1];
      const val = uncomment(top[2]);
      if (section === 'outcome') c.outcome = val;
      if (section === 'release_owner') c.release_owner = val;
      if (section === 'candidate_dir') c.candidate_dir = val || null;
      continue;
    }
    const item = line.match(/^\s+-\s+(.*)$/);
    const kv = line.match(/^\s+([a-z_]+):\s*(.*)$/);
    if (section === 'checks') {
      const ck = item?.[1].match(/^command:\s*(.*)$/);
      if (ck) c.checks.push({ command: ck[1].trim(), expect_exit: 0 });
      else if (kv && c.checks.length > 0) {
        const cur = c.checks[c.checks.length - 1];
        if (kv[1] === 'expect_exit') cur.expect_exit = Number(kv[2]);
        if (kv[1] === 'retain_output') cur.retain_output = kv[2].trim();
      }
    } else if (section === 'budgets' && kv) {
      if (kv[1] === 'attempts') c.budgets.attempts = Number(uncomment(kv[2]));
      if (kv[1] === 'elapsed_minutes') c.budgets.elapsed_minutes = Number(uncomment(kv[2]));
    } else if (item) {
      const lists: Record<string, string[]> = {
        runtime_observation: c.runtime_observation,
        must_change: c.must_change,
        must_not_change: c.must_not_change,
        stop_and_ask: c.stop_and_ask,
        protect: c.protect,
      };
      const entry = section === 'protect' ? uncomment(item[1]) : item[1].trim();
      if (entry) lists[section]?.push(entry);
    }
  }
  return c;
}

export function loadContract(path: string): { raw: string; sha: string; data: Contract } {
  const raw = readFileSync(path, 'utf8');
  return { raw, sha: sha256(raw), data: parseContract(raw) };
}
