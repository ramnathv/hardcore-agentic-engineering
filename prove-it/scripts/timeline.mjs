#!/usr/bin/env node
// Render an events.jsonl as a readable timeline, one line per event.
//
//   node scripts/timeline.mjs runs/<run-id>/events.jsonl
//   node scripts/timeline.mjs live/artifacts/<dir>/right/shared/events.jsonl
//
// Works on both logs the course produces: the student loop (src/loop.ts) and
// the live runtime (live/runtime/). It renders what the record holds and
// invents nothing: an unknown event type prints as itself, and a torn final
// record — a crash mid-write — is shown as exactly that, the same way the
// readers in src/events.ts and live/runtime/event-log.ts treat it.
import { existsSync, readFileSync } from 'node:fs';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  orange: '\x1b[38;5;208m',
};

// One color per meaning, not per type: openings are cyan, operator control is
// orange, claims are yellow, judgments are green, failures are red.
const COLOR = {
  'run.requested': C.cyan,
  'provider.session.started': C.cyan,
  'run.interrupted': C.orange,
  'run.resumed': C.orange,
  'run.rebriefed': C.orange,
  'plan.rejected': C.orange,
  'tool.reconciled': C.orange,
  'worker.claimed_done': C.yellow,
  'plan.proposed': C.yellow,
  'gate.result': C.green,
  'run.completed': C.green,
  'plan.approved': C.green,
  'run.failed': C.red,
  'tool.refused': C.red,
};

// The actor column carries the lesson: ★ marks the operator — a person writing
// into the record — and ▓ marks the gate. Workers only ever get a dot.
const MARK = { operator: '★', gate: '▓', worker: '·', harness: ' ', tool: ' ' };

const clip = (value, n = 64) => {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
};

function describe(e) {
  const d = e.data ?? {};
  switch (e.type) {
    case 'run.requested':
      return `run opens · ${d.brief ? `brief: "${clip(d.brief, 54)}"` : `contract ${clip(d.contract_sha256, 12)}`}`;
    case 'provider.session.started':
      return `NEW PROCESS ${String(d.session_id ?? '').slice(0, 8)} · ${d.model ?? ''}`;
    case 'turn.started':
      return `turn ${d.turn ?? '?'} begins`;
    case 'message.delta':
      return `worker says: "${clip(d.text, 56)}"`;
    case 'message.completed': {
      if (d.text) return `worker says: "${clip(d.text, 56)}"`;
      const calls = (d.calls ?? []).map((c) => c.tool).join(', ');
      return `worker wants: ${calls || '(nothing)'}`;
    }
    case 'plan.proposed':
      return `plan proposed: "${clip(d.plan, 54)}"`;
    case 'plan.rejected':
      return `PLAN REJECTED · fact: "${clip(d.fact, 48)}"`;
    case 'plan.approved':
      return 'plan approved';
    case 'run.rebriefed':
      return `REBRIEFED · rider: "${clip(d.rider, 50)}"`;
    case 'tool.requested':
      return `asks  ${d.tool} ${clip(JSON.stringify(d.args ?? {}), 42)}`;
    case 'tool.dispatched':
      return `→ COMMITTED to disk, effect about to run (${d.tool})`;
    case 'tool.result': {
      // The live runtime nests {result: {status, summary}}; the student loop
      // keeps status and summary at the top. Same fact, two shapes.
      const r = d.result ?? d;
      return `← ${d.tool} ${r.status ?? '?'}: ${clip(r.summary, 44)}`;
    }
    case 'tool.refused':
      return `REFUSED ${d.tool}: ${clip(d.policy, 46)}`;
    case 'tool.reconciled':
      return `RECONCILED ${d.tool} as ${d.decision}${d.note ? ` · "${clip(d.note, 34)}"` : ''}`;
    case 'run.interrupted': {
      const where =
        d.after_tool ?? d.after ?? (d.after_turn !== undefined ? `turn ${d.after_turn}` : null);
      const why = d.reason ? ` · "${clip(d.reason, 40)}"` : '';
      return `STOPPED${where ? ` after ${where}` : ''}${why} — everything above is durable`;
    }
    case 'run.resumed': {
      const said = d.instruction ?? d.decision;
      return said ? `RESUMED · operator wrote: "${clip(said, 48)}"` : 'RESUMED (marker)';
    }
    case 'worker.claimed_done':
      return `claims DONE: "${clip(d.text, 48)}"`;
    case 'gate.result':
      return `GATE ${d.accepted ? 'ACCEPTED ✓' : 'REFUSED ✗'} — ${clip(d.detail, 46)}`;
    case 'run.completed':
      return 'RUN COMPLETE — receipt verified';
    case 'run.failed':
      return `FAILED ${d.code ?? ''}: ${clip(d.detail, 46)}`;
    default:
      return `${e.type} ${clip(JSON.stringify(d), 44)}`;
  }
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/timeline.mjs <events.jsonl> [more.jsonl ...]');
  process.exit(1);
}

for (const path of files) {
  if (!existsSync(path)) {
    console.error(`timeline: no such file: ${path}`);
    console.error('  student runs live at runs/<run-id>/events.jsonl (run one first);');
    console.error('  live compare lanes at live/artifacts/<dir>/{left,right}/shared/events.jsonl');
    process.exitCode = 1;
    continue;
  }
  console.log(`\n${C.bold}${path}${C.reset}`);
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      console.log(`      ${C.red}⚡ torn final record (crash mid-write) — dropped, exactly as the loop drops it${C.reset}`);
      continue;
    }
    // A refused gate is a red fact, whatever color the type would get.
    const color =
      e.type === 'gate.result' && !e.data?.accepted ? C.red : (COLOR[e.type] ?? '');
    const mark = MARK[e.actor] ?? ' ';
    const ts = String(e.ts ?? '').slice(11, 19);
    console.log(
      `${C.dim}${String(e.id).padStart(4)}  ${ts}${C.reset} ${mark} ${C.dim}${String(e.actor ?? '').padEnd(8)}${C.reset} ${color}${describe(e)}${C.reset}`,
    );
  }
}
