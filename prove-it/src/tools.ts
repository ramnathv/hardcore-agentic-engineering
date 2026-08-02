// Typed tool layer. The ToolResult union is the one from reader ch3 — the exact
// type is not important; the distinctions are.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { ROOT } from './root.ts';

export type ToolResult =
  | { status: 'ok'; summary: string; artifact?: string; changed?: string[] }
  | { status: 'failed'; summary: string; retryable: boolean; artifact?: string }
  | { status: 'in_doubt'; summary: string; reconcile: string; artifact?: string }
  | { status: 'refused'; policy: string; next: string }
  | { status: 'pending'; approvalId: string; summary: string };

export interface ToolContext {
  runDir: string; // where artifacts (full outputs) are retained
  checkCommand: string; // the contract's named check — the only allowlisted command
}

const CREDENTIAL_PATTERN = /gate\.key|\.ssh|id_rsa|fake-home|\.aws|credentials/;

// Resolve through symlinks, then test containment in working/. A symlink inside
// working/ that points at control/ must not launder the read.
function realTarget(path: string): string {
  const abs = resolve(ROOT, path);
  if (existsSync(abs)) return realpathSync(abs);
  const dir = existsSync(dirname(abs)) ? realpathSync(dirname(abs)) : dirname(abs);
  return join(dir, basename(abs));
}

function inWorking(path: string): boolean {
  return realTarget(path).startsWith(realpathSync(join(ROOT, 'working')) + sep);
}

let artifactSeq = 0;

export function dispatch(
  tool: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolResult {
  const path = String(args.path ?? '');
  switch (tool) {
    case 'read_file': {
      if (CREDENTIAL_PATTERN.test(realTarget(path)))
        return {
          status: 'refused',
          policy: 'credential read denied (fake or real, same rule)',
          next: 'credentials never enter worker context; use a scoped tool instead',
        };
      if (!inWorking(path))
        return {
          status: 'refused',
          policy: `read outside working/ denied: ${path}`,
          next: 'ask the operator to place needed context inside working/',
        };
      if (!existsSync(realTarget(path)))
        return { status: 'failed', summary: `no such file: ${path}`, retryable: false };
      const text = readFileSync(realTarget(path), 'utf8');
      return {
        status: 'ok',
        summary: `read ${path} (${text.length} bytes): ${text.split('\n')[0].slice(0, 80)}`,
        artifact: path,
      };
    }
    case 'write_file': {
      if (!inWorking(path))
        return {
          status: 'refused',
          policy: `write outside working/ denied: ${path}`,
          next: 'the worker owns working/ only; request a gate run for anything in control/',
        };
      mkdirSync(dirname(resolve(ROOT, path)), { recursive: true });
      writeFileSync(resolve(ROOT, path), String(args.content ?? ''));
      return { status: 'ok', summary: `wrote ${path}`, changed: [path] };
    }
    case 'run_check': {
      // Fixed command from the contract; arbitrary commands are a different tool
      // class (run_shell below) and are refused.
      const r = spawnSync('bash', ['-c', ctx.checkCommand], {
        cwd: ROOT,
        encoding: 'utf8',
        // NODE_TEST_CONTEXT scrubbed: a nested `node --test` inheriting it exits 0 on failure
        env: { ...process.env, NODE_NO_WARNINGS: '1', NODE_TEST_CONTEXT: undefined, NODE_OPTIONS: undefined },
      });
      const out = (r.stdout || '') + (r.stderr || '');
      mkdirSync(ctx.runDir, { recursive: true });
      const artifact = join(ctx.runDir, `tool-output-${++artifactSeq}.txt`);
      writeFileSync(artifact, out); // full output retained; observation stays bounded
      const tail = out.trim().split('\n').slice(-8).join('\n');
      if (r.status === 0)
        return { status: 'ok', summary: `check passed: ${ctx.checkCommand}`, artifact };
      return {
        status: 'failed',
        summary: `check failed (exit ${r.status}): ${ctx.checkCommand}\n${tail}`,
        retryable: true,
        artifact,
      };
    }
    case 'run_shell':
      return {
        status: 'refused',
        policy: 'arbitrary child processes are not allowlisted in the starter',
        next: 'use run_check, or add a policy class with an approval rule (M6)',
      };
    case 'http_get':
      return {
        status: 'refused',
        policy: 'network egress denied by default policy',
        next: 'add an allowlist entry and an approval rule (M6)',
      };
    case 'send_message':
      return {
        status: 'refused',
        policy: 'external write without a recorded operator approval',
        next: 'record an approval, then retry with an idempotency key (M6)',
      };
    case 'request_release':
      return {
        status: 'pending',
        approvalId: `apr-${Date.now().toString(36)}`,
        summary: 'release is a human-owned action; waiting on the release owner',
      };
    default:
      return { status: 'failed', summary: `unknown tool: ${tool}`, retryable: false };
  }
}

export function summarize(r: ToolResult): string {
  if (r.status === 'refused') return `refused — ${r.policy}`;
  if (r.status === 'pending') return `pending — ${r.summary}`;
  return `${r.status} — ${r.summary}`;
}
