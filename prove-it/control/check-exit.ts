// One exit-status protocol for every place that evaluates a Done Contract check.
//
// A check satisfies the contract when its actual exit status matches expect_exit.
// Exit 2 is the conventional third state when the check cannot reach a verdict.
// The gate remains binary: only "satisfied" is accepted.
export const INCONCLUSIVE_CHECK_EXIT = 2;

export type CheckExitOutcome = 'satisfied' | 'failed' | 'inconclusive';

export interface CheckExitAssessment {
  outcome: CheckExitOutcome;
  accepted: boolean;
  actual: number | null;
  expected: number;
}

export function assessCheckExit(
  actual: number | null,
  expected: number,
): CheckExitAssessment {
  if (actual === null || actual === INCONCLUSIVE_CHECK_EXIT)
    return { outcome: 'inconclusive', accepted: false, actual, expected };
  if (actual === expected)
    return { outcome: 'satisfied', accepted: true, actual, expected };
  return { outcome: 'failed', accepted: false, actual, expected };
}

export function observedExit(actual: number | null): string {
  return actual === null ? 'no exit status' : `exit ${actual}`;
}

// Keep the familiar exit-0 demo language stable. Add contract detail only
// when it changes the interpretation or when no verdict exists.
export function checkSummary(command: string, assessment: CheckExitAssessment): string {
  if (assessment.accepted) {
    if (assessment.actual === 0 && assessment.expected === 0)
      return `check passed: ${command}`;
    return `check passed (${observedExit(assessment.actual)} as contracted): ${command}`;
  }
  if (assessment.outcome === 'inconclusive')
    return (
      `check inconclusive (${observedExit(assessment.actual)}, expected exit ` +
      `${assessment.expected}): ${command}`
    );
  if (assessment.expected === 0)
    return `check failed (${observedExit(assessment.actual)}): ${command}`;
  return (
    `check failed (${observedExit(assessment.actual)}, expected exit ` +
    `${assessment.expected}): ${command}`
  );
}
