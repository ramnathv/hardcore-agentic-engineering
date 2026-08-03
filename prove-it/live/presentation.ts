// Pure presentation helpers for the live compare UI. The runner owns execution
// and evidence. This module owns only the short text that reaches the screen.
import type { PresentationEvent } from './runtime/protocol.ts';

const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

export function cleanInlineMarkdown(text: string): string {
  return stripAnsi(text)
    .replace(/^#{1,6}\s+/, '')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fitToken(token: string, width: number): string {
  if (token.length <= width) return token;
  if (width < 9) return token.slice(0, Math.max(1, width - 1)) + '…';
  const left = Math.ceil((width - 1) * 0.58);
  const right = width - left - 1;
  return `${token.slice(0, left)}…${token.slice(-right)}`;
}

export function wrapText(text: string, width: number): string[] {
  const safeWidth = Math.max(12, width);
  const lines: string[] = [];
  for (const sourceLine of stripAnsi(text).split('\n')) {
    const paragraph = cleanInlineMarkdown(sourceLine);
    if (!paragraph) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const sourceWord of paragraph.split(/\s+/)) {
      const word = fitToken(sourceWord, safeWidth);
      if (line && `${line} ${word}`.length > safeWidth) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export interface InputBlock {
  label?: string;
  text: string;
}

export function inputBlocks(text: string): InputBlock[] {
  return stripAnsi(text)
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const match = line.match(/^([A-Za-z][A-Za-z0-9 _-]{0,23}):\s+(.+)$/);
      if (!match) return { text: cleanInlineMarkdown(line) };
      return {
        label: match[1].replaceAll('-', ' ').toUpperCase(),
        text: cleanInlineMarkdown(match[2]),
      };
    });
}

function commandTarget(command: string): string {
  return cleanInlineMarkdown(command).replace(/^['"]|['"]$/g, '');
}

export function summarizeCommand(command: string): string {
  const cmd = commandTarget(command);
  if (/^case\b/.test(cmd)) return 'Classified the room answer';
  if (/\bclaude\b/.test(cmd)) return 'Started a fresh Claude worker';
  if (/forge-receipt/.test(cmd)) return 'Tried a forged receipt';
  if (/head\s+-n\s+\d+\s+control\/receipts/.test(cmd)) return 'Read the signed receipt';
  if (/done\/contract\.yaml/.test(cmd) && /echo\b/.test(cmd))
    return 'Changed the contract after the run opened';
  if (/node\s+control\/dr-gate\.ts\s+check\b/.test(cmd)) return 'Ran the gate check';
  if (/node\s+control\/dr-gate\.ts\s+verify\b/.test(cmd)) return 'Verified the gate receipt';
  if (/node\s+src\/loop\.ts\s+run\b/.test(cmd)) return 'Opened a harness run';
  if (/node\s+src\/loop\.ts\s+open\b/.test(cmd)) return 'Opened a contract-bound run';
  if (/node\s+src\/loop\.ts\s+view\b/.test(cmd)) return 'Read the run state';
  if (/node\s+src\/loop\.ts\s+resume\b/.test(cmd)) return 'Resumed the run';
  if (/node\s+src\/loop\.ts\s+complete\b/.test(cmd)) return 'Requested completion';
  if (/node\s+--test\b/.test(cmd)) return 'Ran the named check';
  const shellScript = cmd.match(/\bbash\s+([^\s;&|]+)/)?.[1];
  if (shellScript) return `Ran ${shellScript.split('/').pop()}`;
  const nodeScript = cmd.match(/\bnode\s+([^\s;&|]+)/)?.[1];
  if (nodeScript) return `Ran ${nodeScript.split('/').pop()}`;
  return `Ran ${fitToken(cmd, 72)}`;
}

export function summarizeTool(name: string, argument: string): string {
  const normalized = name.toLowerCase().replaceAll('-', '_');
  const target = cleanInlineMarkdown(argument);
  if (/^(read|read_file|readfile)$/.test(normalized)) return target ? `Read ${target}` : 'Read a file';
  if (/^(write|write_file|edit|replace)$/.test(normalized))
    return target ? `Updated ${target}` : 'Updated a file';
  if (/^(run_check|test)$/.test(normalized)) return 'Ran the named check';
  if (/^(bash|shell|exec|run)$/.test(normalized)) return target ? summarizeCommand(target) : 'Ran a command';
  const action = name.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return target ? `${action}: ${target}` : action;
}

// ---------------------------------------------------------------------------
// The one renderer
// ---------------------------------------------------------------------------

// Every surface draws from normalized events and nothing else. No provider
// shape reaches this function: if it ever needs to know which agent produced
// something, an adapter has stopped doing its job.
//
// Two styles, because two surfaces. 'glyph' is the projected two-pane
// transcript the battery asserts against. 'block' is the labelled grammar the
// operator CLI uses, where there is room to breathe.
export interface RenderOptions {
  style?: 'glyph' | 'block';
  details?: boolean;
  width?: number;
}

const PROSE_LINES_ON_SCREEN = 3; // the rest is in the artifact

export function renderPresentationEvent(
  event: PresentationEvent,
  options: RenderOptions = {},
): string[] {
  const width = options.width ?? 96;
  const details = options.details === true;
  const block = options.style === 'block';
  const prose = (text: string) => {
    const lines = wrapText(text, width - 2).filter(Boolean);
    // --details changes how much of the record reaches the screen. It never
    // changes the record.
    return details ? lines : lines.slice(0, PROSE_LINES_ON_SCREEN);
  };

  switch (event.kind) {
    case 'agent': {
      const lines = prose(event.text);
      return block ? ['AGENT', ...lines] : lines.map((line) => `● ${line}`);
    }
    case 'tool': {
      const head = summarizeTool(event.tool, event.summary);
      const extra = details ? wrapText(JSON.stringify(event.args), width - 2) : [];
      return block ? ['TOOL', head, ...extra] : [`⏺ ${head}`, ...extra.map((l) => `  ${l}`)];
    }
    case 'tool.result': {
      const mark = { ok: '✓', failed: '✗', refused: '⊘', in_doubt: '?', pending: '…' }[event.status];
      const lines = prose(event.line);
      const reference = event.artifact && details ? [`  full record: ${event.artifact}`] : [];
      if (block)
        return [...lines.map((line, i) => `${i === 0 ? mark : ' '} ${line}`), ...reference];
      return [`⎿ ${mark} ${lines.join(' ')}`, ...reference];
    }
    case 'state': {
      const lines = event.lines.flatMap((line) => wrapText(line, width - 2));
      return block ? ['STATE', ...lines] : lines.map((line) => `◆ ${line}`);
    }
    case 'error': {
      const lines = wrapText(`${event.code}: ${event.detail}`, width - 2);
      return block ? ['ERROR', ...lines] : lines.map((line) => `✖ ${line}`);
    }
  }
}

export function evidenceForScreen(line: string): string {
  const clean = cleanInlineMarkdown(line);
  const field = clean.match(/^"([A-Za-z_]+)"\s*:\s*"([^"]+)"[,]?$/);
  if (field) {
    const label = field[1].replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    return `${label}: ${field[2]}`;
  }
  if (!clean.startsWith('{')) return clean;
  try {
    const value = JSON.parse(clean) as Record<string, unknown>;
    const fields: string[] = [];
    if (typeof value.type === 'string') fields.push(`Event: ${value.type}`);
    if (typeof value.status === 'string') fields.push(`Status: ${value.status}`);
    if (typeof value.reason === 'string') fields.push(`Reason: ${value.reason}`);
    if (typeof value.check === 'string') fields.push(`Check: ${value.check}`);
    if (typeof value.actor === 'string') fields.push(`Actor: ${value.actor}`);
    if (value.data && typeof value.data === 'object') {
      const data = value.data as Record<string, unknown>;
      if (typeof data.fact === 'string') fields.push(`Fact: ${data.fact}`);
    }
    return fields.length ? fields.join(' · ') : clean;
  } catch {
    return clean;
  }
}
