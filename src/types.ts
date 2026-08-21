/**
 * Google A2UI (Agent-to-UI) v0.8 Declarative Specification Types
 * Tailored for Nymrel's signature Warm Paper component ecosystem.
 */

export type A2UIVersion = '0.8';

export type A2UIComponentType =
  | 'container'
  | 'card'
  | 'decision'
  | 'parameter_slider'
  | 'slider'
  | 'approval_gate'
  | 'approval'
  | 'diff_viewer'
  | 'diff'
  | 'progress_tracker'
  | 'progress'
  | 'data_table'
  | 'table';

export type A2UIBadgeVariant =
  | 'cedar'
  | 'terracotta'
  | 'sage'
  | 'amber'
  | 'rust'
  | 'sky'
  | 'muted';

export interface A2UIBadge {
  label: string;
  variant?: A2UIBadgeVariant;
}

export interface A2UIAction {
  id: string;
  label: string;
  action: string;
  variant?: 'primary' | 'secondary' | 'terracotta' | 'danger' | 'outline';
  disabled?: boolean;
  payload?: unknown;
}

export interface A2UIBasePayload {
  id: string;
  type: string;
  version?: A2UIVersion;
  title?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  className?: string;
}

/* ==========================================================================
   1. Container / Card Specification
   ========================================================================== */

export interface A2UIContainerPayload extends A2UIBasePayload {
  type: 'container' | 'card';
  title: string;
  subtitle?: string;
  badge?: A2UIBadge;
  timestamp?: string;
  agentId?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  actions?: A2UIAction[];
  children?: A2UIPayload[];
}

/* ==========================================================================
   2. Decision Card Specification
   ========================================================================== */

export interface A2UIDecisionTradeoffs {
  pros?: string[];
  cons?: string[];
}

export interface A2UIDecisionOption {
  id: string;
  title: string;
  description?: string;
  weight?: number; // 0 - 100 percentage
  recommended?: boolean;
  tradeoffs?: A2UIDecisionTradeoffs;
  disabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface A2UIDecisionPayload extends A2UIBasePayload {
  type: 'decision';
  question: string;
  context?: string;
  options: A2UIDecisionOption[];
  multiSelect?: boolean;
  allowCustomInput?: boolean;
  customInputPlaceholder?: string;
  selectedOptionIds?: string[];
  confidenceScore?: number; // 0.0 to 1.0
  expiresAt?: string;
}

/* ==========================================================================
   3. Parameter Slider Specification
   ========================================================================== */

export interface A2UISliderPreset {
  label: string;
  value: number;
}

export interface A2UIDangerZone {
  min?: number;
  max?: number;
  warningMessage?: string;
}

export interface A2UIParameterSliderPayload extends A2UIBasePayload {
  type: 'parameter_slider' | 'slider';
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  presets?: A2UISliderPreset[];
  showSteppers?: boolean;
  disabled?: boolean;
  dangerZone?: A2UIDangerZone;
}

/* ==========================================================================
   4. Approval Gate Specification
   ========================================================================== */

export type A2UIRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type A2UIApprovalStatus = 'pending' | 'approved' | 'rejected' | 'edit_requested';

export interface A2UIApprovalGatePayload extends A2UIBasePayload {
  type: 'approval_gate' | 'approval';
  title: string;
  description?: string;
  impactSummary: string[];
  riskLevel: A2UIRiskLevel;
  confidence?: number; // 0.0 to 1.0
  targetAction: string;
  requireReasonOnReject?: boolean;
  requireConfirmation?: boolean;
  suggestedModifications?: string[];
  autoApproveSeconds?: number;
  status?: A2UIApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

/* ==========================================================================
   5. Diff Viewer Specification
   ========================================================================== */

export type A2UIDiffViewMode = 'split' | 'unified';

export interface A2UIDiffSummary {
  additions: number;
  deletions: number;
  filesChanged?: number;
}

export interface A2UIDiffViewerPayload extends A2UIBasePayload {
  type: 'diff_viewer' | 'diff';
  filename?: string;
  language?: string;
  originalContent: string;
  modifiedContent: string;
  unifiedDiff?: string;
  viewMode?: A2UIDiffViewMode;
  allowModeToggle?: boolean;
  highlightChanges?: boolean;
  copyable?: boolean;
  summary?: A2UIDiffSummary;
}

/* ==========================================================================
   6. Progress Tracker Specification
   ========================================================================== */

export type A2UIStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting_for_human'
  | 'skipped';

export interface A2UISubStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  durationMs?: number;
}

export interface A2UIProgressStep {
  id: string;
  title: string;
  description?: string;
  status: A2UIStepStatus;
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
  errorDetails?: string;
  subSteps?: A2UISubStep[];
}

export interface A2UIProgressTrackerPayload extends A2UIBasePayload {
  type: 'progress_tracker' | 'progress';
  title: string;
  currentStepId?: string;
  steps: A2UIProgressStep[];
  overallStatus?: 'running' | 'completed' | 'paused' | 'failed';
  showTimestamps?: boolean;
  canCancel?: boolean;
  canPause?: boolean;
}

/* ==========================================================================
   7. Data Table Specification
   ========================================================================== */

export type A2UIDataTableColumnType =
  | 'text'
  | 'number'
  | 'badge'
  | 'date'
  | 'boolean'
  | 'link'
  | 'code';

export interface A2UIDataTableColumn {
  key: string;
  header: string;
  sortable?: boolean;
  filterable?: boolean;
  type?: A2UIDataTableColumnType;
  align?: 'left' | 'center' | 'right';
  width?: string | number;
}

export interface A2UIDataTablePagination {
  pageSize: number;
  currentPage?: number;
  totalRows?: number;
}

export interface A2UIDataTablePayload extends A2UIBasePayload {
  type: 'data_table' | 'table';
  title?: string;
  subtitle?: string;
  columns: A2UIDataTableColumn[];
  rows: Record<string, unknown>[];
  pagination?: A2UIDataTablePagination;
  searchable?: boolean;
  selectable?: boolean;
  exportable?: boolean;
  emptyMessage?: string;
}

/* ==========================================================================
   Union Payload & Event Types
   ========================================================================== */

export type A2UIPayload =
  | A2UIContainerPayload
  | A2UIDecisionPayload
  | A2UIParameterSliderPayload
  | A2UIApprovalGatePayload
  | A2UIDiffViewerPayload
  | A2UIProgressTrackerPayload
  | A2UIDataTablePayload;

export interface A2UIActionEvent<T = unknown> {
  componentId: string;
  componentType: A2UIComponentType;
  action: string;
  payload: T;
  timestamp: string;
  agentId?: string;
}

export type A2UIActionHandler = (event: A2UIActionEvent) => void | Promise<void>;

/* ==========================================================================
   Streaming Protocol & Parser Types
   ========================================================================== */

export type A2UIStreamDeltaOp = 'set' | 'append' | 'merge' | 'delete';

export interface A2UIStreamDelta {
  op: A2UIStreamDeltaOp;
  path: string; // e.g. "steps[2].status" or "options"
  value: unknown;
  version?: A2UIVersion;
}

export interface A2UIParseResult {
  valid: boolean;
  payload?: A2UIPayload;
  errors?: string[];
  rawText?: string;
}
