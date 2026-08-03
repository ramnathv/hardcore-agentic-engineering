// The Claude CLI adapter. It owns exactly two things: how to start a real
// `claude` process under harness conditions, and how to turn its stream into
// canonical events. Nothing downstream of this file knows Claude exists.
//
// Harness conditions, and why each one is not optional:
//
//   --tools ""             no built-in file, shell, or network tools. The
//                          harness supplies every capability or the agent has
//                          none.
//   --mcp-config           the harness tool server, and
//   --strict-mcp-config    only that one — the operator's own MCP servers must
//                          not be in the room.
//   --setting-sources ""   no user, project, or local settings, so no hooks and
//                          no CLAUDE.md. A lesson that depends on the
//                          instructor's laptop is not a lesson. (--safe-mode
//                          would also do this, but it disables MCP servers —
//                          including the harness's own, which leaves the agent
//                          with no tools at all.)
//   --disable-slash-commands  no skills.
//   --permission-mode      bypassPermissions: there is no human at this
//                          keyboard, and policy lives in the harness anyway.
//
// One honest difference from the smoke path: Claude Code runs its own turn
// loop, so `continue()` is never called. The harness still executes every
// tool, through the MCP bridge, and still owns the durable record.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AgentInput,
  ConversationItem,
  PresentationEvent,
  ProviderEvent,
} from '../runtime/protocol.ts';
import { ProviderUnavailable, type ProviderOptions, type ProviderSession } from './provider.ts';

export interface ClaudeOptions extends ProviderOptions {
  stage: string;
  bridgeSocket: string;
  mcpServerPath: string;
  model: string;
  effort?: string;
  // A JSON Schema the provider must answer with. Used where a lesson needs a
  // decision it can read as data — promote, reject, or revise — rather than a
  // verdict parsed out of prose.
  outputSchema?: string;
}

// The MCP tool names Claude reports are namespaced by server. The harness
// knows its tools by their plain names.
const MCP_PREFIX = /^mcp__proveit__/;

export function claudeCli(options: ClaudeOptions): ProviderSession {
  let child: ChildProcess | null = null;
  let sessionId = 'pending';

  return {
    provider: 'claude-cli',
    get sessionId() {
      return sessionId;
    },

    async *start(input: AgentInput): AsyncGenerator<ProviderEvent> {
      requireBinary();

      const configPath = join(options.stage, 'mcp-config.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            proveit: {
              command: process.execPath,
              args: [options.mcpServerPath],
              env: { PROVE_IT_BRIDGE_SOCKET: options.bridgeSocket, NODE_NO_WARNINGS: '1' },
            },
          },
        }),
      );

      const prompt = promptFrom(input);
      // The exact input this process was started with, recorded before it runs.
      // The raw stream is otherwise output-only, and "did the agent actually
      // receive the correction" is a question the artifact has to be able to
      // answer — for S2 it IS the evidence.
      options.raw(
        JSON.stringify({ type: 'harness.provider_input', system: input.system, prompt }),
      );

      const args = [
        '-p',
        prompt,
        '--model',
        options.model,
        '--system-prompt',
        input.system,
        '--tools',
        '',
        '--mcp-config',
        configPath,
        '--strict-mcp-config',
        '--setting-sources',
        '',
        '--disable-slash-commands',
        '--permission-mode',
        'bypassPermissions',
        '--output-format',
        'stream-json',
        '--verbose',
      ];
      if (options.effort) args.push('--effort', options.effort);
      if (options.outputSchema) args.push('--json-schema', options.outputSchema);

      child = spawn('claude', args, {
        cwd: options.stage,
        // Its own process group, so a timeout can take the whole tree down.
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      });

      const stderr: string[] = [];
      child.stderr?.on('data', (chunk) => {
        const text = String(chunk);
        options.raw(`{"stderr":${JSON.stringify(text)}}`);
        stderr.push(text);
      });

      const deadline = setTimeout(() => stopTree(child), options.timeoutMs);

      try {
        for await (const line of createInterface({ input: child.stdout! })) {
          if (!line.trim()) continue;
          // Raw first, always. A line that fails to parse must still be on
          // disk, or the parser bug is undiagnosable.
          options.raw(line);

          let event: any;
          try {
            event = JSON.parse(line);
          } catch (error) {
            yield {
              type: 'provider.failed',
              code: 'unparseable_stream_line',
              detail: `${String(error)} · the line is preserved in provider.raw.jsonl`,
            };
            return;
          }

          for (const normalized of normalize(event)) {
            if (normalized.type === 'session.started') sessionId = normalized.sessionId;
            yield normalized;
          }
        }
      } finally {
        clearTimeout(deadline);
      }

      const code = await exitOf(child);
      if (code !== 0)
        yield {
          type: 'provider.failed',
          code: `claude_exit_${code}`,
          detail: stderr.join('').trim().slice(0, 2000) || 'the process exited without a message',
        };
    },

    async *continue(): AsyncGenerator<ProviderEvent> {
      // Claude Code owns its own turn loop. Reaching here means the engine is
      // driving a provider that drives itself, which is a wiring bug, not a
      // runtime condition to paper over.
      throw new Error('claude-cli runs its own turn loop; continue() is never called');
    },

    async stop() {
      stopTree(child);
      child = null;
    },
  };
}

// The first user message. The canonical conversation carries the brief and
// any prior history; a restart replays it as readable text, because the CLI
// takes a prompt rather than a message list.
function promptFrom(input: AgentInput): string {
  const parts: string[] = [];
  for (const item of input.conversation) {
    if (item.kind === 'brief') parts.push(item.text);
    else if (item.kind === 'operator') parts.push(`[operator] ${item.text}`);
    else if (item.kind === 'gate') parts.push(`[gate ${item.accepted ? 'accepted' : 'refused'}] ${item.text}`);
    else if (item.kind === 'agent' && item.text.trim()) parts.push(`[you previously said] ${item.text}`);
    else if (item.kind === 'tool_result')
      parts.push(`[result of ${item.tool}] ${JSON.stringify(item.result)}`);
  }
  return parts.join('\n\n');
}

// Exported so the parser can be tested against recorded streams without
// starting a provider. This function is the entire Claude-specific surface of
// the runtime: if a test needs anything else to check the mapping, something
// provider-shaped has leaked past this file.
export function* normalize(event: any): Generator<ProviderEvent> {
  if (event.type === 'system' && event.subtype === 'init') {
    yield { type: 'session.started', sessionId: event.session_id, model: event.model };
    return;
  }

  if (event.type === 'assistant' && event.message) {
    const content = (event.message.content ?? []) as any[];
    const text = content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    const calls = content
      .filter((block) => block.type === 'tool_use')
      .map((block) => ({
        callId: String(block.id),
        tool: String(block.name).replace(MCP_PREFIX, ''),
        args: (block.input ?? {}) as Record<string, unknown>,
      }));

    if (text || calls.length) {
      const message: ConversationItem = { kind: 'agent', text, calls };
      yield { type: 'message.completed', message };
    }
    // The harness records and executes tool calls through the MCP bridge, so
    // they are not re-emitted here. Emitting them would double-count every
    // call in the durable log.
    return;
  }

  if (event.type === 'result') {
    if (event.is_error || event.subtype !== 'success') {
      yield {
        type: 'provider.failed',
        code: `claude_${event.subtype ?? 'error'}`,
        detail: String(event.result ?? event.api_error_status ?? 'the provider reported an error'),
      };
      return;
    }
    yield { type: 'turn.completed', stopReason: String(event.stop_reason ?? 'end_turn') };
    return;
  }

  // user (tool_result echoes), rate_limit_event, hook chatter: the harness
  // already holds the authoritative version of all of it.
}

// ---------------------------------------------------------------------------
// Display-only parsing
// ---------------------------------------------------------------------------

// The shipped runner drives `claude -p` directly, so Claude executes its own
// tools there and its tool_result lines are the only record of what happened.
// normalize() drops those on purpose — inside the live runtime the harness
// holds the authoritative version — so screen rendering needs its own mapping.
//
// It lives here, not in the renderer, for one reason: this file is the only
// place allowed to know what a Claude stream looks like.
export interface ClaudePresentation {
  events: PresentationEvent[];
  // Text too long for the screen that still belongs in the lane's record.
  artifact?: string;
}

// Returns null when the line is not a provider event at all — plain worker
// output the caller should print as-is.
export function presentClaudeLine(raw: string): ClaudePresentation | null {
  if (!raw.startsWith('{')) return null;
  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof event?.type !== 'string') return null;

  const events: PresentationEvent[] = [];

  if (event.type === 'system' && event.subtype === 'init') {
    events.push({ kind: 'state', lines: ['Started the worker session'] });
    return { events };
  }

  if (event.type === 'assistant' && event.message?.content) {
    for (const block of event.message.content) {
      if (block.type === 'text' && block.text?.trim())
        events.push({ kind: 'agent', text: String(block.text) });
      else if (block.type === 'tool_use')
        events.push({
          kind: 'tool',
          tool: String(block.name).replace(MCP_PREFIX, ''),
          summary: summarizeToolInput(block.input),
          args: (block.input ?? {}) as Record<string, unknown>,
        });
    }
    return { events };
  }

  if (event.type === 'user' && event.message?.content) {
    for (const block of event.message.content) {
      if (block.type !== 'tool_result') continue;
      const body = Array.isArray(block.content)
        ? block.content.map((part: any) => part.text ?? '').join(' ')
        : (block.content ?? '');
      const first = String(body).trim().split('\n')[0];
      if (first)
        events.push({
          kind: 'tool.result',
          tool: '',
          status: block.is_error ? 'failed' : 'ok',
          line: first,
        });
    }
    return { events };
  }

  if (event.type === 'result')
    // The complete final answer is retained; the stream already showed its head.
    return {
      events: [],
      artifact:
        typeof event.result === 'string' && event.result.trim()
          ? `--- final answer (full text) ---\n${event.result.trim()}`
          : undefined,
    };

  return { events };
}

// The structured answer a run was required to give, recovered from its own raw
// stream. Reading it back from the artifact rather than holding it in memory
// keeps one rule intact: what the room is shown is what the evidence holds.
export function structuredDecision(rawLines: string[]): Record<string, unknown> | null {
  for (const line of rawLines) {
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== 'assistant') continue;
    for (const block of event.message?.content ?? [])
      if (block.type === 'tool_use' && block.name === 'StructuredOutput')
        return block.input as Record<string, unknown>;
  }
  return null;
}

// Claude's built-in tools name their target differently from the harness's.
// One place knows all of them.
function summarizeToolInput(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const o = input as Record<string, unknown>;
  if (o.file_path) return String(o.file_path).split('/').pop() ?? '';
  if (o.path) return String(o.path);
  if (o.command) return String(o.command).split('\n')[0].slice(0, 60);
  if (o.pattern) return String(o.pattern);
  const encoded = JSON.stringify(o);
  return encoded.length > 60 ? encoded.slice(0, 60) + '…' : encoded;
}

function requireBinary(): void {
  const probe = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0)
    throw new ProviderUnavailable(
      'claude-cli',
      "'claude' was not found on PATH",
      'install Claude Code, or run with --provider smoke for the keyless path',
    );
}

function stopTree(child: ChildProcess | null): void {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGKILL'); // the whole group, not just the parent
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
}

function exitOf(child: ChildProcess | null): Promise<number> {
  if (!child) return Promise.resolve(0);
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => child.once('close', (code) => resolve(code ?? 0)));
}
