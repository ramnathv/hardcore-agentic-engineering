// The single presentation layer for live compare scenarios. Scenarios declare;
// this file owns staging, guards, panes, pauses, fallback, and the artifact.
//
//   node live/runner.ts <scenarioId> [--mock] [--seq] [--ci] [--lane left|right]
//
//   default        tmux, two panes (falls back to --seq if tmux is absent)
//   --seq          left lane fully, then right lane, in one terminal
//   --mock         rehearsal/student mode: mockCmd where declared and capture
//                  replay for real-only lanes; a TTY can still answer the pause
//   --ci           non-interactive: the pause accepts its default
//   --lane SIDE    run one lane only (the tmux panes use this)
//   --describe     print the declared causal difference and exit (the battery)
//   --artifact DIR internal: share one artifact directory across panes
//
// The presentation grammar (shared by the live path and the capture path):
//   ▌ LEFT — LABEL      lane banner, then the boxed INPUT the worker was given
//   $ command           dim cyan, truncated — what is about to run
//   · narration         dim — the operator's story line
//   ● worker text       dim — the worker's own words, head+tail truncated
//   ⏺ tool(arg)         dim cyan — the worker's tool calls
//   ▌ FRAME   │ line    loud, colored, blank line above and below
//   ■ ROOM DECISION     the pause: bright, ruled off, default marked
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import readline from 'node:readline';
import type { FrameName, LaneSide, PauseSpec, Scenario, Step } from './scenario.ts';

const LIVE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(LIVE, '..');
const MARKER = '.prove-it-live-lane'; // ownership marker: cleanup refuses dirs without it
const HEAD_LINES = 8; // worker/exhibit stream: 8 head + 3 tail + the elision line ≈ 12
const TAIL_LINES = 3;
const BOX_WRAP = 72; // wrap width inside the INPUT box
const CMD_WIDTH = 88; // visible `$` lines are truncated; the full command is in the artifact

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[97m',
  orange: '\x1b[38;5;208m',
};
const FRAME_COLOR: Record<FrameName, string> = {
  START: C.cyan,
  SURPRISE: C.yellow,
  CONTROL: C.orange,
  VERDICT: C.green,
};
const BAD = /fail(?!\s*0\b)|refus|✖|error|unexpected/i; // VERDICT (and summary) go red by content

const argv = process.argv.slice(2);
const id = argv[0];
const has = (f: string) => argv.includes(f);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const MOCK = has('--mock');
const CI = has('--ci');
const LANE = opt('--lane') as LaneSide | undefined;
const ARTIFACT_OPT = opt('--artifact');
const MODE = MOCK ? 'mock' : 'real';
let seqMode = has('--seq');

const fail = (msg: string): never => {
  console.error(`runner: ${msg}`);
  process.exit(1);
};

// ── cleanup: preserve the artifact (already on disk), then remove only temp
// directories that pass both the expected-path and ownership-marker checks ──
const staged: string[] = [];
function cleanup() {
  for (const dir of staged) {
    try {
      const real = realpathSync(dir);
      if (!real.startsWith(realpathSync(tmpdir()) + sep)) continue;
      if (!existsSync(join(real, MARKER))) continue;
      rmSync(real, { recursive: true, force: true });
    } catch {
      /* a vanished temp dir is already clean */
    }
  }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
  process.on(sig, () => {
    console.error(`\nrunner: interrupted — artifact preserved, temp copies removed.`);
    process.exit(130);
  });

async function loadScenario(scenarioId: string): Promise<Scenario> {
  const dir = join(LIVE, 'scenarios');
  const file = existsSync(dir)
    ? readdirSync(dir).find((f) => f.startsWith(scenarioId + '-') && f.endsWith('.ts'))
    : undefined;
  if (!file) return fail(`no scenario '${scenarioId}' under live/scenarios/ (expected ${scenarioId}-*.ts)`);
  const mod = await import(pathToFileURL(join(dir, file)).href);
  const sc: Scenario | undefined = mod.default ?? mod.scenario;
  if (!sc?.steps?.length) return fail(`${file} does not export a Scenario`);
  return sc;
}

function replayCommand(sc: Scenario): string {
  const flags = [MOCK ? ' --mock' : '', seqMode ? ' --seq' : ''].join('');
  return `bash scripts/demo-compare.sh ${sc.id}${flags}`;
}

function artifactDir(sc: Scenario): string {
  if (ARTIFACT_OPT) {
    mkdirSync(ARTIFACT_OPT, { recursive: true });
    return ARTIFACT_OPT;
  }
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, 'Z');
  const dir = join(LIVE, 'artifacts', `${sc.id}-${ts}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function seedArtifact(sc: Scenario, art: string) {
  try {
    writeFileSync(join(art, 'frames.txt'), `# expected evidence shape: ${sc.evidenceNote}\n`, {
      flag: 'wx',
    });
  } catch {
    /* another pane already seeded it */
  }
  if (!existsSync(join(art, 'replay.txt')))
    writeFileSync(join(art, 'replay.txt'), replayCommand(sc) + '\n');
}

// ── staging: each lane gets its own throwaway copy of the checkout ──
function stageLane(sc: Scenario, side: LaneSide): string {
  const tmp = mkdtempSync(join(tmpdir(), `prove-it-live-${sc.id}-${side}-`));
  staged.push(tmp);
  cpSync(ROOT, tmp, {
    recursive: true,
    filter: (src) => {
      const rel = relative(ROOT, src);
      if (rel === '') return true;
      const top = rel.split(sep)[0];
      // live/ stays out of the stage: nothing in a lane needs the runner, and a
      // real worker must not find captures of the demo it is starring in.
      return top !== '.git' && top !== 'node_modules' && top !== 'live';
    },
  });
  for (const runState of [join(tmp, 'runs'), join(tmp, 'control', 'receipts')]) {
    mkdirSync(runState, { recursive: true });
    for (const e of readdirSync(runState)) if (e !== '.gitkeep') rmSync(join(runState, e), { recursive: true, force: true });
  }
  copyFileSync(
    join(tmp, 'control', 'checks', 'fixtures', 'solution-stub.mjs'),
    join(tmp, 'working', 'src', 'slugify.mjs'),
  );
  // Observer tooling (e.g. SpecStory) writes session transcripts into the
  // workspace; they are not worker output and must not contaminate evidence
  // diffstats. Only the stage's own .gitignore changes, never the checkout's.
  appendFileSync(join(tmp, '.gitignore'), '.specstory/\n');
  writeFileSync(join(tmp, MARKER), `${sc.id} ${side} ${new Date().toISOString()}\n`);
  return tmp;
}

// HARD GUARD: no step ever runs outside its lane's temp copy. Refuse loudly.
function assertStaged(cwd: string, stage: string) {
  const real = realpathSync(cwd);
  const stageReal = realpathSync(stage);
  const inside = real === stageReal || real.startsWith(stageReal + sep);
  const inTmp = stageReal.startsWith(realpathSync(tmpdir()) + sep);
  const owned = existsSync(join(stageReal, MARKER));
  if (!inside || !inTmp || !owned)
    fail(
      `REFUSING to run a step: cwd '${real}' is not inside an owned temp copy ` +
        `('${stageReal}'). Nothing may touch the real checkout.`,
    );
}

function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: '1' };
  delete env.PROVE_IT_ROOT; // the staged copy resolves its own root; never inherit one
  return env;
}

interface LaneState {
  side: LaneSide;
  stage: string;
  runid: string;
  answer: string | null;
  onCapture: boolean;
  capChunked: boolean; // capture entered at a declared step: play it in chunks, in step order
  capLines: string[];
  capCursor: number;
  capPlayed: number;
  unexpected: boolean;
}

const framesMem: Record<LaneSide, Partial<Record<FrameName, string>>> = { left: {}, right: {} };
let artDir = '';

// ── output primitives: one writer, so blank lines never stack ──
let lastBlank = true;
const put = (s = '') => {
  if (s === '' && lastBlank) return;
  console.log(s);
  lastBlank = s.trim() === '';
};
const blank = () => put('');
const show = (s: string) => put('  ' + s);
const logLane = (side: LaneSide, text: string) =>
  appendFileSync(join(artDir, `${side}.log`), text + '\n');
const interp = (s: string, lane: LaneState) =>
  s.replaceAll('{{runid}}', lane.runid).replaceAll('{{answer}}', lane.answer ?? '{{answer}}');
const firstLine = (s: string) => s.split('\n').find((l) => l.trim())?.trim() ?? '';
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (line && (line + ' ' + word).length > width) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
  }
  return lines;
}

// ── the grammar ──
const sayLine = (side: LaneSide, text: string) => {
  show(`${C.dim}· ${text}${C.reset}`);
  logLane(side, `· ${text}`);
};
const cmdLine = (cmd: string) => show(`${C.dim}${C.cyan}$ ${trunc(cmd, CMD_WIDTH)}${C.reset}`);

// The INPUT box: the exact prompt/brief a lane's worker was given, shown
// before anything runs — the dod-demo "PROMPT TO CLAUDE" moment.
function printInputBox(side: LaneSide, text: string) {
  const body = wrapText(text.trim(), BOX_WRAP);
  const w = Math.max(...body.map((l) => l.length), 44);
  blank();
  show(`${C.gray}┌─ ${C.reset}${C.bold}${C.cyan}INPUT${C.reset}${C.gray} ${'─'.repeat(w - 6)}┐${C.reset}`);
  for (const l of body) show(`${C.gray}│${C.reset} ${l.padEnd(w)} ${C.gray}│${C.reset}`);
  show(`${C.gray}└${'─'.repeat(w + 2)}┘${C.reset}`);
  blank();
  logLane(side, `INPUT (shown boxed on screen):`);
  for (const l of body) logLane(side, `  ${l}`);
}

// One renderer for every streamed line, live or replayed — worker text gets a
// dim ●, tool calls keep their ⏺, results their ⎿, exactly the lib.mjs shape.
function streamLine(raw: string, mode: 'worker' | 'exhibit') {
  const t = raw.trim();
  if (!t) return;
  if (t.startsWith('$ ')) {
    cmdLine(t.slice(2));
    return;
  }
  if (t.startsWith('⏺')) {
    show(`${C.dim}${C.cyan}⏺${C.reset}${C.dim} ${trunc(t.slice(1).trim(), 104)}${C.reset}`);
    return;
  }
  if (t.startsWith('●')) {
    show(`${C.dim}● ${trunc(t.slice(1).trim(), 104)}${C.reset}`);
    return;
  }
  if (t.startsWith('⎿')) {
    show(`  ${C.dim}⎿ ${trunc(t.slice(1).trim(), 100)}${C.reset}`);
    return;
  }
  if (mode === 'worker') show(`${C.dim}● ${trunc(t, 104)}${C.reset}`);
  else show(`${C.dim}  ${trunc(t, 104)}${C.reset}`);
}

// Head+tail throttle: at most HEAD_LINES + TAIL_LINES visible lines per step,
// with an honest elision in the middle. The full text is always in the artifact.
function makeStream(mode: 'worker' | 'exhibit') {
  let shown = 0;
  let hidden = 0;
  const held: string[] = [];
  return {
    push(line: string) {
      if (!line.trim()) return;
      if (shown < HEAD_LINES) {
        streamLine(line, mode);
        shown += 1;
      } else {
        held.push(line);
        if (held.length > TAIL_LINES) {
          held.shift();
          hidden += 1;
        }
      }
    },
    flush() {
      if (hidden > 0) show(`${C.dim}… ${hidden} lines … (full text in artifact)${C.reset}`);
      for (const l of held) streamLine(l, mode);
    },
  };
}

// ── live `claude -p --output-format stream-json` rendering (lib.mjs shape) ──
function summarizeInput(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const o = input as Record<string, unknown>;
  if (o.file_path) return String(o.file_path).split('/').pop() ?? '';
  if (o.path) return String(o.path);
  if (o.command) return String(o.command).split('\n')[0].slice(0, 60);
  if (o.pattern) return String(o.pattern);
  const s = JSON.stringify(o);
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}
// Returns rendered lines for a stream-json event, [] for a consumed event with
// nothing to show, or null when the line is not an event (plain worker output).
function claudeEventLines(raw: string, side: LaneSide): string[] | null {
  if (!raw.startsWith('{')) return null;
  let ev: any;
  try {
    ev = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof ev?.type !== 'string') return null;
  const rendered: string[] = [];
  if (ev.type === 'system' && ev.subtype === 'init') rendered.push('● started session');
  else if (ev.type === 'assistant' && ev.message?.content) {
    for (const c of ev.message.content) {
      if (c.type === 'text' && c.text?.trim()) rendered.push('● ' + c.text.trim().split('\n')[0]);
      else if (c.type === 'tool_use') {
        const arg = summarizeInput(c.input);
        rendered.push('⏺ ' + c.name + (arg ? `(${arg})` : ''));
      }
    }
  } else if (ev.type === 'user' && ev.message?.content) {
    for (const c of ev.message.content) {
      if (c.type === 'tool_result') {
        const body = Array.isArray(c.content) ? c.content.map((x: any) => x.text || '').join(' ') : c.content || '';
        const first = String(body).trim().split('\n')[0];
        if (first) rendered.push('⎿ ' + first);
      }
    }
  } else if (ev.type === 'result') {
    // the complete final answer goes to the artifact; the stream showed its head
    if (typeof ev.result === 'string' && ev.result.trim())
      logLane(side, '--- final answer (full text) ---\n' + ev.result.trim());
  }
  return rendered;
}

function execStep(
  cmdText: string,
  cwd: string,
  timeoutMs: number,
  side: LaneSide,
  options: { render: 'worker' | 'exhibit' | 'none'; allowFallback: boolean },
) {
  return new Promise<{ code: number; out: string; timedOut: boolean; fallbackRequested: boolean }>((done) => {
    const child = spawn('bash', ['-c', cmdText], {
      cwd,
      env: childEnv(),
      detached: true, // its own process group, so a timeout can stop all of it
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const lines: string[] = [];
    const stream = options.render === 'none' ? null : makeStream(options.render);
    const onLine = (line: string) => {
      lines.push(line);
      if (options.render === 'worker') {
        const rendered = claudeEventLines(line, side);
        if (rendered) {
          for (const r of rendered) {
            logLane(side, r);
            stream?.push(r);
          }
          return;
        }
      }
      logLane(side, line);
      stream?.push(line);
    };
    readline.createInterface({ input: child.stdout! }).on('line', onLine);
    readline.createInterface({ input: child.stderr! }).on('line', onLine);
    let timedOut = false;
    let fallbackRequested = false;
    const input = process.stdin as NodeJS.ReadStream;
    const wasPaused = input.isPaused();
    const wasRaw = input.isRaw ?? false;
    const stopInput = () => {
      input.off('data', onInput);
      if (input.isTTY && input.setRawMode) input.setRawMode(wasRaw);
      if (wasPaused) input.pause();
    };
    const stopChild = () => {
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        /* already gone */
      }
    };
    const onInput = (chunk: Buffer | string) => {
      const key = chunk.toString();
      if (key.includes('\u0003')) {
        stopChild();
        stopInput();
        process.kill(process.pid, 'SIGINT');
        return;
      }
      if (key.toLowerCase().includes('f')) {
        fallbackRequested = true;
        show(`${C.yellow}${C.bold}fallback requested — stopping the live worker.${C.reset}`);
        stopChild();
      }
    };
    if (options.allowFallback && input.isTTY && input.setRawMode) {
      show(`${C.dim}${C.orange}(press f to switch this live worker to its capture)${C.reset}`);
      input.setRawMode(true);
      input.resume();
      input.on('data', onInput);
    }
    const timer = setTimeout(() => {
      timedOut = true;
      stopChild();
    }, timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      stopInput();
      done({ code: 127, out: lines.join('\n'), timedOut, fallbackRequested });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      stopInput();
      stream?.flush();
      done({ code: code ?? 1, out: lines.join('\n'), timedOut, fallbackRequested });
    });
  });
}

// The switch to a capture must be visible and honest, never silent. The body
// never dumps here: the lane plays it in chunks, each beside the step that
// narrates it (playCaptureChunk below), through the same stream renderer the
// live path uses — so a replay and a live run share one shape.
function replayCapture(sc: Scenario, lane: LaneState, reason: string) {
  const cap = sc.lanes[lane.side].capture;
  if (!cap) {
    show(`${C.red}✖ no capture declared for the ${lane.side} lane — cannot fall back.${C.reset}`);
    lane.unexpected = true;
    process.exitCode = 1;
    return;
  }
  const file = resolve(ROOT, cap.path);
  if (!existsSync(file)) {
    show(`${C.red}✖ capture missing: ${cap.path} — cannot fall back.${C.reset}`);
    lane.unexpected = true;
    process.exitCode = 1;
    return;
  }
  const raw = readFileSync(file, 'utf8').split('\n');
  let i = 0;
  const header: string[] = [];
  while (i < raw.length && raw[i].startsWith('#')) header.push(raw[i++]);
  const body = raw
    .slice(i)
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
  blank();
  show(`${C.orange}${C.bold}▌ REPLAY — capture stands in for the live worker (${reason})${C.reset}`);
  show(`${C.dim}${C.orange}  provenance: ${cap.provenance}${C.reset}`);
  for (const h of header) show(`${C.dim}  ${h}${C.reset}`);
  appendFileSync(join(artDir, `${lane.side}.log`), body + '\n');
  appendFileSync(
    join(artDir, 'provenance.txt'),
    `${lane.side}: replayed ${cap.path} — ${cap.provenance} (reason: ${reason})\n` +
      header.map((h) => `${lane.side}: ${h}`).join('\n') +
      '\n',
  );
  lane.onCapture = true;
  lane.capLines = body.split('\n');
  lane.capCursor = 0;
  lane.capPlayed = 0;
}

// Interleaved capture playback. Captures are self-narrating: their `· ` lines
// are the say-lines the runner just printed live, so skip them, then play the
// recorded lines for this step — everything up to the next narration line.
// Worker steps show their chunk through the ● stream; frame-bearing steps show
// the chunk's first `$` command; everything else plays silently into the
// artifact. Frames keep extracting from the full capture, in step order.
function playCaptureChunk(lane: LaneState, opts: { body?: boolean; cmds?: boolean } = {}) {
  const isSay = (l: string) => l.startsWith('· ');
  let i = lane.capPlayed;
  while (i < lane.capLines.length && isSay(lane.capLines[i])) i++;
  const start = i;
  while (i < lane.capLines.length && !isSay(lane.capLines[i])) i++;
  lane.capPlayed = i;
  if (i <= start || (!opts.body && !opts.cmds)) return;
  const stream = opts.body ? makeStream('worker') : null;
  let printedCmd = false;
  for (const l of lane.capLines.slice(start, i)) {
    if (l.startsWith('$ ')) {
      if (opts.cmds && (opts.body || !printedCmd)) {
        cmdLine(l.slice(2));
        printedCmd = true;
      }
      continue;
    }
    stream?.push(l);
  }
  stream?.flush();
}

function matchExtract(pattern: string, out: string): string | null {
  const re = new RegExp(pattern);
  for (const l of out.split('\n')) if (re.test(l)) return l.trim();
  return null;
}

// Frames replayed from a capture are matched in order: the cursor only moves
// forward, so START/SURPRISE/CONTROL/VERDICT land in sequence.
function frameFromCapture(lane: LaneState, step: Step): string | null {
  const re = new RegExp(step.extract!);
  for (let i = lane.capCursor; i < lane.capLines.length; i++) {
    if (re.test(lane.capLines[i])) {
      lane.capCursor = i + 1;
      return lane.capLines[i].trim();
    }
  }
  return null;
}

// Frames are the loudest thing on screen: fixed label column, one color per
// kind, breathing room above and below. VERDICT goes red or green by content.
function emitFrame(side: LaneSide, name: FrameName, line: string) {
  framesMem[side][name] = line;
  const color = name === 'VERDICT' && BAD.test(line) ? C.red : FRAME_COLOR[name];
  blank();
  show(`${C.bold}${color}▌ ${name.padEnd(8)}│ ${trunc(line, 110)}${C.reset}`);
  blank();
  appendFileSync(join(artDir, 'frames.txt'), `${side} ${name} │ ${line}\n`);
}

async function runPause(sc: Scenario, lane: LaneState) {
  const p: PauseSpec = sc.pause;
  const rule = `${C.yellow}${'─'.repeat(56)}${C.reset}`;
  blank();
  show(rule);
  show(`${C.bold}${C.yellow}■ ROOM DECISION${C.reset}`);
  show(`${C.bold}${C.yellow}? ${p.question}${C.reset}`);
  if (p.kind === 'menu' && p.options)
    p.options.forEach((o, i) =>
      show(`  ${i + 1}. ${o}${o === p.default ? `  ${C.dim}◀ default${C.reset}` : ''}`),
    );
  else show(`${C.dim}  free text — Enter takes the default: "${p.default}"${C.reset}`);
  show(rule);
  let answer = p.default;
  let defaultUsed = true;
  if (!CI && process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const raw = (await new Promise<string>((res) => rl.question('  > ', res))).trim();
    rl.close();
    if (raw) {
      if (p.kind === 'menu' && p.options) {
        const pick = p.options[Number(raw) - 1] ?? p.options.find((o) => o === raw);
        if (pick) {
          answer = pick;
          defaultUsed = false;
        } else show(`${C.dim}unrecognized — taking the default '${p.default}'${C.reset}`);
      } else {
        answer = raw;
        defaultUsed = false;
      }
    }
  } else {
    const why = CI ? '--ci' : 'no TTY';
    show(`${C.dim}> ${answer}  (default accepted: ${why})${C.reset}`);
  }
  lane.answer = answer;
  logLane(lane.side, `? ${p.question}`);
  logLane(lane.side, `> ${answer}${defaultUsed ? ' (default)' : ''}`);
  writeFileSync(
    join(artDir, 'decision.txt'),
    `scenario: ${sc.id} — ${sc.title}\n` +
      `question: ${p.question}\n` +
      `answer: ${answer}\n` +
      `default-used: ${defaultUsed ? 'yes' : 'no'}\n` +
      `note: ${sc.artifactNote}\n`,
  );
  show(`${C.dim}recorded to the artifact — an operator decision is evidence.${C.reset}`);
  blank();
}

async function readSharedDecision(sc: Scenario, lane: LaneState) {
  const file = join(artDir, 'decision.txt');
  show(`${C.dim}the left pane takes the room decision once; this lane waits for it.${C.reset}`);
  const deadline = Date.now() + 60_000;
  while (!existsSync(file) && Date.now() < deadline)
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  if (!existsSync(file)) fail(`the shared room decision did not arrive within 60 seconds`);
  const text = readFileSync(file, 'utf8');
  const answer = text.match(/^answer: (.*)$/m)?.[1];
  if (!answer) fail(`the shared decision artifact has no answer`);
  lane.answer = answer;
  logLane(lane.side, `> ${answer} (shared room decision)`);
  show(`${C.dim}room decision received: ${answer}${C.reset}`);
}

async function runLane(sc: Scenario, side: LaneSide) {
  const spec = sc.lanes[side];
  blank();
  put(`${C.bold}▌ ${side.toUpperCase()} — ${spec.label}${C.reset}`);
  show(`${C.dim}mechanism: ${sc.mechanism}${C.reset}`);
  show(`${C.dim}shared fixture: ${sc.sharedFixture}${C.reset}`);
  const stage = stageLane(sc, side);
  show(`${C.dim}mode: ${MODE} · staged throwaway copy: ${stage}${C.reset}`);
  appendFileSync(join(artDir, 'provenance.txt'), `${side}: mode=${MODE}\n`);
  const lane: LaneState = {
    side,
    stage,
    runid: `${sc.id}${side === 'left' ? 'l' : 'r'}-${Date.now().toString(36).slice(-6)}`,
    answer: null,
    onCapture: false,
    capChunked: false,
    capLines: [],
    capCursor: 0,
    capPlayed: 0,
    unexpected: false,
  };
  // The room sees the exact input before anything runs — the dod-demo rhythm.
  if (spec.promptDisplay) printInputBox(side, interp(spec.promptDisplay, lane));
  // 300s: a real `claude -p` step legitimately runs for minutes. The `f` key
  // is the fast exit; this deadline only catches a hung worker.
  const timeoutMs = (sc.stepTimeoutSec ?? 300) * 1000;

  for (const step of sc.steps) {
    if (step.lane !== 'both' && step.lane !== side) continue;
    if (step.say) {
      const s = interp(step.say, lane);
      // A say-fed frame prints once, loud, as the frame — not twice.
      if (step.frame && !step.extract) logLane(side, `· ${s}`);
      else sayLine(side, s);
    }
    if (step.promptDisplay) printInputBox(side, interp(step.promptDisplay, lane));
    if (step.pause) {
      if (step.lane === 'both' && side === 'right') await readSharedDecision(sc, lane);
      else await runPause(sc, lane);
    }

    const cmdText = MOCK ? (step.mockCmd ?? step.cmd) : (step.realCmd ?? step.cmd);
    // A worker step drives (or replays) an agent: its input was boxed, its
    // output streams as dim ● lines through the head+tail throttle.
    const isWorker = step.captureRef === true || Boolean(step.promptDisplay);
    let out: string | null = null;
    if (!lane.onCapture && cmdText) {
      const cmd = interp(cmdText, lane);
      logLane(side, `$ ${cmd}`);
      const cwd = step.cwdKey ? resolve(stage, step.cwdKey) : stage;
      assertStaged(cwd, stage);
      const render = isWorker ? 'worker' : step.showOutput === true ? 'exhibit' : 'none';
      if (render !== 'none' || step.frame) cmdLine(cmd);
      const res = await execStep(cmd, cwd, timeoutMs, side, {
        render,
        allowFallback: !MOCK && Boolean(spec.capture) && step.captureRef === true,
      });
      out = res.out;
      if (res.fallbackRequested || res.timedOut || res.code !== 0) {
        const why = res.fallbackRequested
          ? 'operator pressed f'
          : res.timedOut
          ? `timed out after ${timeoutMs / 1000}s`
          : `failed (exit ${res.code})`;
        if (!MOCK && spec.capture) {
          show(`${C.yellow}${C.bold}■ SWITCH — real step ${why}; replaying the ${side} capture.${C.reset}`);
          replayCapture(sc, lane, `real step ${why}`);
          lane.capChunked = true;
          playCaptureChunk(lane, { body: true, cmds: true });
          out = null; // frames from here on come from the capture
        } else {
          show(`${C.red}✖ step ${why} — no capture for this lane; lane labeled UNEXPECTED.${C.reset}`);
          lane.unexpected = true;
          process.exitCode = 1;
        }
      }
    } else if (!lane.onCapture && !cmdText && step.captureRef) {
      replayCapture(sc, lane, MOCK ? `real-only step in --mock mode` : `real-only step, real mode off`);
      if (lane.onCapture) {
        lane.capChunked = true;
        playCaptureChunk(lane, { body: true, cmds: true });
      }
    } else if (lane.onCapture && lane.capChunked && (step.realCmd ?? step.cmd)) {
      // Advance through the capture. Worker steps show their chunk; frame
      // steps show the recorded command whose decisive line becomes the frame.
      playCaptureChunk(lane, { body: isWorker, cmds: isWorker || Boolean(step.frame) });
    }

    if (step.frame) {
      let line: string | null = null;
      if (step.extract) {
        line = lane.onCapture && out === null ? frameFromCapture(lane, step) : matchExtract(step.extract, out ?? '');
      } else if (step.say) {
        line = firstLine(interp(step.say, lane));
      } else if (out) {
        line = firstLine(out);
      }
      if (line) emitFrame(side, step.frame, line);
      else {
        emitFrame(side, step.frame, 'UNEXPECTED — decisive line not found (full log in artifact)');
        lane.unexpected = true;
        process.exitCode = 1;
      }
    }
  }
  // Nothing recorded stays hidden: flush any capture tail no step claimed.
  while (lane.capChunked && lane.capPlayed < lane.capLines.length) playCaptureChunk(lane);
  show(`${C.dim}lane ${side} done.${C.reset}`);
}

function printEnd(sc: Scenario, sideBySide: boolean) {
  if (sideBySide) {
    blank();
    put(`${C.bold}▌ VERDICTS — side by side${C.reset}`);
    const width = Math.max(sc.lanes.left.label.length, sc.lanes.right.label.length);
    const paint = (v: string) => `${C.bold}${BAD.test(v) ? C.red : C.green}${v}${C.reset}`;
    show(`LEFT  — ${sc.lanes.left.label.padEnd(width)} │ ${paint(framesMem.left.VERDICT ?? '(no verdict)')}`);
    show(`RIGHT — ${sc.lanes.right.label.padEnd(width)} │ ${paint(framesMem.right.VERDICT ?? '(no verdict)')}`);
    show(`${C.dim}allowed causal difference: ${sc.allowedCausalDifference}${C.reset}`);
  }
  blank();
  put(`artifact: ${artDir}`);
  put(`replay: ${replayCommand(sc)}`);
}

// ── the battery's view: lane-specific steps against the declared difference ──
function describe(sc: Scenario) {
  const laneSteps = sc.steps.filter((s) => s.lane !== 'both');
  console.log(`${sc.id} — ${sc.title}`);
  console.log(`allowed causal difference: ${sc.allowedCausalDifference || '(none declared)'}`);
  console.log(`expected left verdict: ${sc.expectedVerdicts?.left || '(none declared)'}`);
  console.log(`expected right verdict: ${sc.expectedVerdicts?.right || '(none declared)'}`);
  console.log('causal difference:');
  for (const s of laneSteps) {
    const what = s.cmd ?? s.realCmd ?? s.mockCmd ?? (s.pause ? '(pause)' : (s.say ?? '(frame only)'));
    console.log(`  ${s.lane.padEnd(5)} ${what}`);
  }
  const pauseCount = sc.steps.filter((s) => s.pause).length;
  if (laneSteps.length > 0 && !sc.allowedCausalDifference) {
    console.error('describe: lane-specific steps exist with no allowedCausalDifference declared');
    process.exitCode = 1;
  }
  if (!sc.expectedVerdicts?.left || !sc.expectedVerdicts?.right) {
    console.error('describe: both expected verdict regexes are required');
    process.exitCode = 1;
  }
  if (pauseCount !== 1) {
    console.error(`describe: expected exactly one declared pause, found ${pauseCount}`);
    process.exitCode = 1;
  }
}

function assertArtifact(sc: Scenario, dir: string) {
  const file = join(resolve(dir), 'frames.txt');
  if (!existsSync(file)) fail(`no frames.txt in artifact '${dir}'`);
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  for (const side of ['left', 'right'] as LaneSide[]) {
    for (const frame of ['START', 'SURPRISE', 'CONTROL', 'VERDICT'] as FrameName[]) {
      const count = lines.filter((line) => line.startsWith(`${side} ${frame}`)).length;
      if (count !== 1) fail(`${side} must emit one ${frame} frame; found ${count}`);
    }
    const verdict = lines.find((line) => line.startsWith(`${side} VERDICT`)) ?? '';
    if (!new RegExp(sc.expectedVerdicts[side]).test(verdict))
      fail(`${side} verdict does not match /${sc.expectedVerdicts[side]}/: ${verdict}`);
  }
  if (!existsSync(join(resolve(dir), 'decision.txt'))) fail(`artifact has no decision.txt`);
  console.log(`artifact assertions: PASS ${sc.id}`);
}

const tmuxAvailable = () => !spawnSync('tmux', ['-V']).error;

function orchestrate(sc: Scenario) {
  const ses = `prove-it-live-${sc.id}`;
  const tmux = (...args: string[]) => spawnSync('tmux', args, { encoding: 'utf8' });
  tmux('kill-session', '-t', ses);
  tmux('new-session', '-d', '-s', ses, '-x', '240', '-y', '56');
  const flags = `${MOCK ? ' --mock' : ''}${CI ? ' --ci' : ''}`;
  const paneCmd = (side: LaneSide) =>
    `cd '${ROOT}'; clear; NODE_NO_WARNINGS=1 node live/runner.ts ${sc.id} --lane ${side}${flags} --artifact '${artDir}'`;
  tmux('send-keys', '-t', ses, paneCmd('left'), 'Enter');
  tmux('split-window', '-h', '-l', '50%', '-t', ses);
  tmux('send-keys', '-t', ses, paneCmd('right'), 'Enter');
  const pauseLane = sc.steps.find((step) => step.pause)?.lane;
  tmux('select-pane', '-t', `${ses}:0.${pauseLane === 'right' ? '1' : '0'}`);
  const attach = spawnSync('tmux', ['attach', '-t', ses], { stdio: 'inherit' });
  if (attach.status !== 0)
    console.log(
      `could not attach (no TTY). Session '${ses}' is running — attach with: tmux attach -t ${ses}`,
    );
}

async function main() {
  if (!id || id.startsWith('--'))
    fail('usage: node live/runner.ts <scenarioId> [--mock] [--seq] [--ci] [--lane left|right]');
  const sc = await loadScenario(id);
  const assertDir = opt('--assert-artifact');
  if (assertDir) return assertArtifact(sc, assertDir);
  if (has('--describe')) return describe(sc);
  if (LANE && LANE !== 'left' && LANE !== 'right') fail(`--lane must be left or right, not '${LANE}'`);

  if (LANE) {
    artDir = artifactDir(sc);
    seedArtifact(sc, artDir);
    await runLane(sc, LANE);
    printEnd(sc, false);
    return;
  }
  if (!seqMode && !tmuxAvailable()) {
    console.log('tmux not found — running the lanes sequentially (--seq) instead.');
    seqMode = true;
  }
  artDir = artifactDir(sc);
  seedArtifact(sc, artDir);
  if (seqMode) {
    await runLane(sc, 'left');
    await runLane(sc, 'right');
    printEnd(sc, true);
    return;
  }
  orchestrate(sc);
}

main();
