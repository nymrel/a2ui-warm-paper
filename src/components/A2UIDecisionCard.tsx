import React, { useState } from 'react';
import { A2UIDecisionPayload, A2UIActionHandler } from '../types';

export interface A2UIDecisionCardProps {
  payload: A2UIDecisionPayload;
  onAction?: A2UIActionHandler;
  className?: string;
  style?: React.CSSProperties;
}

export const A2UIDecisionCard: React.FC<A2UIDecisionCardProps> = ({
  payload,
  onAction,
  className = '',
  style,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    payload.selectedOptionIds ||
      (payload.options.find((o) => o.recommended)?.id ? [payload.options.find((o) => o.recommended)!.id] : [])
  );
  const [customInput, setCustomInput] = useState<string>('');
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const handleToggleOption = (optionId: string, disabled?: boolean) => {
    if (disabled || isSubmitted) return;

    let newSelected: string[];
    if (payload.multiSelect) {
      newSelected = selectedIds.includes(optionId)
        ? selectedIds.filter((id) => id !== optionId)
        : [...selectedIds, optionId];
    } else {
      newSelected = [optionId];
    }
    setSelectedIds(newSelected);

    if (onAction) {
      onAction({
        componentId: payload.id,
        componentType: 'decision',
        action: 'option_select',
        payload: { selectedOptionIds: newSelected, customInput },
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleConfirmDecision = () => {
    setIsSubmitted(true);
    if (onAction) {
      onAction({
        componentId: payload.id,
        componentType: 'decision',
        action: 'decision_confirm',
        payload: {
          selectedOptionIds: selectedIds,
          selectedOptions: payload.options.filter((o) => selectedIds.includes(o.id)),
          customInput: customInput.trim() || undefined,
        },
        timestamp: new Date().toISOString(),
      });
    }
  };

  return (
    <div
      id={`a2ui-decision-${payload.id}`}
      className={`a2ui-container ${className}`}
      style={style}
    >
      <div className="a2ui-header">
        <div className="a2ui-header-left">
          <span className="a2ui-badge a2ui-badge-terracotta">Decision Required</span>
          {payload.confidenceScore !== undefined && (
            <span className="a2ui-badge a2ui-badge-muted" title="Agent Confidence Score">
              Confidence: {Math.round(payload.confidenceScore * 100)}%
            </span>
          )}
        </div>
        {payload.expiresAt && (
          <span className="a2ui-timestamp">
            Expires: {new Date(payload.expiresAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="a2ui-body">
        <div className="a2ui-decision-wrapper">
          <div>
            <h4 className="a2ui-decision-question">{payload.question}</h4>
            {payload.context && <p className="a2ui-decision-context">{payload.context}</p>}
          </div>

          <div className="a2ui-decision-options" role={payload.multiSelect ? 'group' : 'radiogroup'}>
            {payload.options.map((option) => {
              const isSelected = selectedIds.includes(option.id);
              const cardClasses = [
                'a2ui-decision-card',
                isSelected ? 'selected' : '',
                option.recommended ? 'recommended' : '',
                option.disabled ? 'disabled' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  key={option.id}
                  className={cardClasses}
                  onClick={() => handleToggleOption(option.id, option.disabled)}
                  role={payload.multiSelect ? 'checkbox' : 'radio'}
                  aria-checked={isSelected}
                  tabIndex={option.disabled ? -1 : 0}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      handleToggleOption(option.id, option.disabled);
                    }
                  }}
                >
                  <div className="a2ui-decision-card-header">
                    <div className="a2ui-decision-option-title">
                      <span>{isSelected ? '●' : '○'}</span>
                      <span>{option.title}</span>
                      {option.recommended && (
                        <span className="a2ui-badge a2ui-badge-terracotta" style={{ fontSize: '0.6875rem' }}>
                          Recommended
                        </span>
                      )}
                    </div>
                    {option.weight !== undefined && (
                      <span className="a2ui-weight-tag">{option.weight}%</span>
                    )}
                  </div>

                  {option.description && (
                    <p style={{ margin: '0.375rem 0 0 0', fontSize: '0.8125rem', color: 'var(--a2ui-ink-muted)' }}>
                      {option.description}
                    </p>
                  )}

                  {option.weight !== undefined && (
                    <div className="a2ui-weight-bar-bg">
                      <div className="a2ui-weight-bar-fill" style={{ width: `${option.weight}%` }} />
                    </div>
                  )}

                  {option.tradeoffs && (option.tradeoffs.pros?.length || option.tradeoffs.cons?.length) ? (
                    <div className="a2ui-tradeoffs">
                      {option.tradeoffs.pros && option.tradeoffs.pros.length > 0 && (
                        <div className="a2ui-tradeoff-col">
                          <span className="a2ui-tradeoff-title a2ui-tradeoff-pros-title">Pros</span>
                          {option.tradeoffs.pros.map((pro, i) => (
                            <span key={i} className="a2ui-tradeoff-item">
                              ✓ {pro}
                            </span>
                          ))}
                        </div>
                      )}
                      {option.tradeoffs.cons && option.tradeoffs.cons.length > 0 && (
                        <div className="a2ui-tradeoff-col">
                          <span className="a2ui-tradeoff-title a2ui-tradeoff-cons-title">Tradeoffs</span>
                          {option.tradeoffs.cons.map((con, i) => (
                            <span key={i} className="a2ui-tradeoff-item">
                              ⚠ {con}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {payload.allowCustomInput && (
            <div style={{ marginTop: '0.5rem' }}>
              <input
                type="text"
                className="a2ui-search-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder={payload.customInputPlaceholder || 'Provide custom guidance or instructions...'}
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                disabled={isSubmitted}
              />
            </div>
          )}
        </div>
      </div>

      <footer className="a2ui-footer">
        <button
          type="button"
          className="a2ui-btn a2ui-btn-terracotta"
          disabled={selectedIds.length === 0 || isSubmitted}
          onClick={handleConfirmDecision}
        >
          {isSubmitted ? '✓ Decision Recorded' : 'Confirm Decision →'}
        </button>
      </footer>
    </div>
  );
};
