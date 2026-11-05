const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const {
  applyStreamDelta,
  cleanRawJSON,
  parseA2UI,
  validateA2UIPayload,
  A2UIRenderer,
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
// Exercise the shipped parser for every remaining component and public alias.
// The historical suite copied parser logic into its test file instead.
for (const [types, fields, required] of [
  [['approval_gate', 'approval'], { title: 'Release review', impactSummary: ['Update UI'], riskLevel: 'high' }, 'impactSummary'],
  [['parameter_slider', 'slider'], { label: 'Temperature', min: 0, max: 2, value: 0.7 }, 'value'],
  [['diff_viewer', 'diff'], { originalContent: 'before', modifiedContent: 'after' }, 'modifiedContent'],
  [['progress_tracker', 'progress'], { title: 'Build', steps: [{ id: 'build', title: 'Build', status: 'pending' }] }, 'steps'],
  [['data_table', 'table'], { columns: [{ key: 'id', header: 'ID' }], rows: [{ id: 'one' }] }, 'rows'],
  [['container', 'card'], { title: 'Summary' }, 'title'],
]) {
  for (const type of types) {
    const payload = { id: `fixture-${type}`, type, ...fields };
    assert.deepEqual(parseA2UI(JSON.stringify(payload)).payload, payload, `${type} must parse from JSON`);
    const invalid = { ...payload };
    delete invalid[required];
    assert.equal(validateA2UIPayload(invalid).valid, false, `${type} must reject missing ${required}`);
  }
}
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

// Malformed stream data must reach the renderer's schema fallback rather than
// throwing while the progress component reads step.status or maps subSteps.
for (const type of ['progress_tracker', 'progress']) {
  for (const steps of [
    [null],
    [42],
    [[]],
    [{ id: 'build', title: {}, status: 'running' }],
    [{ id: 'build', title: 'Build', status: 'unknown' }],
    [{ id: 'build', title: 'Build', status: 'running', description: {} }],
    [{ id: 'build', title: 'Build', status: 'running', errorDetails: {} }],
    [{ id: 'build', title: 'Build', status: 'running', durationMs: 'not-a-number' }],
    [{ id: 'build', title: 'Build', status: 'running', durationMs: NaN }],
    [{ id: 'build', title: 'Build', status: 'running', durationMs: Infinity }],
    [{ id: 'build', title: 'Build', status: 'running', durationMs: -1 }],
    [{ id: 'build', title: 'Build', status: 'running', subSteps: {} }],
    [{ id: 'build', title: 'Build', status: 'running', subSteps: [null] }],
    [{ id: 'build', title: 'Build', status: 'running', subSteps: [{
      id: 'parse', title: 'Parse', status: 'pending', durationMs: -1,
    }] }],
  ]) {
    const malformed = { ...progress, type, steps };
    assert.equal(validateA2UIPayload(malformed).valid, false);
    assert.equal(parseA2UI(JSON.stringify(malformed)).valid, false);
    for (const data of [malformed, JSON.stringify(malformed)]) {
      assert.match(
        renderToStaticMarkup(React.createElement(A2UIRenderer, { data })),
        /A2UI Payload Schema Error/,
      );
    }
  }
  const valid = { ...progress, type, steps: [{
    id: 'compile', title: 'Compile', status: 'running', durationMs: 0,
    description: 'Synthetic build', errorDetails: '',
    subSteps: [{ id: 'parse', title: 'Parse', status: 'completed', durationMs: 1000 }],
  }] };
  assert.equal(validateA2UIPayload(valid).valid, true);
  assert.match(renderToStaticMarkup(React.createElement(A2UIRenderer, { data: valid })), /Compile/);
  assert.equal(validateA2UIPayload({ ...progress, type, steps: [] }).valid, true);
  assert.equal(validateA2UIPayload({
    ...progress, type, steps: [{
      ...progress.steps[0], subSteps: undefined, description: undefined,
      errorDetails: undefined, durationMs: undefined,
    }],
  }).valid, true);
}

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

for (const path of [
  '__proto__.polluted',
  'constructor.prototype.polluted',
  'steps[0].__proto__',
  '',
]) {
  assert.throws(
    () => applyStreamDelta(progress, { op: 'set', path, value: true }),
    /stream delta path|unsafe/i,
  );
}

assert.throws(
  () => applyStreamDelta(progress, {
    op: 'merge',
    path: 'steps[0]',
    value: JSON.parse('{"__proto__":{"polluted":true}}'),
  }),
  /unsafe object key/i,
);
assert.equal({}.polluted, undefined, 'delta application must not pollute object prototypes');

assert.throws(
  () => applyStreamDelta(progress, { op: 'unknown', path: 'title', value: 'unsafe' }),
  /unsupported stream delta operation/i,
);

assert.equal(warmPaperTokens.colors.cream, '#FAF8F2');
assert.equal(warmPaperTokens.colors.cedar, '#2A332E');

console.log('Package smoke tests passed against compiled dist output.');
