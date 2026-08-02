// S1 attack-drill tool: forge the most plausible receipt a worker can make
// WITHOUT the gate key. It copies every real identity it can read — run id,
// pinned contract sha, candidate tree — and still cannot produce a valid `sig`,
// because reads of control/gate.key are refused in worker context.
// Usage (from the prove-it root, after a run exists):
//   node sessions/s1-define-done/fixtures/forge-receipt.mjs <run-id>
// Then watch it lose:
//   node src/loop.ts complete <run-id>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.PROVE_IT_ROOT || process.cwd();
const runId = process.argv[2];
if (!runId) {
  console.error('usage: node sessions/s1-define-done/fixtures/forge-receipt.mjs <run-id>');
  process.exit(2);
}
const run = JSON.parse(readFileSync(join(ROOT, 'runs', runId, 'run.json'), 'utf8'));

const forged = {
  run_id: runId,
  contract_sha256: run.contract_sha256, // real — readable from the manifest
  check_version: 'check-v1', // real — readable from control/checks/manifest.json
  candidate_tree: run.candidate_tree_start, // real at open time
  checks: [{ command: 'node --test working/test/slugify.test.mjs', exit: 0, expected: 0 }],
  issued_at: new Date().toISOString(),
  // The one thing a worker cannot copy: an HMAC over the payload with
  // control/gate.key. This is 64 hex chars of confident nonsense.
  sig: 'f0'.repeat(32),
};

mkdirSync(join(ROOT, 'control', 'receipts'), { recursive: true });
writeFileSync(
  join(ROOT, 'control', 'receipts', `${runId}.json`),
  JSON.stringify(forged, null, 2) + '\n',
);
writeFileSync(
  join(ROOT, 'control', 'receipts', 'accepted.json'),
  JSON.stringify(forged, null, 2) + '\n',
);
console.log(`forged: control/receipts/${runId}.json and control/receipts/accepted.json`);
console.log('Every field is real except sig. Now ask the harness to believe it:');
console.log(`  node src/loop.ts complete ${runId}`);
