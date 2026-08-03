// The retained record of a live comparison. The screen is edited for
// comprehension; this is not. Raw provider output lands here before anything
// parses it, and full tool output lands here before anything summarizes it.
//
// One thing is edited: home paths and anything that looks like a credential
// are scrubbed on the way in. Those are not evidence, and an artifact that
// carries them cannot be shown or shared.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RUNTIME_VERSION, type Lane } from './protocol.ts';

const HOME = homedir();

const SECRETS: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{16,}/g, 'sk-«redacted»'],
  [/\b(Bearer)\s+[A-Za-z0-9._~+/-]{16,}=*/gi, '$1 «redacted»'],
  [/\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))=\S+/g, '$1=«redacted»'],
  [/("(?:api_?key|access_?token|refresh_?token|authorization)"\s*:\s*")[^"]+/gi, '$1«redacted»'],
];

// Applied to every byte this module writes. Cheap, and the alternative is an
// artifact nobody can hand to anyone.
export function sanitize(text: string): string {
  let out = HOME && HOME !== '/' ? text.split(HOME).join('~') : text;
  for (const [pattern, replacement] of SECRETS) out = out.replace(pattern, replacement);
  return out;
}

export interface ArtifactMeta {
  scenario: string;
  mode: string; // 'mock' | 'live' | 'capture'
  provider: string;
  startedAt: string;
  contractSha?: string | null;
  workspaceHash?: string | null;
  capture?: { provenance: string; path: string };
}

export interface ToolArtifactWriter {
  (kind: string, body: string): string;
}

export class LaneArtifacts {
  readonly lane: Lane;
  readonly dir: string;
  readonly eventsPath: string;
  private rawPath: string;
  private presentationPath: string;

  constructor(root: string, lane: Lane) {
    this.lane = lane;
    this.dir = join(root, lane);
    this.eventsPath = join(this.dir, 'events.jsonl');
    this.rawPath = join(this.dir, 'provider.raw.jsonl');
    this.presentationPath = join(this.dir, 'presentation.log');
    mkdirSync(join(this.dir, 'tools'), { recursive: true });
  }

  // Called by the adapter for every line the provider emits, before the line
  // is parsed. A parser error therefore always has its source line on disk.
  raw(line: string): void {
    appendFileSync(this.rawPath, sanitize(line.replace(/\n+$/, '')) + '\n');
  }

  present(line: string): void {
    appendFileSync(this.presentationPath, sanitize(line) + '\n');
  }

  // Arguments are written before dispatch so a crash mid-tool still leaves the
  // exact request an operator has to reconcile against.
  writeArgs(callId: string, args: Record<string, unknown>): string {
    return this.writeToolFile(callId, 'args.json', JSON.stringify(args, null, 2) + '\n');
  }

  writeResult(callId: string, result: unknown): string {
    return this.writeToolFile(callId, 'result.json', JSON.stringify(result, null, 2) + '\n');
  }

  // Handed to the tool bridge as ToolContext.writeArtifact.
  toolWriter(callId: string): ToolArtifactWriter {
    return (kind, body) => this.writeToolFile(callId, kind, body);
  }

  private writeToolFile(callId: string, kind: string, body: string): string {
    const name = `${callId}.${kind}`;
    writeFileSync(join(this.dir, 'tools', name), sanitize(body));
    // The reference on screen and in the event is relative to the artifact
    // root, so it stays valid wherever the directory is moved.
    return `${this.lane}/tools/${name}`;
  }
}

export class ArtifactSet {
  readonly dir: string;
  private manifest: Record<string, unknown>;
  private lanes = new Map<Lane, LaneArtifacts>();

  constructor(dir: string, meta: ArtifactMeta) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.manifest = {
      scenario: meta.scenario,
      runtime_version: RUNTIME_VERSION,
      mode: meta.mode,
      provider: meta.provider,
      model: null,
      provider_session_ids: [],
      contract_sha256: meta.contractSha ?? null,
      workspace_tree_start: meta.workspaceHash ?? null,
      started_at: meta.startedAt,
      stopped_at: null,
      ...(meta.capture ? { capture: meta.capture } : {}),
    };
    this.flushManifest();
  }

  lane(lane: Lane): LaneArtifacts {
    let existing = this.lanes.get(lane);
    if (!existing) {
      existing = new LaneArtifacts(this.dir, lane);
      this.lanes.set(lane, existing);
    }
    return existing;
  }

  // Merges, so the provider identity can land the moment the session starts
  // rather than at the end of a run that might not reach the end.
  updateManifest(patch: Record<string, unknown>): void {
    this.manifest = { ...this.manifest, ...patch };
    this.flushManifest();
  }

  noteSession(sessionId: string, model: string): void {
    const ids = (this.manifest.provider_session_ids as string[]) ?? [];
    if (!ids.includes(sessionId)) ids.push(sessionId);
    this.updateManifest({ provider_session_ids: ids, model });
  }

  writeDecision(text: string): void {
    writeFileSync(join(this.dir, 'decision.txt'), sanitize(text.trimEnd()) + '\n');
  }

  writeFrames(text: string): void {
    writeFileSync(join(this.dir, 'frames.txt'), sanitize(text.trimEnd()) + '\n');
  }

  close(stoppedAt: string): void {
    this.updateManifest({ stopped_at: stoppedAt });
  }

  private flushManifest(): void {
    writeFileSync(
      join(this.dir, 'manifest.json'),
      sanitize(JSON.stringify(this.manifest, null, 2)) + '\n',
    );
  }
}

// <root>/<scenario>-<timestamp>/. The root is normally live/artifacts/, which
// is git-ignored and excluded from the course site build — but it is a
// parameter so a rehearsal can put its evidence somewhere disposable instead
// of in the checkout.
export function artifactDir(artifactsRoot: string, scenario: string, at: Date): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-').replace('Z', '');
  return join(artifactsRoot, `${scenario}-${stamp}`);
}
