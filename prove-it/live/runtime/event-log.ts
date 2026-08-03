// Append, flush, read, subscribe. The same recovery contract as the student
// log in src/events.ts, with two additions the live runtime needs: a lane, and
// subscribers that fire only after the record is durable.
//
// Every append fsyncs before it returns. That is not caution, it is the whole
// mechanism: `tool.dispatched` has to be on disk before the side effect runs,
// or a crash leaves no trace that the world may have changed.
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { Actor, Lane, LiveEvent, LiveEventType } from './protocol.ts';

// A torn final record — the crash landed mid-write — is dropped on read.
// Everything durable before it survives. That is the contract, not a repair:
// the runtime must never invent the record it failed to finish.
export function readLiveEvents(path: string): LiveEvent[] {
  if (!existsSync(path)) return [];
  const out: LiveEvent[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as LiveEvent);
    } catch {
      // Same behavior as the starter: say so, drop it, keep going.
      console.error('live/events: dropped one torn final record (crash mid-write)');
    }
  }
  return out;
}

export type Subscriber = (event: LiveEvent) => void;

export class LiveEventLog {
  readonly path: string;
  readonly run: string;
  readonly lane: Lane;
  private seq: number;
  private subscribers: Subscriber[] = [];

  // Reopening an existing log continues its sequence. A lane resumed after a
  // crash therefore keeps one monotonic id space across processes.
  constructor(path: string, run: string, lane: Lane) {
    this.path = path;
    this.run = run;
    this.lane = lane;
    mkdirSync(dirname(path), { recursive: true });
    this.seq = readLiveEvents(path).at(-1)?.id ?? 0;
  }

  append(
    type: LiveEventType,
    actor: Actor,
    data: Record<string, unknown> = {},
  ): LiveEvent {
    const event: LiveEvent = {
      id: ++this.seq,
      run: this.run,
      lane: this.lane,
      ts: new Date().toISOString(),
      type,
      actor,
      data,
    };
    const fd = openSync(this.path, 'a');
    try {
      writeSync(fd, JSON.stringify(event) + '\n');
      fsyncSync(fd); // durable before anything else happens
    } finally {
      closeSync(fd);
    }
    // Subscribers run after the flush, so nothing on screen can describe a
    // fact the log does not hold.
    for (const fn of this.subscribers) fn(event);
    return event;
  }

  subscribe(fn: Subscriber): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== fn);
    };
  }

  // Re-read from disk rather than keep a memory copy: if the two could
  // disagree, the log is not the authority.
  events(): LiveEvent[] {
    return readLiveEvents(this.path);
  }
}

// The lesson split copies the shared prefix into each lane before the controls
// diverge, so every lane log is self-contained and reducible on its own. The
// id sequence continues from the prefix.
export function copyPrefix(fromPath: string, toPath: string): number {
  const events = readLiveEvents(fromPath);
  mkdirSync(dirname(toPath), { recursive: true });
  const fd = openSync(toPath, 'a');
  try {
    for (const event of events) writeSync(fd, JSON.stringify(event) + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return events.length;
}
