#!/usr/bin/env node
// SIMULATED external service for S3 (M5): a file stands in for the network.
// The at-least-once boundary is real; the network is not — and this script
// says so rather than pretending. Zero dependencies; plain node.
//
//   node ledger.mjs send  --to X --amount N [--key K] [--crash-before-record]
//   node ledger.mjs query --key K            # the reconciliation read
//   node ledger.mjs count --to X
//   node ledger.mjs assert-count --to X --n N
//   node ledger.mjs reset
//
// `send` APPENDS TO THE LEDGER FIRST (the external effect), then prints the
// confirmation (what a client would record). --crash-before-record exits 9
// between the two: the effect happened, the caller never learned. That is the
// exact boundary idempotency keys exist for.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (name) => argv.includes(name);
const LEDGER = resolve(opt('--ledger') ?? 'runs/s3-ledger.jsonl');

const read = () =>
  existsSync(LEDGER)
    ? readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];

const die = (msg, code = 1) => {
  console.error(`ledger: ${msg}`);
  process.exit(code);
};

if (cmd === 'send') {
  const to = opt('--to') ?? die('send requires --to');
  const amount = Number(opt('--amount') ?? die('send requires --amount'));
  const key = opt('--key'); // optional on purpose: the naive path has no key
  const entries = read();
  if (key) {
    const prior = entries.find((e) => e.key === key);
    if (prior) {
      console.log(
        `idempotent replay: key '${key}' already recorded as entry #${prior.id} — no new external effect`,
      );
      process.exit(0);
    }
  }
  const entry = {
    id: entries.length + 1,
    ts: new Date().toISOString(),
    to,
    amount,
    key: key ?? null,
  };
  mkdirSync(dirname(LEDGER), { recursive: true });
  appendFileSync(LEDGER, JSON.stringify(entry) + '\n'); // the external effect
  if (flag('--crash-before-record'))
    die(
      `simulated crash AFTER the external effect, BEFORE the confirmation reached the caller (entry #${entry.id} IS in the ledger)`,
      9,
    );
  console.log(`sent: entry #${entry.id} to=${to} amount=${amount} key=${key ?? 'none'}`);
} else if (cmd === 'query') {
  const key = opt('--key') ?? die('query requires --key');
  const hit = read().find((e) => e.key === key);
  if (!hit) die(`no entry for key '${key}'`);
  console.log(JSON.stringify(hit));
} else if (cmd === 'count') {
  const to = opt('--to') ?? die('count requires --to');
  console.log(read().filter((e) => e.to === to).length);
} else if (cmd === 'assert-count') {
  const to = opt('--to') ?? die('assert-count requires --to');
  const want = Number(opt('--n') ?? die('assert-count requires --n'));
  const got = read().filter((e) => e.to === to).length;
  if (got !== want) die(`FAIL — expected ${want} entr${want === 1 ? 'y' : 'ies'} to=${to}, found ${got}`);
  console.log(`ledger: PASS — exactly ${want} entr${want === 1 ? 'y' : 'ies'} to=${to}`);
} else if (cmd === 'reset') {
  mkdirSync(dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, '');
  console.log(`ledger: reset (${LEDGER})`);
} else {
  die('usage: ledger <send|query|count|assert-count|reset> … (see file header)', 2);
}
