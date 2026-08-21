import React, { useState } from 'react';
import { A2UIApprovalGatePayload, A2UIApprovalStatus, A2UIActionHandler } from '../types';

export interface A2UIApprovalGateProps {
  payload: A2UIApprovalGatePayload;
  onAction?: A2UIActionHandler;
  className?: string;
  style?: React.CSSProperties;
}

export const A2UIApprovalGate: React.FC<A2UIApprovalGateProps> = ({
  payload,
  onAction,
  className = '',
  style,
}) => {
  const [status, setStatus] = useState<A2UIApprovalStatus>(payload.status || 'pending');
  const [showRejectBox, setShowRejectBox] = useState<boolean>(false);
  const [showEditBox, setShowEditBox] = useState<boolean>(false);
  const [reason, setReason] = useState<string>('');

  const handleApprove = () => {
    setStatus('approved');
    if (onAction) {
      onAction({
        componentId: payload.id,
        componentType: 'approval_gate',
        action: 'approve',
        payload: {
          targetAction: payload.targetAction,
          status: 'approved',
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleRejectConfirm = () => {
    setStatus('rejected');
    setShowRejectBox(false);
    if (onAction) {
      onAction({
        componentId: payload.id,
        componentType: 'approval_gate',
        action: 'reject',
        payload: {
          targetAction: payload.targetAction,
          status: 'rejected',
          reason: reason.trim() || 'Rejected by operator without specific note',
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleEditConfirm = () => {
    setStatus('edit_requested');
    setShowEditBox(false);
    if (onAction) {
      onAction({
        componentId: payload.id,
        componentType: 'approval_gate',
        action: 'request_edit',
        payload: {
          targetAction: payload.targetAction,
          status: 'edit_requested',
          requestedChanges: reason.trim(),
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    }
  };

  const riskBadgeMap: Record<string, { label: string; badgeClass: string }> = {
    low: { label: 'Low Risk', badgeClass: 'a2ui-badge-sage' },
    medium: { label: 'Medium Risk', badgeClass: 'a2ui-badge-amber' },
    high: { label: 'High Risk', badgeClass: 'a2ui-badge-terracotta' },
    critical: { label: 'Critical Risk', badgeClass: 'a2ui-badge-rust' },
  };

  const currentRisk = riskBadgeMap[payload.riskLevel] || riskBadgeMap['medium']!;

  return (
    <div
      id={`a2ui-approval-${payload.id}`}
      className={`a2ui-container ${className}`}
      style={style}
    >
      <div className="a2ui-header">
        <div className="a2ui-header-left">
          <span className="a2ui-badge a2ui-badge-cedar">Human In The Loop</span>
          <span className={`a2ui-badge ${currentRisk.badgeClass}`}>{currentRisk.label}</span>
        </div>
        {payload.confidence !== undefined && (
          <span className="a2ui-badge a2ui-badge-muted">
            Model Confidence: {Math.round(payload.confidence * 100)}%
          </span>
        )}
      </div>

      <div className="a2ui-body">
        <div className="a2ui-approval-wrapper">
          <div>
            <h4 className="a2ui-title" style={{ fontSize: '1.25rem' }}>
              {payload.title}
            </h4>
            {payload.description && (
              <p style={{ margin: '0.25rem 0 0 0', color: 'var(--a2ui-ink-muted)', fontSize: '0.875rem' }}>
                {payload.description}
              </p>
            )}
          </div>

          <div className="a2ui-approval-meta-grid">
            <div className="a2ui-approval-meta-item">
              <span className="a2ui-approval-meta-label">Target Action</span>
              <code style={{ fontFamily: 'var(--a2ui-font-mono)', fontSize: '0.8125rem', color: 'var(--a2ui-cedar)' }}>
                {payload.targetAction}
              </code>
            </div>
            <div className="a2ui-approval-meta-item">
              <span className="a2ui-approval-meta-label">Current State</span>
              <span style={{ fontWeight: 600, textTransform: 'capitalize', fontSize: '0.875rem' }}>
                {status.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div className="a2ui-impact-section">
            <h5 className="a2ui-impact-title">Anticipated Impact & Side Effects</h5>
            <ul className="a2ui-impact-list">
              {payload.impactSummary.map((impact, i) => (
                <li key={i}>{impact}</li>
              ))}
            </ul>
          </div>

          {status === 'pending' && (
            <>
              {showRejectBox && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--a2ui-rust)' }}>
                    Rejection Reason {payload.requireReasonOnReject ? '(Required)' : '(Optional)'}:
                  </label>
                  <textarea
                    className="a2ui-reason-box"
                    placeholder="Describe why this action was rejected..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="a2ui-btn a2ui-btn-danger a2ui-btn-sm"
                      disabled={payload.requireReasonOnReject && !reason.trim()}
                      onClick={handleRejectConfirm}
                    >
                      Confirm Rejection
                    </button>
                    <button
                      type="button"
                      className="a2ui-btn a2ui-btn-secondary a2ui-btn-sm"
                      onClick={() => setShowRejectBox(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {showEditBox && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--a2ui-cedar)' }}>
                    Instructions / Modifications Needed:
                  </label>
                  <textarea
                    className="a2ui-reason-box"
                    placeholder="Provide specific feedback or changes the agent should make..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="a2ui-btn a2ui-btn-primary a2ui-btn-sm"
                      disabled={!reason.trim()}
                      onClick={handleEditConfirm}
                    >
                      Send Feedback to Agent
                    </button>
                    <button
                      type="button"
                      className="a2ui-btn a2ui-btn-secondary a2ui-btn-sm"
                      onClick={() => setShowEditBox(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {status !== 'pending' && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--a2ui-radius-md)',
                backgroundColor:
                  status === 'approved'
                    ? 'var(--a2ui-sage-bg)'
                    : status === 'rejected'
                    ? 'var(--a2ui-rust-bg)'
                    : 'var(--a2ui-paper-soft)',
                border:
                  status === 'approved'
                    ? '1px solid var(--a2ui-sage-border)'
                    : status === 'rejected'
                    ? '1px solid var(--a2ui-rust-border)'
                    : '1px solid var(--a2ui-stone-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color:
                  status === 'approved'
                    ? 'var(--a2ui-sage)'
                    : status === 'rejected'
                    ? 'var(--a2ui-rust)'
                    : 'var(--a2ui-ink)',
              }}
            >
              <span>{status === 'approved' ? '✓' : status === 'rejected' ? '✗' : '✍'}</span>
              <span>
                {status === 'approved' && 'Action Approved & Queued for Execution'}
                {status === 'rejected' && `Action Rejected ${reason ? `(${reason})` : ''}`}
                {status === 'edit_requested' && `Modifications Requested (${reason})`}
              </span>
            </div>
          )}
        </div>
      </div>

      {status === 'pending' && !showRejectBox && !showEditBox && (
        <footer className="a2ui-footer">
          <button
            type="button"
            className="a2ui-btn a2ui-btn-outline a2ui-btn-sm"
            onClick={() => setShowEditBox(true)}
          >
            ✍ Request Edit
          </button>
          <button
            type="button"
            className="a2ui-btn a2ui-btn-danger a2ui-btn-sm"
            onClick={() => setShowRejectBox(true)}
          >
            ✗ Reject
          </button>
          <button
            type="button"
            className="a2ui-btn a2ui-btn-terracotta"
            onClick={handleApprove}
          >
            ✓ Approve & Execute
          </button>
        </footer>
      )}
    </div>
  );
};
