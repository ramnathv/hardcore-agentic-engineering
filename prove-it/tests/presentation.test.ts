import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanInlineMarkdown,
  evidenceForScreen,
  fitToken,
  inputBlocks,
  summarizeCommand,
  summarizeTool,
  wrapText,
} from '../live/presentation.ts';
import s1 from '../live/scenarios/s1-define.ts';
import s2 from '../live/scenarios/s2-brief.ts';
import s3 from '../live/scenarios/s3-operate.ts';
import s4 from '../live/scenarios/s4-verify.ts';
import s5 from '../live/scenarios/s5-compound.ts';
import s6 from '../live/scenarios/s6-compose.ts';

test('presentation removes raw markdown without changing its words', () => {
  assert.equal(cleanInlineMarkdown('● - **Updated** `working/src/slugify.mjs`'), '● - Updated working/src/slugify.mjs');
});

test('presentation wraps on words and compacts oversized tokens', () => {
  assert.deepEqual(wrapText('The gate refused the run because no signed receipt exists.', 24), [
    'The gate refused the run',
    'because no signed',
    'receipt exists.',
  ]);
  assert.equal(fitToken('working/test/a-very-long-slugify-test-file.mjs', 24).length, 24);
});

test('presentation recognizes structured input', () => {
  assert.deepEqual(inputBlocks('outcome: slug is safe\ncheck: node --test slugify.test.mjs'), [
    { label: 'OUTCOME', text: 'slug is safe' },
    { label: 'CHECK', text: 'node --test slugify.test.mjs' },
  ]);
});

test('presentation summarizes commands and tools', () => {
  assert.equal(summarizeCommand('node control/dr-gate.ts check run-1'), 'Ran the gate check');
  assert.equal(summarizeCommand("case 'steer' in steer) echo ok ;; esac"), 'Classified the room answer');
  assert.equal(summarizeTool('read_file', 'working/src/slugify.mjs'), 'Read working/src/slugify.mjs');
});

test('presentation turns JSON evidence into a readable sentence', () => {
  assert.equal(
    evidenceForScreen('{"status":"needs_reconcile","reason":"pending action"}'),
    'Status: needs_reconcile · Reason: pending action',
  );
  assert.equal(evidenceForScreen('"status": "interrupted",'), 'Status: interrupted');
  assert.equal(
    evidenceForScreen('{"type":"plan.rejected","actor":"operator","data":{"fact":"queue is read-only"}}'),
    'Event: plan.rejected · Actor: operator · Fact: queue is read-only',
  );
});

test('all visible lesson narration uses short sentences', () => {
  for (const scenario of [s1, s2, s3, s4, s5, s6]) {
    const visible = [scenario.allowedCausalDifference, ...scenario.steps.flatMap((step) => (step.say ? [step.say] : []))];
    for (const text of visible) {
      assert.equal(text.includes(';'), false, `${scenario.id} narration contains a semicolon: ${text}`);
      for (const sentence of text.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean)) {
        const words = sentence.split(/\s+/).length;
        assert.ok(words <= 25, `${scenario.id} narration has ${words} words: ${sentence}`);
      }
    }
  }
});
