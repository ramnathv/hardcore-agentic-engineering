#!/usr/bin/env node
// One simulated external-effect boundary for the S3 compare.
// `stage` records a send_payment request, writes the payment to the ledger,
// and stops before it records a result. `reconcile` records what the operator
// found in that same ledger. The network is simulated. The event boundary is
// real and durable.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventLog } from '../../../src/events.ts';
import { ROOT } from '../../../src/root.ts';

const argv = process.argv.slice(2);
const command = argv[0];
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const runId = opt('--run-id');
const die = (message) => {
  console.error(`effect-boundary: ${message}`);
  process.exit(1);
};
if (!runId) die('use --run-id <id>');

const runDir = join(ROOT, 'runs', runId);
const eventFile = join(runDir, 'events.jsonl');
const ledgerFile = join(ROOT, 'runs', `${runId}-ledger.jsonl`);
const ledgerArgs = [
  'sessions/s3-control-plane/fixtures/ledger.mjs',
  'send',
  '--to',
  'ops',
  '--amount',
  '5',
  '--ledger',
  ledgerFile,
];

if (command === 'stage') {
  const opened = spawnSync(
    process.execPath,
    ['src/loop.ts', 'open', '--run-id', runId],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
  );
  process.stdout.write(opened.stdout || '');
  process.stderr.write(opened.stderr || '');
  if (opened.status !== 0) process.exit(opened.status ?? 1);

  const log = new EventLog(eventFile, runId);
  log.append('turn.started', 'harness', { turn: 1 });
  log.append('tool.requested', 'worker', {
    tool: 'send_payment',
    args: { intent: 'ops-5', to: 'ops', amount: 5 },
  });
  const sent = spawnSync(process.execPath, [...ledgerArgs, '--crash-before-record'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  process.stdout.write(sent.stdout || '');
  process.stderr.write(sent.stderr || '');
  if (sent.status !== 9) die(`the staged effect must stop at the boundary with exit 9`);
  console.log('effect-boundary: process stopped before tool.result; the run now needs reconciliation');
} else if (command === 'reconcile') {
  const status = opt('--status');
  if (status !== 'ok' && status !== 'failed' && status !== 'in_doubt')
    die('use --status ok|failed|in_doubt');
  if (!existsSync(eventFile)) die(`no staged run '${runId}'`);
  const entries = existsSync(ledgerFile)
    ? readFileSync(ledgerFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : [];
  if (status === 'ok' && entries.length !== 1)
    die(`cannot record ok: expected one observed payment, found ${entries.length}`);
  const log = new EventLog(eventFile, runId);
  log.append('tool.result', 'operator', {
    tool: 'send_payment',
    status,
    summary: `operator reconciliation: marked ${status} after inspecting ${entries.length} ledger entry`,
    ...(status === 'in_doubt' ? { reconcile: 'operator could not determine whether the payment landed' } : {}),
    ...(status === 'failed' ? { retryable: true } : {}),
  });
  log.append('run.resumed', 'operator', { from_turn: 1 });
  const artifact = opt('--artifact');
  if (artifact) {
    const operatorDir = join(artifact, 'operator');
    mkdirSync(operatorDir, { recursive: true });
    writeFileSync(
      join(operatorDir, 'reconciliation-events.jsonl'),
      readFileSync(eventFile, 'utf8'),
    );
  }
  console.log(`operator reconciliation: marked ${status}; observed ledger entries=${entries.length}`);
} else if (command === 'observe') {
  if (!existsSync(eventFile)) die(`no staged run '${runId}'`);
  const entries = existsSync(ledgerFile)
    ? readFileSync(ledgerFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const matches = entries.filter((entry) => entry.to === 'ops');
  const artifact = opt('--artifact');
  if (artifact) {
    const operatorDir = join(artifact, 'operator');
    mkdirSync(operatorDir, { recursive: true });
    writeFileSync(
      join(operatorDir, 'world-observation.json'),
      JSON.stringify(
        {
          source: 'simulated external payment ledger',
          pending: { tool: 'send_payment', intent: 'ops-5' },
          matching_entries: matches,
        },
        null,
        2,
      ) + '\n',
    );
  }
  console.log(
    `world evidence: send_payment intent 'ops-5': ${matches.length} matching ledger entr${
      matches.length === 1 ? 'y' : 'ies'
    }`,
  );
  if (artifact) console.log('retained: operator/world-observation.json');
} else {
  die('usage: effect-boundary.mjs <stage|observe|reconcile> --run-id <id> [--status <status>] [--artifact <dir>]');
}
