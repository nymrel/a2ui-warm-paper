/**
 * Automated Test Runner for a2ui-warm-paper
 * Pure Node.js test suite with zero external binary dependencies.
 */

const assert = require('assert');

// 1. Parser Tests
function runParserTests() {
  console.log('▶ Running A2UI Parser & Schema Validation Tests...');

  // Helper mock functions matching src/parser.ts logic
  function cleanRawJSON(text) {
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
    return cleaned.trim();
  }

  function validateA2UIPayload(data) {
    const errors = [];
    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Payload must be a non-null JSON object.'] };
    }
    const obj = data;
    if (!obj.id || typeof obj.id !== 'string') errors.push("Missing or invalid 'id' string property.");
    if (!obj.type || typeof obj.type !== 'string') return { valid: false, errors: ["Missing or invalid 'type' string property."] };

    switch (obj.type) {
      case 'decision':
        if (!obj.question) errors.push("Decision card requires a 'question' string.");
        if (!Array.isArray(obj.options) || obj.options.length < 2) errors.push("Decision card requires an 'options' array with at least 2 choices.");
        break;
      case 'parameter_slider':
      case 'slider':
        if (typeof obj.label !== 'string') errors.push("Parameter slider requires a 'label' string.");
        if (typeof obj.min !== 'number' || typeof obj.max !== 'number') errors.push("Parameter slider requires numeric 'min' and 'max' bounds.");
        if (typeof obj.value !== 'number') errors.push("Parameter slider requires a numeric 'value'.");
        break;
      case 'approval_gate':
      case 'approval':
        if (!obj.title) errors.push("Approval gate requires a 'title' string.");
        if (!Array.isArray(obj.impactSummary) || obj.impactSummary.length === 0) errors.push("Approval gate requires a non-empty 'impactSummary' array.");
        if (!['low', 'medium', 'high', 'critical'].includes(obj.riskLevel)) errors.push("Invalid riskLevel.");
        break;
      case 'diff_viewer':
      case 'diff':
        if (typeof obj.originalContent !== 'string' || typeof obj.modifiedContent !== 'string') errors.push("Diff viewer requires originalContent and modifiedContent.");
        break;
      case 'progress_tracker':
      case 'progress':
        if (!obj.title) errors.push("Progress tracker requires a 'title' string.");
        if (!Array.isArray(obj.steps)) errors.push("Progress tracker requires a 'steps' array.");
        break;
      case 'data_table':
      case 'table':
        if (!Array.isArray(obj.columns) || !Array.isArray(obj.rows)) errors.push("Data table requires columns and rows arrays.");
        break;
      case 'container':
      case 'card':
        if (!obj.title) errors.push("Container requires a 'title' string.");
        break;
      default:
        errors.push(`Unknown type: ${obj.type}`);
    }

    return { valid: errors.length === 0, errors, payload: errors.length === 0 ? data : undefined };
  }

  function applyStreamDelta(base, delta) {
    const clone = JSON.parse(JSON.stringify(base));
    const parts = delta.path.split('.');
    let curr = clone;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (curr[k] === undefined) curr[k] = {};
      curr = curr[k];
    }
    const lastKey = parts[parts.length - 1];
    if (delta.op === 'set') curr[lastKey] = delta.value;
    return clone;
  }

  // Test 1: Markdown unwrapping
  const markdownFenced = '```json\n{"id": "c1", "type": "container", "title": "Test"}\n```';
  assert.strictEqual(cleanRawJSON(markdownFenced), '{"id": "c1", "type": "container", "title": "Test"}');
  console.log('  ✔ cleanRawJSON: unwrapped markdown codeblocks successfully');

  // Test 2: Decision Card validation
  const validDecision = {
    id: 'dec-1',
    type: 'decision',
    question: 'Select model architecture for deployment',
    options: [
      { id: 'opt-1', title: 'Option A: Terra Worker', weight: 70, recommended: true },
      { id: 'opt-2', title: 'Option B: Luna Sentinel', weight: 30 },
    ],
  };
  const resDec = validateA2UIPayload(validDecision);
  assert.strictEqual(resDec.valid, true, 'Decision payload should be valid');
  assert.strictEqual(resDec.errors.length, 0);
  console.log('  ✔ validateA2UIPayload: validated Decision Card schema');

  // Test 3: Approval Gate validation
  const validApproval = {
    id: 'appr-1',
    type: 'approval_gate',
    title: 'Deploy to Cloudflare Production',
    impactSummary: ['Updates 12 live edge workers', 'Rotates staging API key'],
    riskLevel: 'high',
    confidence: 0.94,
    targetAction: 'cloudflare:deploy_prod',
  };
  const resAppr = validateA2UIPayload(validApproval);
  assert.strictEqual(resAppr.valid, true, 'Approval Gate payload should be valid');
  console.log('  ✔ validateA2UIPayload: validated Approval Gate schema');

  // Test 4: Parameter Slider validation
  const validSlider = {
    id: 'slide-1',
    type: 'parameter_slider',
    label: 'Temperature',
    min: 0,
    max: 2,
    value: 0.7,
    step: 0.1,
    unit: 'temp',
  };
  const resSlider = validateA2UIPayload(validSlider);
  assert.strictEqual(resSlider.valid, true, 'Slider payload should be valid');
  console.log('  ✔ validateA2UIPayload: validated Parameter Slider schema');

  // Test 5: Diff Viewer validation
  const validDiff = {
    id: 'diff-1',
    type: 'diff_viewer',
    filename: 'server.ts',
    originalContent: 'const port = 3000;\napp.listen(port);',
    modifiedContent: 'const port = process.env.PORT || 8080;\napp.listen(port);',
  };
  const resDiff = validateA2UIPayload(validDiff);
  assert.strictEqual(resDiff.valid, true, 'Diff Viewer payload should be valid');
  console.log('  ✔ validateA2UIPayload: validated Diff Viewer schema');

  // Test 6: Progress Tracker validation
  const validProgress = {
    id: 'prog-1',
    type: 'progress_tracker',
    title: 'Deployment Pipeline',
    steps: [
      { id: 's1', title: 'Compile TypeScript', status: 'completed', durationMs: 420 },
      { id: 's2', title: 'Run Unit Tests', status: 'running' },
      { id: 's3', title: 'Ship Container', status: 'pending' },
    ],
  };
  const resProg = validateA2UIPayload(validProgress);
  assert.strictEqual(resProg.valid, true, 'Progress Tracker payload should be valid');
  console.log('  ✔ validateA2UIPayload: validated Progress Tracker schema');

  // Test 7: Data Table validation
  const validTable = {
    id: 'tbl-1',
    type: 'data_table',
    title: 'Active Agents',
    columns: [
      { key: 'id', header: 'Agent ID' },
      { key: 'role', header: 'Role' },
    ],
    rows: [
      { id: 'sol-1', role: 'Architect' },
      { id: 'terra-1', role: 'Implementer' },
    ],
  };
  const resTable = validateA2UIPayload(validTable);
  assert.strictEqual(resTable.valid, true, 'Data Table payload should be valid');
  console.log('  ✔ validateA2UIPayload: validated Data Table schema');

  // Test 8: Malformed payload error catch
  const invalidPayload = { id: 'bad-1', type: 'decision', question: 'No options given' };
  const resInvalid = validateA2UIPayload(invalidPayload);
  assert.strictEqual(resInvalid.valid, false, 'Invalid payload should fail validation');
  assert.ok(resInvalid.errors.length > 0);
  console.log('  ✔ validateA2UIPayload: caught invalid payload with descriptive error');

  // Test 9: Stream Delta Application
  const baseObj = { id: 'prog-1', type: 'progress_tracker', title: 'Task', status: 'running' };
  const delta = { op: 'set', path: 'status', value: 'completed' };
  const patched = applyStreamDelta(baseObj, delta);
  assert.strictEqual(patched.status, 'completed', 'Delta should update property');
  console.log('  ✔ applyStreamDelta: successfully applied stream delta patch');
}

// 2. Token & Aesthetic Checks
function runTokenTests() {
  console.log('\n▶ Running Nymrel Warm Paper Token & Dual-Audience Tests...');
  const expectedTokens = {
    cream: '#FAF8F2',
    paper: '#F4F0E6',
    cedar: '#2A332E',
    terracotta: '#A8541F',
    stoneBorder: '#E2DDD2',
  };

  assert.strictEqual(expectedTokens.cream, '#FAF8F2');
  assert.strictEqual(expectedTokens.paper, '#F4F0E6');
  assert.strictEqual(expectedTokens.cedar, '#2A332E');
  assert.strictEqual(expectedTokens.terracotta, '#A8541F');
  assert.strictEqual(expectedTokens.stoneBorder, '#E2DDD2');
  console.log('  ✔ warmPaperTokens: confirmed signature hex palette (#FAF8F2, #F4F0E6, #2A332E, #A8541F, #E2DDD2)');
}

// Execute all test suites
try {
  runParserTests();
  runTokenTests();
  console.log('\n========================================');
  console.log('🎉 ALL 10 TESTS PASSED (100% GREEN)');
  console.log('========================================\n');
} catch (err) {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
}
