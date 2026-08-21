import {
  A2UIDecisionPayload,
  A2UIParameterSliderPayload,
  A2UIApprovalGatePayload,
  A2UIDiffViewerPayload,
  A2UIProgressTrackerPayload,
  A2UIDataTablePayload,
  A2UIContainerPayload,
} from '../src/types';

export const sampleDecisionPayload: A2UIDecisionPayload = {
  id: 'dec-campaign-arch',
  type: 'decision',
  question: 'Select Execution Strategy for Mobile Push Modernization',
  context: 'The modernization campaign requires routing updates across iOS and Web notifications. 3 viable paths identified.',
  confidenceScore: 0.92,
  options: [
    {
      id: 'opt-terra-writer',
      title: 'Option A: Dedicated Terra Worker with Luna Preflights',
      description: 'Isolate changes to worker thread with deterministic validation gates.',
      weight: 65,
      recommended: true,
      tradeoffs: {
        pros: ['Zero regression risk on main bus', 'Predictable token budget (~85k tokens)', 'Full test coverage before merge'],
        cons: ['Requires sequential step validation (+3 min execution time)'],
      },
    },
    {
      id: 'opt-sol-direct',
      title: 'Option B: Direct Sol Architect Execution',
      description: 'Execute multi-file refactor directly in the main session.',
      weight: 25,
      tradeoffs: {
        pros: ['Fastest time-to-implementation', 'Instant architectural adjustments'],
        cons: ['Consumes higher Sol reasoning quota', 'Higher blast radius on failure'],
      },
    },
    {
      id: 'opt-no-op',
      title: 'Option C: Keep Current State (Do Nothing)',
      description: 'Retain legacy notification handler until next quarterly release cycle.',
      weight: 10,
      tradeoffs: {
        pros: ['Zero immediate engineering effort'],
        cons: ['Technical debt compounds', 'Customer push delivery latency remains high'],
      },
    },
  ],
  allowCustomInput: true,
  customInputPlaceholder: 'Add custom constraints or routing instructions...',
};

export const sampleSliderPayload: A2UIParameterSliderPayload = {
  id: 'slider-reasoning-effort',
  type: 'parameter_slider',
  label: 'Agent Reasoning Effort Budget',
  description: 'Controls maximum reasoning token allocation per verification pass.',
  value: 32,
  min: 8,
  max: 64,
  step: 4,
  unit: 'k tokens',
  presets: [
    { label: 'Fast Sentinel', value: 8 },
    { label: 'Balanced Slice', value: 32 },
    { label: 'Deep Architect', value: 64 },
  ],
  dangerZone: {
    max: 56,
    warningMessage: 'Allocating >56k reasoning tokens will trigger automated quota review.',
  },
};

export const sampleApprovalGatePayload: A2UIApprovalGatePayload = {
  id: 'gate-cloudflare-deploy',
  type: 'approval_gate',
  title: 'Production Edge Worker Deployment Approval',
  description: 'Agent requested authorization to deploy v2.4.0 edge routing rules to global Cloudflare CDN.',
  riskLevel: 'high',
  confidence: 0.96,
  targetAction: 'cloudflare:deploy_worker_v2',
  requireReasonOnReject: true,
  impactSummary: [
    'Affects 100% of incoming production traffic across 310 edge data centers',
    'Updates JSON-LD entity graph caching TTL from 3600s to 86400s',
    'Includes automatic fallback rollback to candidate SHA 7e89f2a within 500ms if 5xx errors exceed 0.01%',
  ],
};

export const sampleDiffViewerPayload: A2UIDiffViewerPayload = {
  id: 'diff-router-config',
  type: 'diff_viewer',
  filename: 'src/router/agent-bus.ts',
  language: 'typescript',
  viewMode: 'unified',
  originalContent: `export function resolveLane(req: Request): string {
  const laneId = req.headers.get('x-studio-lane');
  if (!laneId) {
    return 'default';
  }
  return laneId;
}`,
  modifiedContent: `export function resolveLane(req: Request): string {
  const laneId = req.headers.get('x-studio-lane');
  const tenant = req.headers.get('x-nymrel-tenant') || 'primary';
  
  if (!laneId) {
    return \`default-\${tenant}\`;
  }
  
  return \`\${tenant}:\${laneId}\`;
}`,
  summary: {
    additions: 5,
    deletions: 2,
    filesChanged: 1,
  },
};

export const sampleProgressTrackerPayload: A2UIProgressTrackerPayload = {
  id: 'prog-agent-lifecycle',
  type: 'progress_tracker',
  title: 'Autonomous Campaign Execution Pipeline',
  currentStepId: 'step-verify',
  canPause: true,
  canCancel: true,
  steps: [
    {
      id: 'step-preflight',
      title: 'Luna Sentinel Preflight Scan',
      description: 'Checked repo presence, claims, and zero foreign lock conflicts.',
      status: 'completed',
      durationMs: 380,
    },
    {
      id: 'step-codegen',
      title: 'Terra Worker Code Generation',
      description: 'Created 8 component modules and unified CSS tokens.',
      status: 'completed',
      durationMs: 2150,
    },
    {
      id: 'step-verify',
      title: 'Validation & Typecheck Ladder',
      description: 'Running TypeScript compiler and Node.js automated test suite.',
      status: 'running',
    },
    {
      id: 'step-approval',
      title: 'Human-in-the-Loop Operator Gate',
      description: 'Awaiting operator sign-off before durable closeout note.',
      status: 'pending',
    },
  ],
};

export const sampleDataTablePayload: A2UIDataTablePayload = {
  id: 'table-agent-registry',
  type: 'data_table',
  title: 'Nymrel Active Agent Registry',
  subtitle: 'Live status of autonomous agents across the studio portfolio',
  searchable: true,
  selectable: true,
  exportable: true,
  columns: [
    { key: 'id', header: 'Agent ID', type: 'code', sortable: true },
    { key: 'role', header: 'Studio Role', type: 'text', sortable: true },
    { key: 'status', header: 'Status', type: 'badge', sortable: true },
    { key: 'model', header: 'Model Pin', type: 'text', sortable: true },
    { key: 'tokensUsed', header: 'Tokens (k)', type: 'number', sortable: true, align: 'right' },
  ],
  rows: [
    { id: 'sol-orch-1', role: 'Mission Owner / Architect', status: 'Active', model: 'GPT-5.6 Sol', tokensUsed: 142 },
    { id: 'terra-impl-2', role: 'Component Engineer', status: 'Running', model: 'GPT-5.6 Terra', tokensUsed: 78 },
    { id: 'luna-sent-3', role: 'Verification Sentinel', status: 'Idle', model: 'GPT-5.6 Luna', tokensUsed: 12 },
    { id: 'claude-fable', role: 'Rendered UX Lead', status: 'Idle', model: 'Opus 5', tokensUsed: 95 },
    { id: 'agy-gemini', role: 'Advisory & Scan Lead', status: 'Active', model: 'Gemini 3.6', tokensUsed: 64 },
  ],
};

export const sampleContainerPayload: A2UIContainerPayload = {
  id: 'container-master-summary',
  type: 'container',
  title: 'Nymrel Autonomous Mission Brief',
  subtitle: 'Generated by Agent-to-UI Bridge v0.8',
  badge: { label: 'Dual-Audience Verified', variant: 'sage' },
  timestamp: new Date().toISOString(),
  agentId: 'antigravity-3.6',
  collapsible: true,
  actions: [
    { id: 'act-view-logs', label: 'View Logs', action: 'view_logs', variant: 'secondary' },
    { id: 'act-closeout', label: 'Complete Mission', action: 'closeout', variant: 'terracotta' },
  ],
};
