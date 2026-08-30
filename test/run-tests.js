const assert = require('node:assert/strict');

const {
  applyStreamDelta,
  cleanRawJSON,
  parseA2UI,
  validateA2UIPayload,
  warmPaperTokens,
} = require('../dist/index.js');

const decision = {
  id: 'decision-1',
  type: 'decision',
  question: 'Choose a release lane',
  options: [
    { id: 'review', title: 'Review first' },
    { id: 'ship', title: 'Ship now' },
  ],
};

assert.equal(
  cleanRawJSON('```json\n{"id":"card-1","type":"container","title":"Test"}\n```'),
  '{"id":"card-1","type":"container","title":"Test"}',
);

assert.deepEqual(parseA2UI(JSON.stringify(decision)).payload, decision);
assert.equal(validateA2UIPayload(decision).valid, true);
assert.equal(
  validateA2UIPayload({ id: 'invalid', type: 'decision', question: 'Missing options' }).valid,
  false,
);

const progress = {
  id: 'progress-1',
  type: 'progress_tracker',
  title: 'Build',
  steps: [{ id: 'compile', title: 'Compile', status: 'running' }],
};

const updated = applyStreamDelta(progress, {
  op: 'set',
  path: 'steps[0].status',
  value: 'completed',
});
assert.equal(updated.steps[0].status, 'completed');
assert.equal(progress.steps[0].status, 'running', 'delta application must not mutate its input');

const appended = applyStreamDelta(updated, {
  op: 'append',
  path: 'steps',
  value: { id: 'test', title: 'Test', status: 'pending' },
});
assert.equal(appended.steps.length, 2);

assert.equal(warmPaperTokens.colors.cream, '#FAF8F2');
assert.equal(warmPaperTokens.colors.cedar, '#2A332E');

console.log('Package smoke tests passed against compiled dist output.');
