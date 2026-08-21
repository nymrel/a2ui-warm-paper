import React from 'react';
import { A2UIProgressTrackerPayload, A2UIStepStatus, A2UIActionHandler } from '../types';

export interface A2UIProgressTrackerProps {
  payload: A2UIProgressTrackerPayload;
  onAction?: A2UIActionHandler;
  className?: string;
  style?: React.CSSProperties;
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getStepIcon(status: A2UIStepStatus): React.ReactNode {
  switch (status) {
    case 'completed':
      return <span style={{ fontSize: '0.6875rem' }}>✓</span>;
    case 'running':
      return <span style={{ fontSize: '0.5rem' }}>●</span>;
    case 'failed':
      return <span style={{ fontSize: '0.6875rem' }}>✕</span>;
    case 'waiting_for_human':
      return <span style={{ fontSize: '0.625rem' }}>⏳</span>;
    case 'skipped':
      return <span style={{ fontSize: '0.625rem' }}>-</span>;
    case 'pending':
    default:
      return <span style={{ fontSize: '0.5rem', opacity: 0.3 }}>○</span>;
  }
}

export const A2UIProgressTracker: React.FC<A2UIProgressTrackerProps> = ({
  payload,
  onAction,
  className = '',
  style,
}) => {
  const completedCount = payload.steps.filter((s) => s.status === 'completed').length;
  const totalCount = payload.steps.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handlePause = () => {
    if (onAction) {
      onAction({
        componentId: payload.id,
        componentType: 'progress_tracker',
        action: 'pause',
        payload: { currentStepId: payload.currentStepId },
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleCancel = () => {
    if (onAction) {
      onAction({
        componentId: payload.id,
        componentType: 'progress_tracker',
        action: 'cancel',
        payload: { currentStepId: payload.currentStepId },
        timestamp: new Date().toISOString(),
      });
    }
  };

  return (
    <div
      id={`a2ui-progress-${payload.id}`}
      className={`a2ui-container ${className}`}
      style={style}
    >
      <div className="a2ui-header">
        <div className="a2ui-header-left">
          <h4 className="a2ui-title">{payload.title}</h4>
          <span className="a2ui-badge a2ui-badge-cedar">{percent}% Complete</span>
        </div>

        <div className="a2ui-header-right">
          {payload.canPause && (
            <button
              type="button"
              className="a2ui-btn a2ui-btn-secondary a2ui-btn-sm"
              onClick={handlePause}
            >
              Pause
            </button>
          )}
          {payload.canCancel && (
            <button
              type="button"
              className="a2ui-btn a2ui-btn-danger a2ui-btn-sm"
              onClick={handleCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="a2ui-body">
        <div className="a2ui-weight-bar-bg" style={{ marginBottom: '1.25rem', height: '6px' }}>
          <div
            className="a2ui-weight-bar-fill"
            style={{
              width: `${percent}%`,
              background: percent === 100 ? 'var(--a2ui-sage)' : 'var(--a2ui-terracotta)',
            }}
          />
        </div>

        <div className="a2ui-timeline">
          {payload.steps.map((step) => {
            const isCurrent = step.id === payload.currentStepId;
            const itemClasses = ['a2ui-timeline-item', step.status, isCurrent ? 'current' : '']
              .filter(Boolean)
              .join(' ');

            return (
              <div key={step.id} className={itemClasses}>
                <div className="a2ui-timeline-dot">{getStepIcon(step.status)}</div>

                <div className="a2ui-timeline-title">
                  <span>{step.title}</span>
                  {step.durationMs !== undefined && (
                    <span className="a2ui-badge a2ui-badge-muted" style={{ fontSize: '0.6875rem' }}>
                      {formatDuration(step.durationMs)}
                    </span>
                  )}
                  {step.status === 'running' && (
                    <span className="a2ui-badge a2ui-badge-amber" style={{ fontSize: '0.6875rem' }}>
                      In Progress
                    </span>
                  )}
                  {step.status === 'waiting_for_human' && (
                    <span className="a2ui-badge a2ui-badge-terracotta" style={{ fontSize: '0.6875rem' }}>
                      Waiting for Input
                    </span>
                  )}
                </div>

                {step.description && <div className="a2ui-timeline-desc">{step.description}</div>}

                {step.errorDetails && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      backgroundColor: 'var(--a2ui-rust-bg)',
                      border: '1px solid var(--a2ui-rust-border)',
                      borderRadius: 'var(--a2ui-radius-sm)',
                      color: 'var(--a2ui-rust)',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--a2ui-font-mono)',
                    }}
                  >
                    {step.errorDetails}
                  </div>
                )}

                {step.subSteps && step.subSteps.length > 0 && (
                  <div style={{ marginTop: '0.5rem', paddingLeft: '0.75rem', borderLeft: '1px dashed var(--a2ui-stone-border)' }}>
                    {step.subSteps.map((sub) => (
                      <div
                        key={sub.id}
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--a2ui-ink-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          margin: '0.2rem 0',
                        }}
                      >
                        <span>{sub.status === 'completed' ? '✓' : sub.status === 'running' ? '●' : '○'}</span>
                        <span>{sub.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
