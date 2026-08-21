import React, { useState } from 'react';
import { A2UIContainerPayload, A2UIActionHandler } from '../types';

export interface A2UIContainerProps {
  payload: A2UIContainerPayload;
  children?: React.ReactNode;
  onAction?: A2UIActionHandler;
  className?: string;
  style?: React.CSSProperties;
}

export const A2UIContainer: React.FC<A2UIContainerProps> = ({
  payload,
  children,
  onAction,
  className = '',
  style,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(payload.defaultCollapsed ?? false);

  const handleActionClick = (actionId: string, actionName: string, customPayload?: unknown) => {
    if (onAction) {
      onAction({
        componentId: payload.id,
        componentType: 'container',
        action: actionName,
        payload: { actionId, customPayload },
        timestamp: new Date().toISOString(),
        agentId: payload.agentId,
      });
    }
  };

  const badgeVariant = payload.badge?.variant || 'cedar';

  return (
    <div
      id={`a2ui-container-${payload.id}`}
      className={`a2ui-container ${className}`}
      style={style}
      role="region"
      aria-label={payload.title}
    >
      <header className="a2ui-header">
        <div className="a2ui-header-left">
          {payload.collapsible && (
            <button
              type="button"
              className="a2ui-btn a2ui-btn-outline a2ui-btn-sm"
              onClick={() => setCollapsed(!collapsed)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand card' : 'Collapse card'}
              style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
            >
              {collapsed ? '▶' : '▼'}
            </button>
          )}

          <div className="a2ui-title-group">
            <h3 className="a2ui-title">{payload.title}</h3>
            {payload.subtitle && <p className="a2ui-subtitle">{payload.subtitle}</p>}
          </div>

          {payload.badge && (
            <span className={`a2ui-badge a2ui-badge-${badgeVariant}`}>
              {payload.badge.label}
            </span>
          )}
        </div>

        <div className="a2ui-header-right">
          {payload.agentId && (
            <span className="a2ui-badge a2ui-badge-muted" title={`Agent: ${payload.agentId}`}>
              🤖 {payload.agentId}
            </span>
          )}
          {payload.timestamp && (
            <time className="a2ui-timestamp" dateTime={payload.timestamp}>
              {new Date(payload.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </time>
          )}
        </div>
      </header>

      {!collapsed && (
        <>
          <div className="a2ui-body">{children}</div>

          {payload.actions && payload.actions.length > 0 && (
            <footer className="a2ui-footer">
              {payload.actions.map((act) => {
                const variantClass = act.variant ? `a2ui-btn-${act.variant}` : 'a2ui-btn-secondary';
                return (
                  <button
                    key={act.id}
                    type="button"
                    className={`a2ui-btn ${variantClass} a2ui-btn-sm`}
                    disabled={act.disabled}
                    onClick={() => handleActionClick(act.id, act.action, act.payload)}
                  >
                    {act.label}
                  </button>
                );
              })}
            </footer>
          )}
        </>
      )}
    </div>
  );
};
