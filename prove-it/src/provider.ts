// Provider adapters. The smoke provider is scripted and keyless: it tests
// harness plumbing, not model capability. The CLI adapters shell out to real
// agents and say so loudly when the binary is missing — no silent fallback.
import { spawnSync } from 'node:child_process';

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface Turn {
  text?: string;
  tools?: ToolCall[];
}

export interface Provider {
  name: string;
  nextTurn(turn: number, observation: string | null): Turn | null;
}

const NAIVE = `export function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
`;

const CORRECT = `export function slugify(title) {
  return title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
`;

// Scripted multi-turn conversation: one honest tool failure at turn 2 (the
// naive implementation misses the ampersand case), a natural interrupt point
// at any turn boundary, and a final "done" claim that the gate must judge.
export function smokeProvider(): Provider {
  const script: Turn[] = [
    {
      text: 'Reading the brief and the current implementation.',
      tools: [{ tool: 'read_file', args: { path: 'working/src/slugify.mjs' } }],
    },
    {
      text: 'Writing a first implementation and running the named check.',
      tools: [
        {
          tool: 'write_file',
          args: { path: 'working/src/slugify.mjs', content: NAIVE },
        },
        { tool: 'run_check', args: {} },
      ],
    },
    {
      text: 'The check failed on the ampersand case. Fixing and re-running.',
      tools: [
        {
          tool: 'write_file',
          args: { path: 'working/src/slugify.mjs', content: CORRECT },
        },
        { tool: 'run_check', args: {} },
      ],
    },
    {
      text: 'All named checks pass in my workspace. I believe this is done — the gate decides.',
    },
  ];
  return { name: 'smoke', nextTurn: (turn) => script[turn - 1] ?? null };
}

// Real CLI adapters run a single text-only turn in the starter: enough to prove
// a live provider is wired. Students bridge tools to a real provider in M3+.
function cliProvider(name: string, bin: string, argsFor: (p: string) => string[]): Provider {
  return {
    name,
    nextTurn(turn) {
      if (turn > 1) return null;
      const probe = spawnSync(bin, ['--version'], { encoding: 'utf8' });
      if (probe.error || probe.status !== 0) {
        console.error(
          `provider '${name}' unavailable: '${bin}' not found on PATH.\n` +
            `No silent fallback. Use --provider smoke (keyless) or install ${bin}.`,
        );
        process.exit(1);
      }
      const prompt =
        'Read working/test/slugify.test.mjs and propose (text only, no edits) how you ' +
        'would make working/src/slugify.mjs pass it. This starter adapter runs one ' +
        'text-only turn; the harness owns all tool execution.';
      const r = spawnSync(bin, argsFor(prompt), { encoding: 'utf8', timeout: 180_000 });
      const text = ((r.stdout || '') + (r.stderr || '')).trim() || '(no output)';
      if (text.length > 2000)
        return { text: text.slice(0, 2000) + '\n… (truncated at 2000 chars by the adapter)' };
      return { text };
    },
  };
}

export function getProvider(name: string): Provider {
  if (name === 'smoke') return smokeProvider();
  if (name === 'claude-cli') return cliProvider('claude-cli', 'claude', (p) => ['-p', p]);
  if (name === 'codex-cli') return cliProvider('codex-cli', 'codex', (p) => ['exec', p]);
  console.error(`unknown provider '${name}' (have: smoke, claude-cli, codex-cli)`);
  process.exit(1);
}
