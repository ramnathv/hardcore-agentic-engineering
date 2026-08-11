#!/usr/bin/env node
// A projector-friendly after-action view for the Session 3 live demo.
//
//   node scripts/s3-evidence.mjs
//   node scripts/s3-evidence.mjs live/artifacts/s3-<timestamp>
//
// With no argument, the newest Session 3 artifact is shown.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ARTIFACTS = join(ROOT, 'live', 'artifacts');
const useColor = !process.env.NO_COLOR;
const color = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const C = {
  blue: (text) => color('36', text),
  orange: (text) => color('38;5;208', text),
  green: (text) => color('32', text),
  red: (text) => color('31', text),
  yellow: (text) => color('33', text),
  dim: (text) => color('90', text),
  bold: (text) => color('1', text),
};

const width = Math.max(64, Math.min(96, (process.stdout.columns ?? 98) - 2));
const visibleLength = (text) => text.replace(/\x1b\[[0-9;]*m/g, '').length;

function wrap(text, max = width - 4) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if (line.length + word.length + 1 <= max) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function box(title, lines, paint = C.blue) {
  const label = ` ${title} `;
  const rule = '─'.repeat(Math.max(1, width - label.length - 2));
  console.log(paint(`╭─${label}${rule}╮`));
  for (const text of lines.flatMap((line) => wrap(line))) {
    const padding = ' '.repeat(Math.max(0, width - visibleLength(text) - 4));
    console.log(`${paint('│')} ${text}${padding} ${paint('│')}`);
  }
  console.log(paint(`╰${'─'.repeat(width - 2)}╯`));
}

function newest() {
  if (!existsSync(ARTIFACTS)) return null;
  return readdirSync(ARTIFACTS)
    .filter((name) => name.startsWith('s3-'))
    .map((name) => join(ARTIFACTS, name))
    .filter((path) => statSync(path).isDirectory() && existsSync(join(path, 'frames.txt')))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function readEvents(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function frame(text, side, name) {
  return text.match(new RegExp(`^${side} ${name} │ (.*)$`, 'm'))?.[1] ?? 'not recorded';
}

const supplied = process.argv[2];
if (supplied === '--help' || supplied === '-h') {
  console.log('usage: node scripts/s3-evidence.mjs [<s3-artifact-dir>]');
  process.exit(0);
}
const artifact = supplied ? resolve(process.cwd(), supplied) : newest();
if (!artifact || !existsSync(artifact)) {
  console.error('s3-evidence: no Session 3 artifact found');
  process.exit(1);
}

const framesText = readFileSync(join(artifact, 'frames.txt'), 'utf8');
const decisionText = existsSync(join(artifact, 'decision.txt'))
  ? readFileSync(join(artifact, 'decision.txt'), 'utf8')
  : '';
const answer = decisionText.match(/^answer: (.*)$/m)?.[1] ?? 'not recorded';
const observationPath = [
  join(artifact, 'right', 'operator', 'world-observation.json'),
  join(artifact, 'operator', 'world-observation.json'),
].find(existsSync);
const observation = observationPath ? readJson(observationPath) : null;
const entries = Array.isArray(observation?.matching_entries) ? observation.matching_entries : [];
const pending = observation?.pending ?? {};
const intent = pending.intent ?? 'unknown intent';
const key = pending.idempotency_key ?? null;
const exactMatches = key
  ? entries.filter((entry) => (entry.idempotency_key ?? entry.key) === key).length
  : entries.length;
const evidenceSupports = exactMatches === 1 ? 'ok' : exactMatches === 0 ? 'failed' : 'in_doubt';

const prefixEvents = readEvents(join(artifact, 'prefix', 'shared', 'events.jsonl'));
const leftEvents = readEvents(join(artifact, 'left', 'shared', 'events.jsonl'));
const rightEventsPath = existsSync(join(artifact, 'right', 'shared', 'events.jsonl'))
  ? join(artifact, 'right', 'shared', 'events.jsonl')
  : join(artifact, 'operator', 'reconciliation-events.jsonl');
const events = readEvents(rightEventsPath);
const reconciliationIndex = events.findIndex(
  (event) =>
    event.type === 'tool.reconciled' ||
    (event.type === 'tool.result' && event.actor === 'operator' && /reconciliation/i.test(JSON.stringify(event.data))),
);
const afterReconciliation = reconciliationIndex >= 0 ? events.slice(reconciliationIndex + 1) : [];
const repeatedPayments = afterReconciliation.filter(
  (event) => event.type === 'tool.dispatched' && event.data?.tool === 'send_payment',
).length;
const inspectedAgain = afterReconciliation.some(
  (event) => event.type === 'tool.result' && event.data?.tool === 'inspect_ledger',
);

const eventTime = (event) => String(event?.ts ?? '').slice(11, 19) || '        ';
const resultData = (event) => event?.data?.result ?? event?.data ?? {};
const resultSummary = (event) => resultData(event).summary ?? resultData(event).policy ?? 'no summary';
const actorName = (event) => ({ worker: 'AGENT', harness: 'HARNESS', tool: 'TOOL', operator: 'OPERATOR' })[event?.actor] ?? 'SYSTEM';
const logEntry = (event, text) => `${C.dim(eventTime(event))}  ${actorName(event).padEnd(8)} ${text}`;
const clip = (text, max = 76) => {
  const clean = String(text ?? '').replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1) + '…';
};
const quote = (text) => `“${clip(String(text ?? '').split('\n')[0], 60)}”`;
const firstEvent = (events, type, tool) =>
  events.find((event) => event.type === type && (!tool || event.data?.tool === tool));
const lastEvent = (events, type, tool) =>
  events.findLast((event) => event.type === type && (!tool || event.data?.tool === tool));

const sharedLedgerRead = firstEvent(prefixEvents, 'tool.result', 'inspect_ledger');
const sharedAgentDecision = prefixEvents.find(
  (event) => event.type === 'message.completed' && event.data?.text,
);
const sharedDispatch = lastEvent(prefixEvents, 'tool.dispatched', 'send_payment');
const sharedResult = sharedDispatch
  ? prefixEvents.find(
      (event) =>
        event.type === 'tool.result' && event.data?.call_id === sharedDispatch.data?.call_id,
    )
  : null;
const leftOpened = firstEvent(leftEvents, 'run.requested');
let leftPaymentNumber = 0;
const leftActivity = leftEvents
  .filter(
    (event) =>
      (event.data?.tool === 'read_file' &&
        (event.type === 'tool.refused' ||
          (event.type === 'tool.result' && resultData(event).status === 'failed'))) ||
      (event.type === 'tool.result' && event.data?.tool === 'run_check') ||
      (event.type === 'tool.result' && event.data?.tool === 'send_payment') ||
      event.type === 'worker.claimed_done',
  )
  .map((event) => {
    if (event.type === 'worker.claimed_done') return logEntry(event, quote(event.data?.text));
    if (event.data?.tool === 'run_check')
      return logEntry(event, 'run_check → failed · unrelated slugify check');
    if (event.data?.tool === 'read_file')
      return logEntry(event, `read_file → ${resultSummary(event)}`);
    leftPaymentNumber += 1;
    return logEntry(
      event,
      leftPaymentNumber === 1
        ? `send_payment with NEW KEY → ${resultSummary(event)} · second ledger entry overall`
        : `send_payment with SAME KEY → ${resultSummary(event)} · no third entry`,
    );
  });
const rightReconciliation = reconciliationIndex >= 0 ? events[reconciliationIndex] : null;
const rightResume = firstEvent(afterReconciliation, 'run.resumed');
const rightProcess = firstEvent(afterReconciliation, 'provider.session.started');
const rightLedgerRead = afterReconciliation.find(
  (event) => event.type === 'tool.result' && event.data?.tool === 'inspect_ledger',
);
const rightClaim = lastEvent(afterReconciliation, 'worker.claimed_done');

const leftVerdict = frame(framesText, 'left', 'VERDICT');
const rightVerdict = frame(framesText, 'right', 'VERDICT');
const artifactName = relative(ROOT, artifact);

console.log(`\n${C.blue(C.bold('SESSION 3 · WHAT SURVIVED THE CRASH'))}`);
console.log(C.dim(`Artifact: ${artifactName}`));
console.log();

box(
  'SHARED · BEFORE THE CRASH',
  prefixEvents.length
    ? [
        sharedLedgerRead
          ? logEntry(sharedLedgerRead, `inspect_ledger → ${resultSummary(sharedLedgerRead)}`)
          : '        inspect_ledger → no retained result',
        sharedAgentDecision
          ? logEntry(sharedAgentDecision, quote(sharedAgentDecision.data.text))
          : '        AGENT    decides to send the payment',
        sharedDispatch
          ? logEntry(sharedDispatch, `send_payment(${intent}) → DISPATCHED${key ? ` · key=${key}` : ''}`)
          : '        send_payment → dispatch not retained',
        sharedResult
          ? logEntry(sharedResult, `send_payment → ${resultSummary(sharedResult)}`)
          : `${C.dim(eventTime(sharedDispatch))}  PROCESS STOPPED → no payment result recorded`,
      ]
    : [
        'fixture  send_payment was dispatched and changed the ledger',
        'fixture  process stopped before it recorded a result',
      ],
  C.orange,
);
console.log(C.dim('                          ↓ same changed world, two recovery controls'));
box(
  'LEFT · BLIND RETRY',
  leftEvents.length
    ? [
        '        pre-crash history → DROPPED; a new worker starts without it',
        leftOpened
          ? logEntry(
              leftOpened,
              `new run · tools: ${(leftOpened.data?.tools ?? []).join(', ')} · no inspect_ledger`,
            )
          : '        HARNESS  inspect_ledger is absent from this lane',
        ...leftActivity,
        `VERDICT   ${leftVerdict}`,
      ]
    : [
        'fixture  pre-crash history → DROPPED',
        'fixture  blind retry → a second payment lands',
        `VERDICT   ${leftVerdict}`,
      ],
  C.red,
);
box(
  'RIGHT · RECONCILE BY EVIDENCE',
  [
    '        pre-crash history → RETAINED; run state is needs_reconcile',
    '        bare resume → REFUSED',
    `        operator reads ledger → ${entries.length} matching entr${entries.length === 1 ? 'y' : 'ies'}${key ? ` · key=${key}` : ''}`,
    rightReconciliation
      ? logEntry(rightReconciliation, `operator records → ${answer}`)
      : `        operator records → ${answer}`,
    rightResume
      ? logEntry(rightResume, `new process receives the recorded ${answer} result`)
      : '        HARNESS  run resumes from the recorded decision',
    rightProcess
      ? logEntry(rightProcess, `new provider process → ${rightProcess.data?.model ?? 'model not recorded'}`)
      : '        HARNESS  recovery process starts',
    rightLedgerRead
      ? logEntry(rightLedgerRead, `restarted inspect_ledger → ${resultSummary(rightLedgerRead)}`)
      : '        operator observation supplies the recovery evidence',
    rightClaim
      ? logEntry(rightClaim, quote(rightClaim.data?.text))
      : '        run resumes from the recorded decision',
    repeatedPayments === 0
      ? '        send_payment after resume → NONE'
      : `        send_payment after resume → ${repeatedPayments}`,
    `VERDICT   ${rightVerdict}`,
  ],
  repeatedPayments === 0 ? C.green : C.red,
);

if (answer !== evidenceSupports) {
  console.log();
  box(
    'DISCUSSION',
    [
      `The room recorded ${answer}; the retained ledger evidence supports ${evidenceSupports}.`,
      'Ask whether this ledger is authoritative enough to justify the stronger claim.',
    ],
    C.yellow,
  );
}

console.log(
  `\n${C.bold('Takeaway:')} the durable record did not know whether the payment landed. It preserved that uncertainty long enough for external evidence and human judgment to resolve it without a blind retry.\n`,
);
