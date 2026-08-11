// The smallest model-and-tool loop with durable events and a gate-shaped exit.
// The worker may claim "done"; only a verified dr-gate receipt can complete a run.
//
//   node src/loop.ts run [--provider smoke] [--run-id X]
//                                     [--contract done/contract.yaml] [--interrupt-after N]
//   node ... src/loop.ts open --run-id X [--contract PATH]   fix identities, no turns
//   node ... src/loop.ts resume <run-id> [--reconcile ok|failed|in_doubt]
//   node ... src/loop.ts cancel <run-id> --reason "..."
//   node ... src/loop.ts view <run-id>                        RunView from events.jsonl
//   node ... src/loop.ts complete <run-id>                    verify receipt, then Completed
// Ported contracts (candidate_dir/protect, see PORT.md) gate YOUR repo: the
// lifecycle is open → your own agent works in your repo → dr-gate check → complete.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ROOT, requestGate, sha256, treeHash } from './root.ts';
import { loadContract } from './contract.ts';
import { EventLog, readEvents } from './events.ts';
import { reduce } from './runview.ts';
import { getProvider, type Provider } from './provider.ts';
import { dispatch, summarize, type ToolContext } from './tools.ts';

const MAX_TURNS = 8;
const argv = process.argv.slice(2);
const cmd = argv[0];

const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const die = (msg: string): never => {
  console.error(`loop: ${msg}`);
  process.exit(1);
};

function runDirOf(runId: string) {
  return join(ROOT, 'runs', runId);
}

function openRun(runId: string, contractPath: string, provider: string) {
  const dir = runDirOf(runId);
  if (existsSync(join(dir, 'run.json'))) die(`run '${runId}' already exists`);
  mkdirSync(dir, { recursive: true });
  // --contract may be absolute (a ported contract in the student's own tree) or
  // relative to the prove-it root (today's contracts) — resolve handles both.
  const contractAbs = resolve(ROOT, contractPath);
  const { sha, data } = loadContract(contractAbs);
  // Ported runs (PORT.md): candidate_dir/protect resolve relative to the
  // contract file's directory. The run and its receipt stay HERE, in the
  // prove-it clone — the student's repo is judged, never written to.
  const contractDir = dirname(contractAbs);
  const candidateDir = data.candidate_dir
    ? resolve(contractDir, data.candidate_dir)
    : join(ROOT, 'working');
  if (!existsSync(candidateDir)) die(`candidate_dir not found: ${candidateDir}`);
  let pins: Record<string, string> | undefined;
  if (data.protect.length > 0) {
    pins = {}; // protect hashes pinned NOW, before any worker turn; dr-gate verifies them
    for (const f of data.protect) {
      const abs = resolve(contractDir, f);
      if (!existsSync(abs)) die(`protect target not found: ${abs}`);
      pins[f] = sha256(readFileSync(abs));
    }
  }
  const manifest = {
    run_id: runId,
    contract_path: contractPath,
    contract_sha256: sha, // fixed before the worker starts; dr-gate rebinds to this
    candidate_tree_start: treeHash(candidateDir),
    ...(pins ? { protected: pins } : {}),
    provider,
    budgets: data.budgets,
    created_at: new Date().toISOString(),
  };
  writeFileSync(join(dir, 'run.json'), JSON.stringify(manifest, null, 2) + '\n');
  const log = new EventLog(join(dir, 'events.jsonl'), runId);
  log.append('run.requested', 'operator', {
    contract_path: contractPath,
    contract_sha256: sha,
    candidate_tree: manifest.candidate_tree_start,
    attempts: data.budgets.attempts,
  });
  console.log(`run=${runId} contract=sha256:${sha.slice(0, 12)}… (fixed before run)`);
  return { dir, log, manifest };
}

function loadRun(runId: string) {
  const dir = runDirOf(runId);
  if (!existsSync(join(dir, 'run.json'))) die(`no run '${runId}' under runs/`);
  const manifest = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
  const events = readEvents(join(dir, 'events.jsonl'));
  const log = new EventLog(join(dir, 'events.jsonl'), runId);
  return { dir, manifest, events, log, view: reduce(events) };
}

function toolContext(runId: string, manifest: any): ToolContext {
  const { data } = loadContract(resolve(ROOT, manifest.contract_path));
  const check = data.checks[0];
  return {
    runDir: runDirOf(runId),
    checkCommand: check?.command ?? 'false',
    checkExpectedExit: check?.expect_exit ?? 0,
  };
}

let dispatchCount = 0;

function runTurns(
  runId: string,
  log: EventLog,
  manifest: any,
  provider: Provider,
  startTurn: number,
  interruptAfter: number,
) {
  const ctx = toolContext(runId, manifest);
  let observation: string | null = null;
  for (let turn = startTurn; turn <= MAX_TURNS; turn++) {
    const t = provider.nextTurn(turn, observation);
    if (!t) break;
    log.append('turn.started', 'harness', { turn });
    if (t.text) {
      log.append('message.delta', 'worker', { text: t.text });
      console.log(`  ● ${t.text}`);
    }
    for (const call of t.tools ?? []) {
      log.append('tool.requested', 'worker', { tool: call.tool, args: call.args });
      dispatchCount += 1;
      // Crash fixture: die between dispatch (recorded) and execution (not yet).
      // The world may or may not have changed; resume must force a decision.
      if (Number(process.env.PROVE_IT_CRASH_AT_TOOL) === dispatchCount) {
        console.error(`  ✖ simulated crash after dispatching '${call.tool}' (fixture)`);
        process.exit(9);
      }
      const res = dispatch(call.tool, call.args, ctx);
      log.append('tool.result', 'harness', { tool: call.tool, ...res });
      observation = summarize(res);
      console.log(`  ⏺ ${call.tool} → ${observation.split('\n')[0]}`);
    }
    if (turn === interruptAfter) {
      log.append('run.interrupted', 'operator', { after_turn: turn });
      console.log(`run=${runId} interrupted after turn ${turn}. Resume with:`);
      console.log(`  node src/loop.ts resume ${runId}`);
      return;
    }
  }
  log.append('run.stopped', 'worker', { reason: 'model_claimed_done' });
  console.log(`run=${runId} status=needs_evidence — the worker's "done" is an opinion.`);
  console.log(`Only the gate records completion:`);
  console.log(`  node control/dr-gate.ts check ${runId}`);
  console.log(`  node src/loop.ts complete ${runId}`);
}

if (cmd === 'open') {
  const runId = opt('--run-id') ?? die('open requires --run-id');
  openRun(runId, opt('--contract') ?? 'done/contract.yaml', 'none');
} else if (cmd === 'run') {
  const runId = opt('--run-id') ?? `r-${Date.now().toString(36)}`;
  const providerName = opt('--provider') ?? 'smoke';
  const provider = getProvider(providerName);
  const contractPath = opt('--contract') ?? 'done/contract.yaml';
  const { data } = loadContract(resolve(ROOT, contractPath));
  if (data.candidate_dir || data.protect.length > 0)
    die(`ported contract: the worker is yours, in your repo — the harness lifecycle is open → dr-gate check → complete (see PORT.md)`);
  const { log, manifest } = openRun(runId, contractPath, providerName);
  log.append('plan.proposed', 'worker', { plan: `scripted plan from provider '${providerName}'` });
  log.append('plan.approved', 'operator', {
    mode: 'auto-approved in the starter; M4 makes this a real decision',
  });
  runTurns(runId, log, manifest, provider, 1, Number(opt('--interrupt-after') ?? 0));
} else if (cmd === 'resume') {
  const runId = argv[1] ?? die('resume <run-id>');
  const { manifest, log, view } = loadRun(runId);
  if (view.status === 'completed' || view.status === 'cancelled')
    die(`run is ${view.status}; nothing to resume`);
  if (view.status === 'needs_reconcile') {
    const rec = opt('--reconcile');
    if (rec !== 'ok' && rec !== 'failed' && rec !== 'in_doubt') {
      console.error(`run=${runId} has a PENDING action dispatched but never recorded:`);
      console.error(`  tool=${view.pending!.tool} args=${JSON.stringify(view.pending!.args)}`);
      console.error(
        `The side effect may or may not have happened. Decide, then resume:\n` +
          `  loop resume ${runId} --reconcile ok|failed|in_doubt\n` +
          `  loop cancel ${runId} --reason "..."`,
      );
      process.exit(1);
    }
    log.append('tool.result', 'operator', {
      tool: view.pending!.tool,
      status: rec,
      summary: `operator reconciliation: marked ${rec} after crash between dispatch and record`,
      ...(rec === 'in_doubt' ? { reconcile: 'operator inspected the world by hand' } : {}),
      ...(rec === 'failed' ? { retryable: true } : {}),
    });
  }
  log.append('run.resumed', 'operator', { from_turn: view.turns });
  runTurns(runId, log, manifest, getProvider(manifest.provider), view.turns + 1, 0);
} else if (cmd === 'cancel') {
  const runId = argv[1] ?? die('cancel <run-id> --reason "..."');
  const reason = opt('--reason') ?? die('every cancellation needs a --reason');
  const { log } = loadRun(runId);
  log.append('run.cancelled', 'operator', { reason });
  console.log(`run=${runId} cancelled: ${reason}`);
} else if (cmd === 'view') {
  const runId = argv[1] ?? die('view <run-id>');
  const v = loadRun(runId).view;
  // Default: only the fields that decide anything. --full prints the whole projection.
  const shown = argv.includes('--full')
    ? v
    : {
        run: v.run,
        status: v.status,
        contract: v.contract,
        candidate_at_request: v.candidate_at_request,
        receiptVerified: v.receiptVerified,
      };
  console.log(JSON.stringify(shown, null, 2));
} else if (cmd === 'complete') {
  const runId = argv[1] ?? die('complete <run-id>');
  const { manifest, log, view } = loadRun(runId);
  // Ported runs (PORT.md) have no done-claim event: the worker is the student's
  // own agent, outside the harness, so an opened run goes straight from
  // 'running' to the gate. The receipt is still the only evidence that counts.
  let completable = view.status === 'needs_evidence';
  if (!completable && view.status === 'running' && existsSync(resolve(ROOT, manifest.contract_path))) {
    const { data } = loadContract(resolve(ROOT, manifest.contract_path));
    completable = !!data.candidate_dir || data.protect.length > 0;
  }
  if (!completable)
    die(`run is '${view.status}', not needs_evidence — nothing to complete`);
  const gate = requestGate('verify', runId); // worker may REQUEST; the gate decides
  console.log(gate.out);
  if (!gate.ok) {
    log.append('gate.result', 'gate', { verified: false, detail: gate.out });
    die('gate refused the evidence; run stays needs_evidence');
  }
  log.append('gate.result', 'gate', { verified: true, detail: gate.out });
  log.append('run.completed', 'harness', { via: 'dr-gate verify' });
  console.log(`run=${runId} status=completed (receipt verified by dr-gate)`);
} else {
  die(`usage: loop <open|run|resume|cancel|view|complete> …  (see file header)`);
}
