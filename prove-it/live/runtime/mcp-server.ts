// A harness-owned MCP server, spoken over stdio, with no dependencies.
//
// It is deliberately stupid. It holds no tool catalog, no policy, and no
// executor: it forwards every request to the engine over a unix socket and
// relays the answer. Everything that decides anything lives in the engine
// process, which is the only writer of the durable log.
//
// The provider spawns this. It never sees the stage, the event log, or the
// checkout.
//
//   PROVE_IT_BRIDGE_SOCKET   required; the engine's tool bridge
import { connect, type Socket } from 'node:net';
import { createInterface } from 'node:readline';

const SOCKET = process.env.PROVE_IT_BRIDGE_SOCKET;
const SERVER_NAME = 'proveit';
// Echoed back to the client when it asks for something we understand; MCP
// clients negotiate, and disagreeing about a date is not worth a failure.
const FALLBACK_PROTOCOL = '2025-06-18';

if (!SOCKET) {
  process.stderr.write('mcp-server: PROVE_IT_BRIDGE_SOCKET is not set\n');
  process.exit(1);
}

let socket: Socket;
let nextId = 0;
const waiting = new Map<number, (value: any) => void>();

function connectBridge(): Promise<void> {
  return new Promise((resolve, reject) => {
    socket = connect(SOCKET as string);
    socket.on('connect', () => resolve());
    socket.on('error', reject);
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let cut = buffer.indexOf('\n');
      while (cut >= 0) {
        const line = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 1);
        cut = buffer.indexOf('\n');
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        waiting.get(message.id)?.(message);
        waiting.delete(message.id);
      }
    });
  });
}

function ask(payload: Record<string, unknown>): Promise<any> {
  const id = ++nextId;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    socket.write(JSON.stringify({ ...payload, id }) + '\n');
  });
}

function send(message: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(message) + '\n');
}

const reply = (id: unknown, result: unknown) => send({ jsonrpc: '2.0', id, result });

async function handle(request: any): Promise<void> {
  switch (request.method) {
    case 'initialize':
      reply(request.id, {
        protocolVersion: request.params?.protocolVersion ?? FALLBACK_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: '1.0.0' },
      });
      return;

    // Notifications carry no id and take no response.
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;

    case 'tools/list': {
      const { tools } = await ask({ op: 'list' });
      reply(request.id, {
        tools: (tools ?? []).map((tool: any) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.schema,
        })),
      });
      return;
    }

    case 'tools/call': {
      const { result } = await ask({
        op: 'call',
        tool: request.params?.name,
        args: request.params?.arguments ?? {},
        callId: request.params?._meta?.['claudecode/toolUseId'] ?? `mcp-${request.id}`,
      });
      // A refusal is a result the agent must read and act on, not a protocol
      // error. Only 'failed' is surfaced as an MCP error.
      reply(request.id, {
        content: [{ type: 'text', text: renderForAgent(result) }],
        isError: result?.status === 'failed',
      });
      return;
    }

    default:
      if (request.id !== undefined)
        send({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: `method not found: ${request.method}` },
        });
  }
}

// What the agent actually reads. The status leads, because the distinction
// between refused, failed, pending, and in_doubt is the lesson.
function renderForAgent(result: any): string {
  if (!result) return 'the harness returned no result';
  const head = `[${result.status}]`;
  if (result.status === 'refused') return `${head} ${result.policy}\nnext: ${result.next}`;
  if (result.status === 'pending') return `${head} ${result.summary} (approval ${result.approvalId})`;
  if (result.status === 'in_doubt') return `${head} ${result.summary}\n${result.reconcile}`;
  return `${head} ${result.summary}`;
}

await connectBridge();

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  try {
    void handle(JSON.parse(line));
  } catch (error) {
    process.stderr.write(`mcp-server: ${String(error)}\n`);
  }
});
