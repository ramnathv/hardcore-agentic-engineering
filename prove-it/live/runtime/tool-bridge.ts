// The harness side of the tool boundary, exposed over a unix socket.
//
// A real provider spawns its own MCP process, so the tool server cannot live
// inside the engine. But the engine must stay the only writer of the durable
// log — two processes appending to one event file is a race, and a race in the
// log is a lie about what happened.
//
// So the MCP process holds no policy and no executor. It forwards, and this
// file — inside the engine process — does the work and records it:
//
//   mcp-server.ts (spawned by the provider) --socket--> here --> policy,
//   dispatch, execute, result, artifact, event.
//
// The provider drives the conversation. The harness still owns every effect.
import { createServer, type Server, type Socket } from 'node:net';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LaneArtifacts } from './artifacts.ts';
import type { LiveEventLog } from './event-log.ts';
import type { PresentationEvent, ToolRequest } from './protocol.ts';
import { handleTool } from './engine.ts';
import { toolSpecs } from './tool-catalog.ts';

export interface BridgeOptions {
  stage: string;
  repoRoot: string;
  checkCommand: string;
  checkExpectedExit: number;
  // The subset of the catalog this lane may use. Absent means all of it.
  allowed?: string[];
  // Stage-relative paths outside this lane's view. See ToolContext.hidden.
  hidden?: string[];
  log: LiveEventLog;
  laneArtifacts: LaneArtifacts;
  present(event: PresentationEvent): void;
  onInterrupt?(): void;
}

export interface ToolBridge {
  socketPath: string;
  calls: number;
  interrupted: boolean;
  close(): Promise<void>;
}

// Unix socket paths have a hard length limit (~104 bytes on macOS), which a
// long temp path plus a nested name will blow past. The stage root is short
// enough, and the socket belongs with the world it guards.
export function socketPathFor(stage: string): string {
  return join(stage, 'bridge.sock');
}

export function startToolBridge(options: BridgeOptions): ToolBridge {
  const socketPath = socketPathFor(options.stage);
  if (existsSync(socketPath)) unlinkSync(socketPath);

  const bridge: ToolBridge = {
    socketPath,
    calls: 0,
    interrupted: false,
    close: () => Promise.resolve(),
  };

  const onConnection = (socket: Socket): void => {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let cut = buffer.indexOf('\n');
      while (cut >= 0) {
        const line = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 1);
        if (line.trim()) respond(socket, line, options, bridge);
        cut = buffer.indexOf('\n');
      }
    });
    // A provider that dies mid-tool drops the connection. The durable log
    // already holds the dispatch, so the pending state survives regardless.
    socket.on('error', () => {});
  };

  const server: Server = createServer(onConnection);
  server.listen(socketPath);
  server.on('error', (error) => {
    options.present({ kind: 'error', code: 'tool_bridge', detail: String(error) });
  });

  bridge.close = () =>
    new Promise((resolve) => {
      server.close(() => {
        if (existsSync(socketPath)) unlinkSync(socketPath);
        resolve();
      });
    });

  return bridge;
}

function respond(socket: Socket, line: string, options: BridgeOptions, bridge: ToolBridge): void {
  let message: { id?: unknown; op?: string; tool?: string; args?: unknown; callId?: string };
  try {
    message = JSON.parse(line);
  } catch {
    socket.write(JSON.stringify({ error: 'unparseable bridge request' }) + '\n');
    return;
  }

  if (message.op === 'list') {
    socket.write(JSON.stringify({ id: message.id, tools: toolSpecs(options.allowed) }) + '\n');
    return;
  }

  // The provider's own call id is kept: it is what binds a pending action back
  // to the conversation the provider will be restarted with.
  const request: ToolRequest = {
    callId: String(message.callId ?? `call-${bridge.calls + 1}`),
    tool: String(message.tool ?? ''),
    args: (message.args ?? {}) as Record<string, unknown>,
  };
  bridge.calls += 1;

  const result = handleTool(request, bridge.calls, {
    stage: options.stage,
    repoRoot: options.repoRoot,
    checkCommand: options.checkCommand,
    checkExpectedExit: options.checkExpectedExit,
    allowed: options.allowed,
    hidden: options.hidden,
    log: options.log,
    laneArtifacts: options.laneArtifacts,
    present: options.present,
    interrupted: bridge.interrupted,
    onInterrupt: () => {
      bridge.interrupted = true;
      options.onInterrupt?.();
    },
  });

  socket.write(JSON.stringify({ id: message.id, result }) + '\n');
}
