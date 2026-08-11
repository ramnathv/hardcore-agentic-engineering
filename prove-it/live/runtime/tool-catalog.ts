// The tool boundary. The agent names a tool; the harness owns everything after
// that — policy, dispatch, execution, the result, and the artifact.
//
// Two rules hold for every entry in this file:
//
//   Policy runs before dispatch. A refusal is recorded and returned to the
//   agent, and no effect has happened.
//
//   Nothing reaches the real checkout. Every path resolves through symlinks
//   and must land inside an owned temporary stage.
//
// The path guard mirrors src/tools.ts on purpose: the student harness and the
// live runtime teach one containment rule, not two. It is reimplemented rather
// than imported because the live version resolves against an explicit stage
// instead of a module-level root.
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { assessCheckExit, checkSummary } from '../../control/check-exit.ts';
import type { LiveToolResult, ToolSpec } from './protocol.ts';
import { withGateRoot } from './gate-root.ts';

// The runner already marks every staged lane with this file. Cleanup refuses
// directories without it, and so does the tool bridge.
export const STAGE_MARKER = '.prove-it-live-lane';

export type EffectClass = 'read' | 'local_write' | 'process' | 'external_effect' | 'approval';
export type ApprovalClass = 'none' | 'operator' | 'human_owner';
export type IdempotencyRule = 'not_required' | 'natural' | 'required_key';
export type ArtifactRule = 'none' | 'result' | 'process_output';

export interface ToolContext {
  stage: string; // the owned temporary stage — never the checkout
  // The pristine checkout. Read only to lend a gate-capable subprocess the
  // rules it judges by; nothing a worker asks for ever resolves here.
  repoRoot: string;
  checkCommand: string; // the one command locked in the contract
  checkExpectedExit: number; // the status that satisfies that check
  callId: string;
  // The tools this lane may use. Absent means the whole catalog. Not
  // advertising a tool is not the same as refusing it: an agent can name a
  // tool it was never offered, so the boundary has to say no here too.
  allowed?: string[];
  // Stage-relative paths this lane's world does not contain — a sandbox
  // boundary, not a secret. The file stays on disk for the gate and the
  // operator; the worker is refused in both directions, because a worker that
  // cannot read a check must not be able to rewrite it either.
  hidden?: string[];
  // Writes the full record and returns the reference that goes on screen and
  // into the event. artifacts.ts supplies this.
  writeArtifact(kind: string, body: string): string;
}

export interface ToolDef {
  name: string;
  description: string;
  effect: EffectClass;
  approval: ApprovalClass;
  idempotency: IdempotencyRule;
  resultLimit: number; // characters returned to the agent
  artifact: ArtifactRule;
  schema: Record<string, unknown>;
  screenSummary(args: Record<string, unknown>): string;
  // null means permitted. Anything else is a refusal, recorded before dispatch.
  policy?(args: Record<string, unknown>, ctx: ToolContext): LiveToolResult | null;
  run(args: Record<string, unknown>, ctx: ToolContext): LiveToolResult;
}

// ---------------------------------------------------------------------------
// Stage containment
// ---------------------------------------------------------------------------

export function assertOwnedStage(stage: string): string {
  if (!existsSync(stage)) throw new Error(`stage does not exist: ${stage}`);
  const real = realpathSync(stage);
  if (!existsSync(join(real, STAGE_MARKER)))
    throw new Error(
      `refusing to run tools against '${real}': no ${STAGE_MARKER} ownership marker.\n` +
        'The live runtime only ever touches a stage it created.',
    );
  return real;
}

const CREDENTIAL_PATTERN = /gate\.key|\.ssh|id_rsa|fake-home|\.aws|credentials|\.env\b/;

// Resolve through symlinks before deciding anything. A symlink planted inside
// working/ that points at control/ must not launder the access.
function realTarget(stage: string, path: string): string {
  const abs = resolve(stage, path);
  if (existsSync(abs)) return realpathSync(abs);
  const parent = dirname(abs);
  const realParent = existsSync(parent) ? realpathSync(parent) : parent;
  return join(realParent, basename(abs));
}

// Any doubt is a refusal. A stage with no working/ is a broken stage, and the
// safe answer to "is this path contained" is then no, not an exception.
function inStageWorking(stage: string, path: string): boolean {
  try {
    const working = realpathSync(join(stage, 'working'));
    return realTarget(stage, path).startsWith(working + sep);
  } catch {
    return false;
  }
}

function guardPath(
  args: Record<string, unknown>,
  ctx: ToolContext,
  verb: 'read' | 'write',
): LiveToolResult | null {
  const path = String(args.path ?? '');
  const target = realTarget(ctx.stage, path);
  if (CREDENTIAL_PATTERN.test(target))
    return {
      status: 'refused',
      policy: 'credential path denied (fake or real, same rule)',
      next: 'credentials never enter worker context; ask for a scoped tool instead',
    };
  if (!inStageWorking(ctx.stage, path))
    return {
      status: 'refused',
      policy: `${verb} outside working/ denied: ${path}`,
      next: 'the worker owns working/ only; everything else needs an operator',
    };
  // Resolved before comparing, so a symlink cannot launder a hidden path any
  // more than it can launder an outside one.
  for (const prefix of ctx.hidden ?? []) {
    const boundary = realTarget(ctx.stage, prefix);
    if (target === boundary || target.startsWith(boundary + sep))
      return {
        status: 'refused',
        policy: `${verb} denied: ${prefix} is outside this lane's view`,
        next: 'this lane works from its brief alone; the named check runs outside it',
      };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Result bounding
// ---------------------------------------------------------------------------

// The agent gets a bounded observation; the artifact keeps everything. A
// truncated result says so and says where the rest is — a silent cut would
// teach the agent to trust a partial read.
function bound(text: string, limit: number, artifact?: string): string {
  if (text.length <= limit) return text;
  // The artifact reference is deliberately not named here. It is an operator's
  // path, inside the evidence directory, which no tool will let an agent read —
  // naming it sent one coordinator chasing a file it could never open, and
  // earned it a refusal for trying. The agent is told the cut happened and
  // nothing it cannot act on.
  return `${text.slice(0, limit)}\n… (truncated at ${limit} characters; the harness retained the rest)`;
}

// ---------------------------------------------------------------------------
// The external-effect fixture: a ledger with idempotency keys
// ---------------------------------------------------------------------------

interface LedgerEntry {
  intent: string;
  idempotency_key: string;
  amount: number;
  currency: string;
  ts: string;
}

function ledgerPath(stage: string): string {
  return join(stage, 'live-state', 'ledger.jsonl');
}

function readLedger(stage: string): LedgerEntry[] {
  const path = ledgerPath(stage);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as LedgerEntry);
}

function appendLedger(stage: string, entry: LedgerEntry): void {
  const path = ledgerPath(stage);
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, 'a');
  try {
    writeSync(fd, JSON.stringify(entry) + '\n');
    fsyncSync(fd); // the effect is durable before the harness records anything
  } finally {
    closeSync(fd);
  }
}

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

const readFile: ToolDef = {
  name: 'read_file',
  description:
    'Read a UTF-8 file from the workspace. Paths are relative to the workspace root ' +
    'and must be inside working/.',
  effect: 'read',
  approval: 'none',
  idempotency: 'natural',
  resultLimit: 6000,
  artifact: 'result',
  schema: {
    type: 'object',
    required: ['path'],
    additionalProperties: false,
    properties: { path: { type: 'string' } },
  },
  screenSummary: (args) => String(args.path ?? ''),
  policy: (args, ctx) => guardPath(args, ctx, 'read'),
  run(args, ctx) {
    const path = String(args.path ?? '');
    const target = realTarget(ctx.stage, path);
    if (!existsSync(target))
      return { status: 'failed', summary: `no such file: ${path}`, retryable: false };
    const text = readFileSync(target, 'utf8');
    const artifact = ctx.writeArtifact('stdout.txt', text);
    return {
      status: 'ok',
      summary: bound(text, this.resultLimit, artifact),
      artifact,
    };
  },
};

const writeFile: ToolDef = {
  name: 'write_file',
  description:
    'Write a UTF-8 file in the workspace, creating parent directories. Paths must ' +
    'be inside working/. This replaces the whole file.',
  effect: 'local_write',
  approval: 'none',
  idempotency: 'natural',
  resultLimit: 400,
  artifact: 'result',
  schema: {
    type: 'object',
    required: ['path', 'content'],
    additionalProperties: false,
    properties: { path: { type: 'string' }, content: { type: 'string' } },
  },
  screenSummary: (args) => String(args.path ?? ''),
  policy: (args, ctx) => guardPath(args, ctx, 'write'),
  run(args, ctx) {
    const path = String(args.path ?? '');
    const content = String(args.content ?? '');
    const target = resolve(ctx.stage, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    const artifact = ctx.writeArtifact('stdout.txt', content);
    return {
      status: 'ok',
      summary: `wrote ${path} (${content.length} bytes)`,
      artifact,
      changed: [path],
    };
  },
};

const runCheck: ToolDef = {
  name: 'run_check',
  description:
    'Run the named check locked in the contract and report whether it passed. ' +
    'The command is fixed by the operator and takes no arguments.',
  effect: 'process',
  approval: 'none',
  idempotency: 'natural',
  resultLimit: 2500,
  artifact: 'process_output',
  schema: { type: 'object', required: [], additionalProperties: false, properties: {} },
  screenSummary: () => '',
  run(args, ctx) {
    // The contract's command, never the agent's. An agent-supplied command is a
    // different effect class and there is no tool for it.
    const r = spawnSync('bash', ['-c', ctx.checkCommand], {
      cwd: ctx.stage,
      encoding: 'utf8',
      timeout: 120_000,
      // A nested `node --test` that inherits NODE_TEST_CONTEXT exits 0 on
      // failure, which would turn a red check green. Scrub it.
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        NODE_TEST_CONTEXT: undefined,
        NODE_OPTIONS: undefined,
      },
    });
    const stdout = r.stdout || '';
    const stderr = r.stderr || '';
    // Both streams are retained; the reference points at stdout, where a test
    // runner puts the result an operator actually wants to read.
    const artifact = ctx.writeArtifact('stdout.txt', stdout);
    ctx.writeArtifact('stderr.txt', stderr);
    const combined = (stdout + stderr).trim();
    const assessment = assessCheckExit(r.status, ctx.checkExpectedExit);
    if (assessment.accepted)
      return {
        status: 'ok',
        summary: checkSummary(ctx.checkCommand, assessment),
        artifact,
      };
    const tail = combined.split('\n').slice(-24).join('\n');
    return {
      status: 'failed',
      summary: bound(
        `${checkSummary(ctx.checkCommand, assessment)}\n${tail}`,
        this.resultLimit,
        artifact,
      ),
      retryable: true,
      artifact,
    };
  },
};

const requestRelease: ToolDef = {
  name: 'request_release',
  description:
    'Request a release. Release is a human-owned action: this returns a pending ' +
    'approval and never completes on its own.',
  effect: 'approval',
  approval: 'human_owner',
  idempotency: 'natural',
  resultLimit: 400,
  artifact: 'none',
  schema: {
    type: 'object',
    required: ['reason'],
    additionalProperties: false,
    properties: { reason: { type: 'string' } },
  },
  screenSummary: (args) => String(args.reason ?? ''),
  run(args, ctx) {
    // Derived from the call id, not the clock: the same run replays to the
    // same approval id.
    return {
      status: 'pending',
      approvalId: `apr-${ctx.callId}`,
      summary: 'release is a human-owned action; waiting on the release owner',
    };
  },
};

const sendPayment: ToolDef = {
  name: 'send_payment',
  description:
    'Send a payment for one intent. Requires an idempotency key. Repeating a key ' +
    'is safe and records nothing new; a new key for the same intent pays again.',
  effect: 'external_effect',
  approval: 'operator',
  idempotency: 'required_key',
  resultLimit: 500,
  artifact: 'result',
  schema: {
    type: 'object',
    required: ['intent', 'amount', 'idempotency_key'],
    additionalProperties: false,
    properties: {
      intent: { type: 'string' },
      amount: { type: 'number' },
      currency: { type: 'string' },
      idempotency_key: { type: 'string' },
    },
  },
  screenSummary: (args) => `${args.intent} · ${args.amount} · key=${args.idempotency_key}`,
  policy(args) {
    const key = String(args.idempotency_key ?? '').trim();
    if (!key)
      return {
        status: 'refused',
        policy: 'external effect without an idempotency key',
        next: 'supply a stable idempotency_key derived from the intent, then retry',
      };
    return null;
  },
  run(args, ctx) {
    const intent = String(args.intent);
    const key = String(args.idempotency_key);
    const ledger = readLedger(ctx.stage);
    const seen = ledger.find((e) => e.idempotency_key === key);
    if (seen)
      return {
        status: 'ok',
        summary: `already recorded under key ${key}; no second payment was made`,
      };
    const entry: LedgerEntry = {
      intent,
      idempotency_key: key,
      amount: Number(args.amount),
      currency: String(args.currency ?? 'USD'),
      ts: new Date().toISOString(),
    };
    appendLedger(ctx.stage, entry);
    const artifact = ctx.writeArtifact('stdout.txt', JSON.stringify(entry, null, 2));
    return {
      status: 'ok',
      summary: `payment recorded for ${intent} under key ${key}`,
      artifact,
    };
  },
};

const inspectLedger: ToolDef = {
  name: 'inspect_ledger',
  description:
    'Count the ledger entries recorded for one intent. Use this before assuming a ' +
    'payment did or did not happen.',
  effect: 'read',
  approval: 'none',
  idempotency: 'natural',
  resultLimit: 1000,
  artifact: 'result',
  schema: {
    type: 'object',
    required: ['intent'],
    additionalProperties: false,
    properties: { intent: { type: 'string' } },
  },
  screenSummary: (args) => String(args.intent ?? ''),
  run(args, ctx) {
    const intent = String(args.intent);
    const matches = readLedger(ctx.stage).filter((e) => e.intent === intent);
    const keys = matches.map((e) => e.idempotency_key);
    const artifact = ctx.writeArtifact('stdout.txt', JSON.stringify(matches, null, 2));
    return {
      status: 'ok',
      summary: `intent '${intent}': ${matches.length} ledger entr${
        matches.length === 1 ? 'y' : 'ies'
      }${keys.length ? ` (keys: ${keys.join(', ')})` : ''}`,
      artifact,
    };
  },
};

// The adequacy harness, as a tool. A check that catches the fault is not yet a
// check worth having: it must also leave a correct implementation alone. An
// agent cannot tell those apart by reading its own work, and this is what lets
// it find out — the same script the session ships, run against the agent's own
// check.
const runAdequacy: ToolDef = {
  name: 'run_adequacy',
  description:
    'Test a strengthened check against three states: the current check stays green over ' +
    'the fault, the strengthened check goes red over the fault, and the strengthened ' +
    'check stays green over a known-correct implementation. All three must hold.',
  effect: 'process',
  approval: 'none',
  idempotency: 'natural',
  resultLimit: 2500,
  artifact: 'process_output',
  schema: {
    type: 'object',
    required: ['check_path'],
    additionalProperties: false,
    properties: { check_path: { type: 'string' } },
  },
  screenSummary: (args) => String(args.check_path ?? ''),
  policy: (args, ctx) => guardPath({ path: args.check_path }, ctx, 'read'),
  run(args, ctx) {
    const check = String(args.check_path);
    const script = join(
      ctx.stage,
      'sessions',
      's4-attack-verify',
      'fixtures',
      'check-adequacy.sh',
    );
    if (!existsSync(script))
      return { status: 'failed', summary: 'the adequacy harness is not staged', retryable: false };
    const r = spawnSync('bash', [script, 'working/src/slugify.mjs', check], {
      cwd: ctx.stage,
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, NODE_NO_WARNINGS: '1', NODE_TEST_CONTEXT: undefined, NODE_OPTIONS: undefined },
    });
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    const artifact = ctx.writeArtifact('stdout.txt', out);
    if (r.status === 0)
      return { status: 'ok', summary: bound(out, this.resultLimit, artifact), artifact };
    return {
      status: 'failed',
      summary: bound(out, this.resultLimit, artifact),
      retryable: true,
      artifact,
    };
  },
};

// One declared node of the workflow, run within the shared budget. The nodes
// stay deterministic and harness-owned: a coordinator decides what to run and
// in what order, and never decides what a node reports.
const runWorkflowNode: ToolDef = {
  name: 'run_workflow_node',
  description:
    'Run one node of the declared workflow by id, within the workflow\'s shared attempt ' +
    'budget. A node that already holds a receipt is skipped rather than rerun.',
  effect: 'process',
  approval: 'none',
  idempotency: 'natural',
  resultLimit: 2000,
  artifact: 'process_output',
  schema: {
    type: 'object',
    required: ['workflow_id', 'node'],
    additionalProperties: false,
    properties: { workflow_id: { type: 'string' }, node: { type: 'string' } },
  },
  screenSummary: (args) => String(args.node ?? ''),
  run(args, ctx) {
    if (!existsSync(join(ctx.stage, 'sessions', 's6-compose-defend')))
      return { status: 'failed', summary: 'the workflow runner is not staged', retryable: false };
    // Each node collects its own gate receipt, so the node subprocess needs the
    // gate's key — and the worker must not. It runs in a lent root instead.
    const r = withGateRoot({ repoRoot: ctx.repoRoot, stage: ctx.stage, id: `${ctx.callId}-node` }, (root) =>
      spawnSync(
        process.execPath,
        [
          join(root, 'sessions', 's6-compose-defend', 'fixtures', 'runner.ts'),
          'run',
          '--wf-id',
          String(args.workflow_id),
          '--node',
          String(args.node),
        ],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 180_000,
          env: {
            ...process.env,
            PROVE_IT_ROOT: root,
            NODE_NO_WARNINGS: '1',
            NODE_TEST_CONTEXT: undefined,
            NODE_OPTIONS: undefined,
          },
        },
      ),
    );
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    const artifact = ctx.writeArtifact('stdout.txt', out);
    if (r.status === 0)
      return { status: 'ok', summary: bound(out, this.resultLimit, artifact), artifact };
    return { status: 'failed', summary: bound(out, this.resultLimit, artifact), retryable: true, artifact };
  },
};

// run_eval_case is the one catalog entry still unbuilt. S5 gives its evaluator
// the case results directly, so nothing needs it yet, and a tool nothing uses
// is a tool nothing tests.
export const CATALOG: ToolDef[] = [
  readFile,
  writeFile,
  runCheck,
  requestRelease,
  sendPayment,
  inspectLedger,
  runAdequacy,
  runWorkflowNode,
];

const BY_NAME = new Map(CATALOG.map((def) => [def.name, def]));

export function lookup(name: string): ToolDef | undefined {
  return BY_NAME.get(name);
}

export function toolSpecs(names?: string[]): ToolSpec[] {
  const defs = names ? names.map((n) => BY_NAME.get(n)).filter((d): d is ToolDef => !!d) : CATALOG;
  return defs.map((d) => ({ name: d.name, description: d.description, schema: d.schema }));
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

// Enough JSON Schema to hold a real agent to the contract: required fields,
// declared types, and no extras. A tool that needs more validation than this
// is a tool whose arguments are doing too much work.
function schemaViolations(schema: Record<string, any>, args: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const properties = (schema.properties ?? {}) as Record<string, { type?: string }>;
  for (const key of (schema.required ?? []) as string[])
    if (args[key] === undefined) problems.push(`missing required argument '${key}'`);
  for (const [key, value] of Object.entries(args)) {
    const declared = properties[key];
    if (!declared) {
      if (schema.additionalProperties === false) problems.push(`unknown argument '${key}'`);
      continue;
    }
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (declared.type && declared.type !== actual)
      problems.push(`argument '${key}' must be ${declared.type}, got ${actual}`);
  }
  return problems;
}

// The single decision point before any effect. Everything it returns is a
// refusal the agent reads and can act on.
export function applyPolicy(
  tool: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): LiveToolResult | null {
  const def = BY_NAME.get(tool);
  if (!def)
    return {
      status: 'refused',
      policy: `'${tool}' is not in the harness tool catalog`,
      next: `the available tools are: ${CATALOG.map((d) => d.name).join(', ')}`,
    };
  if (ctx.allowed && !ctx.allowed.includes(tool))
    return {
      status: 'refused',
      policy: `'${tool}' is not available in this lane`,
      next: `this lane may use: ${ctx.allowed.join(', ')}`,
    };
  const problems = schemaViolations(def.schema as Record<string, any>, args);
  if (problems.length)
    return {
      status: 'refused',
      policy: `arguments do not match the ${tool} schema: ${problems.join('; ')}`,
      next: `call ${tool} again with arguments matching its declared schema`,
    };
  return def.policy?.(args, ctx) ?? null;
}

// Execution. Policy has already passed and `tool.dispatched` is already on
// disk, so a crash inside here is exactly the pending state the S3 lesson
// depends on.
export function execute(
  tool: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): LiveToolResult {
  const def = BY_NAME.get(tool);
  if (!def)
    return { status: 'failed', summary: `unknown tool reached execution: ${tool}`, retryable: false };
  try {
    return def.run(args, ctx);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const artifact = ctx.writeArtifact('stderr.txt', detail);
    return { status: 'failed', summary: `${tool} threw: ${detail}`, retryable: false, artifact };
  }
}

// The idempotency key the log records alongside a dispatch, so a pending
// action can be reconciled against the world by key.
export function idempotencyKeyOf(tool: string, args: Record<string, unknown>): string | null {
  const def = BY_NAME.get(tool);
  if (!def || def.idempotency !== 'required_key') return null;
  const key = args.idempotency_key;
  return typeof key === 'string' ? key : null;
}

export function screenSummaryOf(tool: string, args: Record<string, unknown>): string {
  return BY_NAME.get(tool)?.screenSummary(args) ?? JSON.stringify(args);
}

// Present in the stage so a lane always has somewhere durable to record
// external effects, whether or not the scenario uses them.
export function prepareStageState(stage: string): void {
  mkdirSync(join(stage, 'live-state'), { recursive: true });
}

export { readLedger, ledgerPath };
