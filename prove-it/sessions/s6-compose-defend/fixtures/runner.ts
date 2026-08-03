// The supplied M11 workflow runner (S6). Nodes are verified prove-it runs; the
// join consumes receipts, never summaries; promotion happens OUTSIDE this file
// (promote.sh, run by a human). The runner may REQUEST gate runs — it has no
// path to write the gate, gate.key, receipts, or the completion transition,
// and it has no promote command.
//
//   node sessions/s6-compose-defend/fixtures/runner.ts \
//        run  [--wf PATH] [--wf-id ID] [--attack summary|overspend]
//   ...  join --wf-id ID
//   ...  retry-brief <run-id>
//   ...  promote ...            always refused; see promote.sh
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NODE_ARGS, ROOT, requestGate, sha256 } from '../../../src/root.ts';
import { readEvents } from '../../../src/events.ts';
import { loadContract } from '../../../src/contract.ts';

// Code is read from this checkout; state lives under ROOT (honors PROVE_IT_ROOT).
const CODE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WF_DEFAULT = 'sessions/s6-compose-defend/fixtures/workflow.yaml';

interface WfNode { id: string; provider: string; contract: string; depends_on: string[]; write_set: string[] }
interface Wf { name: string; attempts: number; retry_owner: string; nodes: WfNode[]; requires: string[]; terminal: string[] }
interface NodeState { runs: string[]; accepted_run?: string; summary?: string }
interface Ledger { wf_id: string; definition: string; definition_sha: string; nodes: Record<string, NodeState> }

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const die = (msg: string): never => {
  console.error(`runner: ${msg}`);
  process.exit(1);
};

function parseWorkflow(raw: string): Wf {
  const wf: Wf = { name: '', attempts: 0, retry_owner: '', nodes: [], requires: [], terminal: [] };
  let section = '';
  let node: WfNode | null = null;
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = line.match(/^([a-z_]+):\s*(.*)$/);
    if (top) {
      section = top[1];
      if (section === 'workflow') wf.name = top[2].trim();
      if (section === 'retry_owner') wf.retry_owner = top[2].trim();
      continue;
    }
    const id = line.match(/^\s+-\s+id:\s*(.+)$/);
    const kv = line.match(/^\s+([a-z_]+):\s*(.*)$/);
    if (section === 'nodes') {
      if (id) {
        node = { id: id[1].trim(), provider: 'none', contract: '', depends_on: [], write_set: [] };
        wf.nodes.push(node);
      } else if (kv && node) {
        const v = kv[2].trim();
        if (kv[1] === 'provider') node.provider = v;
        if (kv[1] === 'contract') node.contract = v;
        if (kv[1] === 'depends_on') node.depends_on = v ? v.split(/\s+/) : [];
        if (kv[1] === 'write_set') node.write_set = v ? v.split(/\s+/) : [];
      }
    } else if (section === 'budgets' && kv && kv[1] === 'attempts') wf.attempts = Number(kv[2]);
    else if (section === 'join' && kv) {
      if (kv[1] === 'requires') wf.requires = kv[2].trim().split(/\s+/);
      if (kv[1] === 'terminal') wf.terminal = kv[2].trim().split(/\s+/);
    }
  }
  return wf;
}

const ledgerPath = (wfId: string) => join(ROOT, 'runs', wfId, 'workflow.json');
const saveLedger = (l: Ledger) => writeFileSync(ledgerPath(l.wf_id), JSON.stringify(l, null, 2) + '\n');
function loadLedger(wfId: string): Ledger {
  if (!existsSync(ledgerPath(wfId))) die(`no workflow ledger at runs/${wfId}/workflow.json — run first`);
  return JSON.parse(readFileSync(ledgerPath(wfId), 'utf8'));
}

// The loop is spawned, not imported: the runner drives the same CLI a human does.
function loop(args: string[], quiet = false): number {
  const r = spawnSync(process.execPath, [...NODE_ARGS, join(CODE, 'src', 'loop.ts'), ...args], {
    cwd: ROOT,
    stdio: quiet ? 'pipe' : 'inherit',
    env: { ...process.env, PROVE_IT_ROOT: ROOT, PROVE_IT_WORKFLOW: '1', NODE_NO_WARNINGS: '1' },
  });
  return r.status ?? 1;
}

// One attempt = one run opened. The join recomputes this from the event logs,
// so a layer that lies to the ledger is caught at fan-in.
const attemptsIn = (runId: string) =>
  readEvents(join(ROOT, 'runs', runId, 'events.jsonl')).filter((e) => e.type === 'run.requested').length;
function spentAttempts(led: Ledger): { total: number; detail: string[] } {
  let total = 0;
  const detail: string[] = [];
  for (const [id, st] of Object.entries(led.nodes)) {
    let n = 0;
    for (const r of st.runs) n += attemptsIn(r);
    total += n;
    detail.push(`${id}:${n}`);
  }
  return { total, detail };
}

function writeRetryBrief(runId: string, remaining: number): object {
  const runDir = join(ROOT, 'runs', runId);
  const manifest = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8'));
  const { data } = loadContract(join(ROOT, manifest.contract_path));
  const artifact = join(runDir, 'check-output.txt');
  // The retry sees these four fields and nothing else. Whatever the check
  // printed — including hostile text — stays quarantined in the artifact.
  const brief = {
    class: 'check_failed',
    check: data.checks[0]?.command ?? '(no check parsed)',
    artifact: existsSync(artifact) ? `runs/${runId}/check-output.txt` : null,
    attemptRemaining: remaining,
  };
  writeFileSync(join(runDir, 'retry-brief.json'), JSON.stringify(brief, null, 2) + '\n');
  const quarantined = existsSync(artifact) ? statSync(artifact).size : 0;
  console.log(`  retry brief (bounded, structured — the ONLY thing a retry sees):`);
  console.log('  ' + JSON.stringify(brief));
  console.log(`  ${quarantined} bytes of worker-controlled check output quarantined in the artifact; 0 forwarded.`);
  return brief;
}

function runNode(led: Ledger, wf: Wf, node: WfNode, attack: string): void {
  const st = (led.nodes[node.id] ??= { runs: [] });
  if (st.accepted_run) {
    console.log(`── node ${node.id}: already accepted (${st.accepted_run}) — skipped, receipts are durable`);
    return;
  }
  if (st.runs.length > 0) {
    // Crash recovery is operator work, not runner magic: reconcile and resume
    // the run yourself, request the gate, and the runner adopts the receipt.
    const last = st.runs[st.runs.length - 1];
    const rp = join(ROOT, 'control', 'receipts', `${last}.json`);
    if (existsSync(rp) && JSON.parse(readFileSync(rp, 'utf8')).run_id === last) {
      st.accepted_run = last;
      saveLedger(led);
      console.log(`── node ${node.id}: adopting operator-recovered run ${last} (gate receipt found)`);
      return;
    }
    die(
      `node ${node.id} has runs without an accepted receipt (${st.runs.join(', ')}).\n` +
        `Inspect with 'loop view', reconcile/resume or cancel, request 'dr-gate check';\n` +
        `then rerun the workflow — the runner adopts the receipt, it does not silently rerun.`,
    );
  }
  for (const dep of node.depends_on)
    if (!led.nodes[dep]?.accepted_run) die(`node ${node.id} depends on ${dep}, which has no accepted receipt`);

  let attempt = 0;
  while (true) {
    attempt += 1;
    const { total } = spentAttempts(led);
    if (total >= wf.attempts)
      die(
        `shared budget exhausted (${total}/${wf.attempts} attempts spent) before node ${node.id}.\n` +
          `Escalate to the operator; do not grant fresh budget from inside the workflow.`,
      );
    const runId = attempt === 1 ? `${led.wf_id}-${node.id}` : `${led.wf_id}-${node.id}-r${attempt}`;
    console.log(`── node ${node.id}: run ${runId} (attempt ${attempt}, shared budget ${total}/${wf.attempts} spent)`);
    const args =
      node.provider === 'none'
        ? ['open', '--run-id', runId, '--contract', node.contract]
        : ['run', '--provider', node.provider, '--run-id', runId, '--contract', node.contract];
    // Ledger records the run BEFORE it executes: a crash mid-run must leave a
    // trace, or the rerun would silently repeat work the world may have seen.
    st.runs.push(runId);
    saveLedger(led);
    if (loop(args) !== 0)
      die(`loop failed for ${runId} — inspect with 'loop view ${runId}', recover, then rerun the workflow`);

    if (attack === 'summary' && node.id === 'review') {
      // Attack fixture: the review node reports prose instead of requesting the
      // gate. The runner records it honestly; the JOIN must refuse it.
      const s = join(ROOT, 'runs', runId, 'summary.md');
      writeFileSync(s, '# Review summary\n\nReviewed everything. All checks green. LGTM — ship it.\n');
      st.summary = `runs/${runId}/summary.md`;
      saveLedger(led);
      console.log(`  review returned a SUMMARY instead of requesting the gate (attack fixture) — join must catch this`);
      return;
    }

    const gate = requestGate('check', runId);
    console.log('  ' + gate.out.split('\n').join('\n  '));
    if (gate.ok) {
      st.accepted_run = runId;
      saveLedger(led);
      if (node.provider !== 'none') loop(['complete', runId]); // full gate path where a run reached needs_evidence
      return;
    }
    const remaining = wf.attempts - spentAttempts(led).total;
    writeRetryBrief(runId, remaining);
    if (wf.retry_owner !== 'runner')
      die(`retry owner is '${wf.retry_owner}', not the runner — escalating instead of retrying`);
    if (remaining <= 0)
      die(`node ${node.id} failed and the shared budget is spent (${wf.attempts}/${wf.attempts}). Escalate to the operator.`);
    console.log(`  retry owner 'runner' schedules attempt ${attempt + 1} from the retry brief (${remaining} attempts remain)`);
  }
}

function cmdRun(): void {
  const wfPath = opt('--wf') ?? WF_DEFAULT;
  const wfId = opt('--wf-id') ?? `wf-${Date.now().toString(36)}`;
  const attack = opt('--attack') ?? 'none';
  const raw = readFileSync(join(ROOT, wfPath), 'utf8');
  const wf = parseWorkflow(raw);
  let led: Ledger;
  if (existsSync(ledgerPath(wfId))) {
    led = loadLedger(wfId);
    if (led.definition_sha !== sha256(raw)) die('workflow definition changed after the workflow started');
    console.log(`resuming workflow ${wfId} — nodes with receipts are skipped, not rerun`);
  } else {
    mkdirSync(join(ROOT, 'runs', wfId), { recursive: true });
    led = { wf_id: wfId, definition: wfPath, definition_sha: sha256(raw), nodes: {} };
    saveLedger(led);
    console.log(`workflow ${wfId} (${wf.name}): shared budget ${wf.attempts} attempts, retry owner '${wf.retry_owner}'`);
  }
  // --node runs one declared node instead of the whole route. The workflow was
  // already resumable — a node with a receipt is skipped, not rerun — so this
  // only narrows what a single call attempts. Without it the behaviour is
  // exactly what it was: every node, in route order.
  const only = opt('--node');
  if (only && !wf.nodes.some((n) => n.id === only))
    die(`no node '${only}' in ${wfPath} (have: ${wf.nodes.map((n) => n.id).join(', ')})`);
  for (const node of wf.nodes) {
    if (only && node.id !== only) continue;
    runNode(led, wf, node, attack);
  }
  if (attack === 'overspend') {
    // Attack fixture: the DeadReckon nested-retry bug. A child retry layer
    // grants itself a fresh local budget and re-runs implement, ignoring the
    // shared remaining budget. The spending is real; the JOIN must catch it.
    const node = wf.nodes.find((n) => n.id === 'implement')!;
    console.log(`── ATTACK overspend: a child retry layer grants itself a fresh local budget of 3`);
    console.log(`   and re-runs implement, ignoring the shared remaining budget`);
    for (let r = 2; r <= 4; r++) {
      const rid = `${led.wf_id}-implement-r${r}`;
      loop(['run', '--provider', node.provider, '--run-id', rid, '--contract', node.contract], true);
      requestGate('check', rid); // the child even collects receipts — spending is real
      led.nodes.implement.runs.push(rid);
      saveLedger(led);
      console.log(`   re-ran ${rid}: 1 more shared attempt spent (${spentAttempts(led).total}/${wf.attempts})`);
    }
  }
  const { total } = spentAttempts(led);
  console.log(`\nworkflow ${wfId}: node phase finished (${total}/${wf.attempts} attempts spent). Fan-in is a separate, deterministic step:`);
  console.log(`  node sessions/s6-compose-defend/fixtures/runner.ts join --wf-id ${wfId}`);
}

function cmdJoin(): void {
  const wfId = opt('--wf-id') ?? die('join requires --wf-id');
  const led = loadLedger(wfId);
  const resultPath = join(ROOT, 'runs', wfId, 'join-result.json');
  const refuse = (msg: string): never => {
    writeFileSync(resultPath, JSON.stringify({ passed: false, reason: msg }, null, 2) + '\n');
    console.error(`join: REFUSED — ${msg}`);
    process.exit(1);
  };
  const raw = readFileSync(join(ROOT, led.definition), 'utf8');
  if (sha256(raw) !== led.definition_sha) refuse('workflow definition changed after the workflow started');
  const wf = parseWorkflow(raw);
  const receiptOf = (nodeId: string): any => {
    const st = led.nodes[nodeId];
    return JSON.parse(readFileSync(join(ROOT, 'control', 'receipts', `${st.accepted_run}.json`), 'utf8'));
  };

  // 1. Complete fan-in: every required node has a receipt — a summary is named and refused.
  for (const id of wf.requires) {
    const node = wf.nodes.find((n) => n.id === id) ?? refuse(`join requires unknown node '${id}'`);
    const st = led.nodes[id];
    if (!st || st.runs.length === 0) refuse(`node ${id}: never ran — fan-in is incomplete`);
    if (!st.accepted_run) {
      if (st.summary) refuse(`node ${id}: returned a summary (${st.summary}), not a receipt — a summary is not evidence`);
      refuse(`node ${id}: no accepted gate receipt — fan-in is incomplete`);
    }
    const rp = join(ROOT, 'control', 'receipts', `${st.accepted_run}.json`);
    if (!existsSync(rp)) refuse(`node ${id}: receipt missing at control/receipts/${st.accepted_run}.json`);
    const receipt = receiptOf(id);
    if (receipt.run_id !== st.accepted_run)
      refuse(`node ${id}: old receipt refused — receipt names run '${receipt.run_id}', expected '${st.accepted_run}'`);
    if (receipt.contract_sha256 !== sha256(readFileSync(join(ROOT, node.contract))))
      refuse(`node ${id}: contract mismatch — receipt was issued under a different Done Contract than ${node.contract}`);
    console.log(`join: node ${id.padEnd(9)} receipt ${st.accepted_run} — identity ok`);
  }

  // 2. Terminal receipts must verify against the CURRENT tree — the gate decides.
  for (const id of wf.terminal) {
    const g = requestGate('verify', led.nodes[id].accepted_run!);
    if (!g.ok) refuse(`node ${id}: ${g.out.split('\n')[0].replace('dr-gate: REFUSED — ', '')}`);
    console.log(`join: terminal ${id} — ${g.out.split('\n')[0]}`);
  }

  // 3. Chain: each node started from the exact tree its dependency certified.
  for (const node of wf.nodes)
    for (const dep of node.depends_on) {
      const start = JSON.parse(
        readFileSync(join(ROOT, 'runs', led.nodes[node.id].accepted_run!, 'run.json'), 'utf8'),
      ).candidate_tree_start;
      const certified = receiptOf(dep).candidate_tree;
      if (start !== certified)
        refuse(`baseline mismatch: node ${node.id} started from ${start.slice(0, 17)}… but its dependency ${dep} certified ${certified.slice(0, 17)}…`);
      console.log(`join: chain ${dep} → ${node.id} — baseline matches the certified candidate`);
    }

  // 4. Write sets: recorded writes stay inside each node's declared set; no two nodes collide.
  const wrote: Record<string, string[]> = {};
  for (const node of wf.nodes) {
    const paths: string[] = [];
    for (const r of led.nodes[node.id]?.runs ?? [])
      for (const e of readEvents(join(ROOT, 'runs', r, 'events.jsonl')))
        if (e.type === 'tool.result') for (const p of ((e.data as any).changed ?? []) as string[]) paths.push(p);
    for (const p of paths)
      if (!node.write_set.some((w) => p.startsWith(w)))
        refuse(`node ${node.id} wrote ${p}, outside its declared write set [${node.write_set.join(' ') || 'none'}]`);
    wrote[node.id] = paths;
  }
  for (const [a, ap] of Object.entries(wrote))
    for (const [b, bp] of Object.entries(wrote))
      if (a < b && ap.some((p) => bp.includes(p)))
        refuse(`write collision: nodes ${a} and ${b} both changed ${ap.find((p) => bp.includes(p))}`);
  console.log(`join: write sets — ${Object.entries(wrote).filter(([, p]) => p.length).map(([n, p]) => `${n} wrote ${p.length} path(s) in-bounds`).join('; ') || 'no writes'}; no collisions`);

  // 5. The shared-budget invariant, recomputed from event logs, never from a counter.
  const { total, detail } = spentAttempts(led);
  if (total > wf.attempts)
    refuse(`budget invariant violated: runner 0 + children ${total} (${detail.join(' ')}) > shared budget ${wf.attempts}`);
  console.log(`join: invariant — attempts spent ${total} (runner 0 + ${detail.join(' ')}) <= budget ${wf.attempts} — PASS`);

  writeFileSync(
    resultPath,
    JSON.stringify({ passed: true, wf_id: wfId, spent: total, budget: wf.attempts, joined_at: new Date().toISOString() }, null, 2) + '\n',
  );
  console.log(`join: PASSED — all required receipts verified (runs/${wfId}/join-result.json).`);
  console.log(`Promotion is a human decision, outside this workflow:`);
  console.log(`  bash sessions/s6-compose-defend/fixtures/promote.sh ${wfId} --owner "<name>" --rollback "<path>"`);
}

if (cmd === 'run') cmdRun();
else if (cmd === 'join') cmdJoin();
else if (cmd === 'retry-brief') {
  const runId = argv[1] ?? die('retry-brief <run-id>');
  if (!existsSync(join(ROOT, 'runs', runId, 'run.json'))) die(`no run '${runId}'`);
  const manifest = JSON.parse(readFileSync(join(ROOT, 'runs', runId, 'run.json'), 'utf8'));
  writeRetryBrief(runId, Math.max(0, (manifest.budgets?.attempts ?? 1) - 1));
} else if (cmd === 'promote') {
  console.error(`runner: REFUSED — promotion is not a runner command. A workflow may not promote`);
  console.error(`its own output. A human runs sessions/s6-compose-defend/fixtures/promote.sh.`);
  process.exit(1);
} else die('usage: runner <run|join|retry-brief|promote> …  (see file header)');
