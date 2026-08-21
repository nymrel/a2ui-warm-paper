import React from 'react';
import { A2UIPayload, A2UIActionHandler } from '../types';
import { validateA2UIPayload, parseA2UI } from '../parser';
import { A2UIContainer } from './A2UIContainer';
import { A2UIDecisionCard } from './A2UIDecisionCard';
import { A2UIParameterSlider } from './A2UIParameterSlider';
import { A2UIApprovalGate } from './A2UIApprovalGate';
import { A2UIDiffViewer } from './A2UIDiffViewer';
import { A2UIProgressTracker } from './A2UIProgressTracker';
import { A2UIDataTable } from './A2UIDataTable';

export interface A2UIRendererProps {
  /**
   * Typed A2UIPayload object, raw JavaScript object, or raw JSON string
   */
  data: A2UIPayload | string | Record<string, unknown>;
  onAction?: A2UIActionHandler;
  className?: string;
  style?: React.CSSProperties;
  fallback?: React.ReactNode;
}

export const A2UIRenderer: React.FC<A2UIRendererProps> = ({
  data,
  onAction,
  className = '',
  style,
  fallback,
}) => {
  let payload: A2UIPayload | undefined;
  let errors: string[] | undefined;

  if (typeof data === 'string') {
    const parseResult = parseA2UI(data);
    if (!parseResult.valid || !parseResult.payload) {
      errors = parseResult.errors || ['Failed to parse JSON string.'];
    } else {
      payload = parseResult.payload;
    }
  } else {
    const validation = validateA2UIPayload(data);
    if (!validation.valid || !validation.payload) {
      errors = validation.errors || ['Invalid A2UI payload structure.'];
    } else {
      payload = validation.payload;
    }
  }

  if (errors || !payload) {
    if (fallback) return <>{fallback}</>;
    return (
      <div
        className={`a2ui-container ${className}`}
        style={{
          border: '1.5px solid var(--a2ui-rust-border)',
          backgroundColor: 'var(--a2ui-rust-bg)',
          padding: '1rem',
          ...style,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--a2ui-rust)', fontWeight: 600 }}>
          <span>⚠</span>
          <span>A2UI Payload Schema Error</span>
        </div>
        <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0, fontSize: '0.8125rem', color: 'var(--a2ui-rust)' }}>
          {errors?.map((err, idx) => (
            <li key={idx}>{err}</li>
          ))}
        </ul>
      </div>
    );
  }

  switch (payload.type) {
    case 'decision':
      return <A2UIDecisionCard payload={payload} onAction={onAction} className={className} style={style} />;

    case 'parameter_slider':
    case 'slider':
      return <A2UIParameterSlider payload={payload} onAction={onAction} className={className} style={style} />;

    case 'approval_gate':
    case 'approval':
      return <A2UIApprovalGate payload={payload} onAction={onAction} className={className} style={style} />;

    case 'diff_viewer':
    case 'diff':
      return <A2UIDiffViewer payload={payload} className={className} style={style} />;

    case 'progress_tracker':
    case 'progress':
      return <A2UIProgressTracker payload={payload} onAction={onAction} className={className} style={style} />;

    case 'data_table':
    case 'table':
      return <A2UIDataTable payload={payload} onAction={onAction} className={className} style={style} />;

    case 'container':
    case 'card':
      return (
        <A2UIContainer payload={payload} onAction={onAction} className={className} style={style}>
          {payload.children?.map((child, idx) => (
            <A2UIRenderer
              key={child.id || idx}
              data={child}
              onAction={onAction}
            />
          ))}
        </A2UIContainer>
      );

    default:
      return (
        <div className={`a2ui-container ${className}`} style={style}>
          <div className="a2ui-body">
            <p>Unsupported A2UI component type: {(payload as any).type}</p>
          </div>
        </div>
      );
  }
};
