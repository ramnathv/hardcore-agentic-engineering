// The five ToolResult statuses, each produced by an ACTUAL dispatch through
// src/tools.ts — except in_doubt, which no tool in the starter ever returns,
// and the tour says so instead of faking one (honest labels, always).
//
//   node sessions/s3-control-plane/fixtures/toolresult-tour.mjs
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../../src/root.ts';
import { dispatch } from '../../../src/tools.ts';

const ctx = {
  runDir: join(ROOT, 'runs', 's3-tour'),
  // A check that prints then fails: shows artifact retention + bounded observation.
  checkCommand: `node -e "for (let i = 1; i <= 40; i++) console.log('output line ' + i); console.error('assertion failed: expected rock-and-roll'); process.exit(1)"`,
  checkExpectedExit: 0,
};

const show = (label, result) => {
  console.log(`\n== ${label}`);
  console.log(JSON.stringify(result, null, 2));
};

console.log('ToolResult tour — every result below comes from a real dispatch');

// ok: a permitted read inside working/
show('ok — read_file working/BRIEF.md', dispatch('read_file', { path: 'working/BRIEF.md' }, ctx));

// failed: the named check exits 1. Full output retained as an artifact;
// the observation carries only the bounded tail. retryable: true.
show('failed — run_check (exit 1, artifact retained, observation bounded)',
  dispatch('run_check', {}, ctx));

// refused: policy, not error. Note the structured `policy` + `next` fields —
// a refusal tells the worker what to do instead; a failure invites a retry.
show('refused — read_file control/gate.key (credential policy)',
  dispatch('read_file', { path: 'control/gate.key' }, ctx));

// pending: the action needs an approval that has not been granted yet.
show('pending — request_release (human-owned action)', dispatch('request_release', {}, ctx));

// in_doubt: NO tool in the starter returns this from dispatch. It enters the
// log when an operator reconciles a crash between dispatch and record:
//   loop resume <run-id> --reconcile in_doubt
// appends a tool.result event shaped like this:
console.log('\n== in_doubt — never returned by dispatch in the starter (and the tour will not fake one)');
console.log(JSON.stringify({
  status: 'in_doubt',
  summary: 'operator reconciliation: marked in_doubt after crash between dispatch and record',
  reconcile: 'operator inspected the world by hand',
}, null, 2));
console.log('\nSee reader ch. 3 "Tool contracts": the exact type is not important; the distinctions are.');

rmSync(join(ROOT, 'runs', 's3-tour'), { recursive: true, force: true });
