// Append-only event log: the history is the truth; every view is derived.
// Each append is flushed to disk before the next action (recovery depends on it).
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  writeSync,
} from 'node:fs';

export type Actor = 'operator' | 'worker' | 'harness' | 'gate';

export interface Ev {
  id: number;
  run: string;
  ts: string;
  type: string;
  actor: Actor;
  data: Record<string, unknown>;
}

// A torn final record (crash mid-write) is dropped on read; everything durable
// before it survives. That is the recovery contract, not a silent repair.
export function readEvents(path: string): Ev[] {
  if (!existsSync(path)) return [];
  const out: Ev[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as Ev);
    } catch {
      console.error('events: dropped one torn final record (crash mid-write)');
    }
  }
  return out;
}

export class EventLog {
  private path: string;
  private run: string;
  private seq: number;

  constructor(path: string, run: string) {
    this.path = path;
    this.run = run;
    this.seq = readEvents(path).at(-1)?.id ?? 0;
  }

  append(type: string, actor: Actor, data: Record<string, unknown> = {}): Ev {
    const ev: Ev = {
      id: ++this.seq,
      run: this.run,
      ts: new Date().toISOString(),
      type,
      actor,
      data,
    };
    const fd = openSync(this.path, 'a');
    writeSync(fd, JSON.stringify(ev) + '\n');
    fsyncSync(fd); // durable before the next action
    closeSync(fd);
    return ev;
  }
}
