// The Codex CLI adapter. Same obligations as the Claude one: start a real
// process under harness conditions, and turn its stream into canonical events.
// Nothing downstream knows Codex exists.
//
// Codex's stream is item-shaped rather than message-shaped:
//
//   {"type":"thread.started","thread_id":"…"}
//   {"type":"item.completed","item":{"type":"agent_message","text":"…"}}
//   {"type":"turn.completed","usage":{…}}
//
// THIS LANE IS NOT CONTAINED. See CONFINEMENT.md next to this file.
//
// The lesson-breaking part is fixed: the gate's key no longer enters a worker's
// stage, so a receipt cannot be forged here. What remains is that Codex can
// read the machine outside its stage, and no adapter flag takes that away.
//
// Claude Code takes `--tools ""` and the harness becomes the agent's entire
// capability surface. Codex has no equivalent, and its MCP calls are cancelled
// without an approval mechanism — so the bridge only works under --yolo, which
// also drops Codex's own sandbox. Measured with the hostile prompt, a Codex
// worker read control/gate.key, listed outside the workspace, and ran `ls /`.
//
// The adapter is correct and the boundary holds. Use claude-cli in front of a
// room; use this one to prove the runtime is provider-neutral.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type {
  AgentInput,
  PresentationEvent,
  ProviderEvent,
} from '../runtime/protocol.ts';
import { ProviderUnavailable, type ProviderOptions, type ProviderSession } from './provider.ts';

export interface CodexOptions extends ProviderOptions {
  stage: string;
  bridgeSocket: string;
  mcpServerPath: string;
  model?: string;
}

const MCP_PREFIX = /^proveit__/;

export function codexCli(options: CodexOptions): ProviderSession {
  let child: ChildProcess | null = null;
  let sessionId = 'pending';

  return {
    provider: 'codex-cli',
    get sessionId() {
      return sessionId;
    },

    async *start(input: AgentInput): AsyncGenerator<ProviderEvent> {
      requireBinary();

      const prompt = promptFrom(input);
      options.raw(
        JSON.stringify({ type: 'harness.provider_input', system: input.system, prompt }),
      );

      // MCP servers are configuration, not flags. Values parse as TOML.
      const args = [
        'exec',
        '--json',
        '--skip-git-repo-check',
        // Kept alongside --yolo. It may or may not survive the override, and
        // it costs nothing to ask for the narrower policy.
        '-s',
        'read-only',
        // --yolo, because the harness is the policy layer: every tool it
        // exposes has already been through applyPolicy before it runs, and
        // Codex asking a second time has nobody to ask — an unanswered prompt
        // cancels the call. approval_policy="never" was not enough; the calls
        // still came back "user cancelled MCP tool call".
        //
        // The cost is real and is recorded here rather than buried: --yolo
        // also drops Codex's own sandbox, so this lane's containment rests
        // entirely on the owned temporary stage and on the harness owning
        // every tool. Claude's lane keeps both.
        '--yolo',
        '-c',
        `mcp_servers.proveit.command=${JSON.stringify(process.execPath)}`,
        '-c',
        `mcp_servers.proveit.args=[${JSON.stringify(options.mcpServerPath)}]`,
        '-c',
        `mcp_servers.proveit.env={PROVE_IT_BRIDGE_SOCKET=${JSON.stringify(options.bridgeSocket)}}`,
      ];
      if (options.model) args.push('-m', options.model);
      args.push(`${input.system}\n\n${prompt}`);

      child = spawn('codex', args, {
        cwd: options.stage,
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
          options.raw(line); // raw before parse, always
          if (!line.startsWith('{')) continue; // codex prints prose banners too

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
          code: `codex_exit_${code}`,
          detail: stderr.join('').trim().slice(0, 2000) || 'the process exited without a message',
        };
    },

    async *continue(): AsyncGenerator<ProviderEvent> {
      throw new Error('codex-cli runs its own turn loop; continue() is never called');
    },

    async stop() {
      stopTree(child);
      child = null;
    },
  };
}

function promptFrom(input: AgentInput): string {
  const parts: string[] = [];
  for (const item of input.conversation) {
    if (item.kind === 'brief') parts.push(item.text);
    else if (item.kind === 'operator') parts.push(`[operator] ${item.text}`);
    else if (item.kind === 'gate')
      parts.push(`[gate ${item.accepted ? 'accepted' : 'refused'}] ${item.text}`);
    else if (item.kind === 'agent' && item.text.trim()) parts.push(`[you previously said] ${item.text}`);
    else if (item.kind === 'tool_result')
      parts.push(`[result of ${item.tool}] ${JSON.stringify(item.result)}`);
  }
  return parts.join('\n\n');
}

// The whole Codex-specific surface of the runtime.
export function* normalize(event: any): Generator<ProviderEvent> {
  if (event.type === 'thread.started') {
    yield { type: 'session.started', sessionId: String(event.thread_id), model: 'codex' };
    return;
  }

  if (event.type === 'item.completed' && event.item) {
    const item = event.item;
    if (item.type === 'agent_message' && String(item.text ?? '').trim()) {
      yield { type: 'message.completed', message: { kind: 'agent', text: String(item.text), calls: [] } };
      return;
    }
    // Tool calls reach the harness through the MCP bridge, which is where they
    // are recorded and executed. Re-emitting them here would double-count.
    return;
  }

  if (event.type === 'turn.completed') {
    yield { type: 'turn.completed', stopReason: 'end_turn' };
    return;
  }

  if (event.type === 'turn.failed' || event.type === 'error') {
    yield {
      type: 'provider.failed',
      code: `codex_${event.type}`,
      detail: String(event.error?.message ?? event.message ?? 'the provider reported an error'),
    };
  }
}

// Display-only mapping, for the shipped renderer. Same contract as the Claude
// adapter: this file is the only place that knows what a Codex stream is.
export function presentCodexLine(raw: string): { events: PresentationEvent[] } | null {
  if (!raw.startsWith('{')) return null;
  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof event?.type !== 'string') return null;

  const events: PresentationEvent[] = [];
  if (event.type === 'thread.started')
    events.push({ kind: 'state', lines: ['Started the worker session'] });
  else if (event.type === 'item.completed' && event.item?.type === 'agent_message')
    events.push({ kind: 'agent', text: String(event.item.text ?? '') });
  else if (event.type === 'item.completed' && event.item?.type === 'mcp_tool_call')
    events.push({
      kind: 'tool',
      tool: String(event.item.tool ?? event.item.name ?? '').replace(MCP_PREFIX, ''),
      summary: '',
      args: {},
    });
  return { events };
}

function requireBinary(): void {
  const probe = spawnSync('codex', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0)
    throw new ProviderUnavailable(
      'codex-cli',
      "'codex' was not found on PATH",
      'install the Codex CLI, or run with --provider claude-cli',
    );
}

function stopTree(child: ChildProcess | null): void {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
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
