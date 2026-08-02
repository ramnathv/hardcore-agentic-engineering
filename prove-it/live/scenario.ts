// Shared declaration types for live compare scenarios. A scenario is a
// declaration, not a program: if it needs code beyond these fields, that code
// belongs in the runner or in an existing session fixture, never here.

export type LaneSide = 'left' | 'right';

export type FrameName = 'START' | 'SURPRISE' | 'CONTROL' | 'VERDICT';

export interface PauseSpec {
  question: string;
  kind: 'menu' | 'text';
  options?: string[]; // menu choices; the room picks by number or name
  // Every pause has a default. --ci accepts it without reading stdin. An
  // interactive real or mock run lets the operator press Enter to accept it.
  default: string;
}

export interface Step {
  lane: 'both' | LaneSide;
  cmd?: string; // same command in both modes
  mockCmd?: string; // a step with both mockCmd and realCmd picks by mode
  realCmd?: string; // a step with only realCmd is skipped when real mode is off
  cwdKey?: string; // subdirectory of the lane's staged copy; default: its root
  frame?: FrameName; // at most one of each per lane — the evidence discipline
  extract?: string; // regex; its first matching output line becomes the frame line
  say?: string; // narration, printed dim; frames on say-only steps use this text
  pause?: true; // run the scenario's pause here, in the pane that owns it
  showOutput?: boolean; // exceptional exhibit; normal output stays in the artifact
  // The exact prompt/brief this step hands its worker, shown in a bordered
  // INPUT box before the step runs. A step with promptDisplay is a worker
  // step: its output streams as dim ● lines. Lane-wide input belongs on
  // LaneSpec.promptDisplay instead.
  promptDisplay?: string;
  // Replay the lane's capture file (with a labeled provenance banner) instead
  // of executing, when the current mode cannot run this step — the mock path
  // for a real-only lane, and the anchor real-mode fallback jumps to.
  captureRef?: true;
}

export interface LaneSpec {
  label: string; // names the control, not the product (e.g. EPHEMERAL CORRECTION)
  capture?: { provenance: string; path: string }; // present iff capture-backed
  // The exact input this lane executes — the worker's prompt, or the contract
  // that stands where a prompt would. Shown in a bordered INPUT box right
  // after the lane banner, before anything runs.
  promptDisplay?: string;
}

export interface Scenario {
  id: string;
  title: string;
  sharedFixture: string; // one sentence: the same starting state in both lanes
  mechanism: string; // honesty label, declared on screen before either lane runs
  allowedCausalDifference: string; // one sentence; the battery's one-difference rule
  pause: PauseSpec;
  evidenceNote: string; // expected evidence shape; heads the artifact's frames.txt
  artifactNote: string; // honest limit of what the artifact records; lands in decision.txt
  expectedVerdicts: { left: string; right: string }; // regexes asserted by the battery
  lanes: { left: LaneSpec; right: LaneSpec };
  steps: Step[];
  stepTimeoutSec?: number; // per-step real-mode deadline; default 300 — a real worker runs for minutes; `f` is the fast exit
}
