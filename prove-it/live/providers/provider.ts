// The provider boundary. An adapter owns provider-specific input and output
// and nothing else: it does not execute a tool, and it does not decide run
// state. Everything downstream of this file speaks canonical events.
//
// Two obligations every adapter carries:
//
//   Save every raw line before parsing it. A parser error must leave the
//   source line in the artifact, or the failure cannot be diagnosed.
//
//   Fail loudly. A missing binary or a bad stream stops the lane. There is no
//   automatic replay and no silent fallback.
import type { AgentInput, ConversationItem, ProviderEvent } from '../runtime/protocol.ts';

export interface ProviderSession {
  readonly provider: string;
  readonly sessionId: string;

  // A fresh process. `input.conversation` may already hold history: that is
  // how a post-crash restart hands the durable record to a new process.
  start(input: AgentInput): AsyncIterable<ProviderEvent>;

  // The next turn of the same process, carrying structured tool results.
  continue(input: ConversationItem[]): AsyncIterable<ProviderEvent>;

  stop(reason: string): Promise<void>;
}

export interface ProviderOptions {
  // Called with every raw line the provider emits, before it is parsed.
  raw(line: string): void;
  cwd: string;
  timeoutMs: number;
  model?: string;
}

// A terminal condition, not a lesson surprise. The message names the provider
// and the operator's next action.
export class ProviderUnavailable extends Error {
  readonly provider: string;
  readonly nextAction: string;
  constructor(provider: string, detail: string, nextAction: string) {
    super(`provider '${provider}' unavailable: ${detail}\nnext: ${nextAction}`);
    this.name = 'ProviderUnavailable';
    this.provider = provider;
    this.nextAction = nextAction;
  }
}
