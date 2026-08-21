import React, { useState } from 'react';
import { A2UIParameterSliderPayload, A2UIActionHandler } from '../types';

export interface A2UIParameterSliderProps {
  payload: A2UIParameterSliderPayload;
  onAction?: A2UIActionHandler;
  className?: string;
  style?: React.CSSProperties;
}

export const A2UIParameterSlider: React.FC<A2UIParameterSliderProps> = ({
  payload,
  onAction,
  className = '',
  style,
}) => {
  const [val, setVal] = useState<number>(payload.value);

  const step = payload.step ?? 1;

  const triggerChange = (newVal: number) => {
    const clamped = Math.min(payload.max, Math.max(payload.min, newVal));
    setVal(clamped);

    if (onAction) {
      onAction({
        componentId: payload.id,
        componentType: 'parameter_slider',
        action: 'parameter_change',
        payload: { value: clamped, unit: payload.unit },
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleStepDown = () => {
    if (payload.disabled) return;
    triggerChange(val - step);
  };

  const handleStepUp = () => {
    if (payload.disabled) return;
    triggerChange(val + step);
  };

  const isDanger =
    payload.dangerZone &&
    ((payload.dangerZone.min !== undefined && val < payload.dangerZone.min) ||
      (payload.dangerZone.max !== undefined && val > payload.dangerZone.max));

  return (
    <div
      id={`a2ui-slider-${payload.id}`}
      className={`a2ui-container ${className}`}
      style={style}
    >
      <div className="a2ui-body">
        <div className="a2ui-slider-card">
          <div className="a2ui-slider-header">
            <div>
              <span className="a2ui-slider-label">{payload.label}</span>
              {payload.description && (
                <p style={{ margin: '0.125rem 0 0 0', fontSize: '0.8125rem', color: 'var(--a2ui-ink-muted)' }}>
                  {payload.description}
                </p>
              )}
            </div>
            <div className="a2ui-slider-value-badge">
              {val}
              {payload.unit ? ` ${payload.unit}` : ''}
            </div>
          </div>

          <div className="a2ui-slider-control-row">
            {payload.showSteppers !== false && (
              <button
                type="button"
                className="a2ui-slider-stepper-btn"
                onClick={handleStepDown}
                disabled={payload.disabled || val <= payload.min}
                aria-label="Decrease value"
              >
                −
              </button>
            )}

            <input
              type="range"
              className="a2ui-slider-input"
              min={payload.min}
              max={payload.max}
              step={step}
              value={val}
              disabled={payload.disabled}
              onChange={(e) => triggerChange(parseFloat(e.target.value))}
              aria-valuemin={payload.min}
              aria-valuemax={payload.max}
              aria-valuenow={val}
              aria-label={payload.label}
            />

            {payload.showSteppers !== false && (
              <button
                type="button"
                className="a2ui-slider-stepper-btn"
                onClick={handleStepUp}
                disabled={payload.disabled || val >= payload.max}
                aria-label="Increase value"
              >
                +
              </button>
            )}
          </div>

          {payload.presets && payload.presets.length > 0 && (
            <div className="a2ui-slider-presets">
              <span style={{ fontSize: '0.75rem', color: 'var(--a2ui-ink-subtle)', alignSelf: 'center' }}>
                Presets:
              </span>
              {payload.presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={`a2ui-preset-pill ${val === preset.value ? 'active' : ''}`}
                  onClick={() => triggerChange(preset.value)}
                  disabled={payload.disabled}
                >
                  {preset.label} ({preset.value}{payload.unit || ''})
                </button>
              ))}
            </div>
          )}

          {isDanger && payload.dangerZone?.warningMessage && (
            <div
              style={{
                backgroundColor: 'var(--a2ui-rust-bg)',
                border: '1px solid var(--a2ui-rust-border)',
                color: 'var(--a2ui-rust)',
                borderRadius: 'var(--a2ui-radius-sm)',
                padding: '0.5rem 0.75rem',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}
            >
              <span>⚠</span>
              <span>{payload.dangerZone.warningMessage}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
