// Frame synchronization between panes.
//
// A comparison only teaches anything if both lanes are showing the same moment.
// Each scenario keeps four named evidence frames — START, SURPRISE, CONTROL,
// VERDICT — and a lane that reaches one waits for its peer before going on.
//
// The panes are separate processes that share only their artifact directory,
// so that directory is the rendezvous. No sockets, no ports, no daemon: a lane
// arriving writes a file, and a lane waiting watches for one.
//
// Two rules keep a pane from hanging in front of a room:
//
//   Every wait has a deadline.
//   A lane that stops releases its peer with a terminal error, rather than
//   leaving it to discover the silence when the deadline expires.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type BarrierSide = 'left' | 'right';

export type BarrierOutcome =
  | 'synced' // the peer reached the same frame
  | 'alone' // no peer was ever expected (sequential or single-lane run)
  | 'peer_failed' // the peer stopped; carry on and show why
  | 'timeout'; // the peer never arrived and never said why

const DEFAULT_TIMEOUT_MS = 600_000;
const POLL_MS = 100;

function barrierDir(artifactDir: string): string {
  return join(artifactDir, 'barriers');
}

// Called by the parent before it launches the panes. Without this file a lane
// knows it is running alone and never waits for anybody.
export function armBarriers(artifactDir: string, sides: BarrierSide[]): void {
  const dir = barrierDir(artifactDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'expected'), sides.join(',') + '\n');
}

export function expectedSides(artifactDir: string): BarrierSide[] {
  const file = join(barrierDir(artifactDir), 'expected');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .trim()
    .split(',')
    .filter(Boolean) as BarrierSide[];
}

// A lane that is ending badly says so, so its peer stops waiting immediately
// instead of standing at a barrier until the deadline.
export function releasePeer(artifactDir: string, side: BarrierSide, reason: string): void {
  const dir = barrierDir(artifactDir);
  if (!existsSync(dir)) return;
  writeFileSync(join(dir, `${side}.terminal`), reason + '\n');
}

export function terminalReason(artifactDir: string, side: BarrierSide): string | null {
  const file = join(barrierDir(artifactDir), `${side}.terminal`);
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
}

export interface BarrierResult {
  outcome: BarrierOutcome;
  detail: string;
  waitedMs: number;
}

// ---------------------------------------------------------------------------
// One-sided checkpoints
// ---------------------------------------------------------------------------
//
// A frame barrier is symmetric: both lanes arrive and both go on. A checkpoint
// is not. One lane does a piece of work that both lanes need — the shared agent
// prefix — and the other waits for it without doing it twice.
//
// This is what keeps the comparison honest. Two lanes that each start their own
// agent are comparing two agents; the lesson control has to be the only thing
// that differs, which means the history before it has to be one history.

export function signalCheckpoint(artifactDir: string, name: string): void {
  const dir = barrierDir(artifactDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `checkpoint.${name}`), new Date().toISOString() + '\n');
}

export function checkpointReached(artifactDir: string, name: string): boolean {
  return existsSync(join(barrierDir(artifactDir), `checkpoint.${name}`));
}

// Waits for the lane that owns the checkpoint. A lane running alone must not
// block on a checkpoint nobody else is going to reach.
export async function awaitCheckpoint(
  artifactDir: string,
  side: BarrierSide,
  name: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  now: () => number = Date.now,
): Promise<BarrierResult> {
  const peer = expectedSides(artifactDir).find((s) => s !== side);
  if (!peer) return { outcome: 'alone', detail: 'no peer lane in this run', waitedMs: 0 };

  const started = now();
  while (true) {
    if (checkpointReached(artifactDir, name))
      return { outcome: 'synced', detail: `${name} is ready`, waitedMs: now() - started };

    const stopped = terminalReason(artifactDir, peer);
    if (stopped)
      return {
        outcome: 'peer_failed',
        detail: `the ${peer} lane stopped before ${name}: ${stopped}`,
        waitedMs: now() - started,
      };

    if (now() - started >= timeoutMs)
      return {
        outcome: 'timeout',
        detail: `${name} was not ready within ${Math.round(timeoutMs / 1000)}s`,
        waitedMs: now() - started,
      };

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

// Report arrival, then wait for the peer to report the same frame.
export async function waitAtFrame(
  artifactDir: string,
  side: BarrierSide,
  frame: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  now: () => number = Date.now,
): Promise<BarrierResult> {
  const sides = expectedSides(artifactDir);
  const peer = sides.find((s) => s !== side);
  if (!peer) return { outcome: 'alone', detail: 'no peer lane in this run', waitedMs: 0 };

  const dir = barrierDir(artifactDir);
  mkdirSync(dir, { recursive: true });
  // Arrival is recorded before the wait: a peer already waiting must be able to
  // see this lane the instant it looks.
  writeFileSync(join(dir, `${frame}.${side}`), new Date().toISOString() + '\n');

  const started = now();
  const peerFrame = join(dir, `${frame}.${peer}`);

  while (true) {
    if (existsSync(peerFrame))
      return { outcome: 'synced', detail: `${peer} reached ${frame}`, waitedMs: now() - started };

    const stopped = terminalReason(artifactDir, peer);
    if (stopped)
      return {
        outcome: 'peer_failed',
        detail: `the ${peer} lane stopped: ${stopped}`,
        waitedMs: now() - started,
      };

    if (now() - started >= timeoutMs)
      return {
        outcome: 'timeout',
        detail: `the ${peer} lane did not reach ${frame} within ${Math.round(timeoutMs / 1000)}s`,
        waitedMs: now() - started,
      };

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
