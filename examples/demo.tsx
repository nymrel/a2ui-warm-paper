import React, { useState } from 'react';
import {
  A2UIRenderer,
  A2UIContainer,
  A2UIDecisionCard,
  A2UIParameterSlider,
  A2UIApprovalGate,
  A2UIDiffViewer,
  A2UIProgressTracker,
  A2UIDataTable,
  useA2UIState,
  A2UIActionEvent,
} from '../src';
import {
  sampleDecisionPayload,
  sampleSliderPayload,
  sampleApprovalGatePayload,
  sampleDiffViewerPayload,
  sampleProgressTrackerPayload,
  sampleDataTablePayload,
  sampleContainerPayload,
} from './sample-payloads';
import '../src/styles/warm-paper.css';

export const A2UIDemoApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [customJSON, setCustomJSON] = useState<string>(
    JSON.stringify(sampleDecisionPayload, null, 2)
  );

  const { actionHistory, lastAction, handleAction, clearHistory } = useA2UIState((evt: A2UIActionEvent) => {
    console.log('[A2UI Event Dispatched]:', evt);
  });

  return (
    <div
      style={{
        backgroundColor: 'var(--a2ui-cream)',
        minHeight: '100vh',
        padding: '2rem',
        fontFamily: 'var(--a2ui-font-sans)',
        color: 'var(--a2ui-ink)',
      }}
    >
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        {/* Showcase Header */}
        <header style={{ marginBottom: '2.5rem', borderBottom: '1px solid var(--a2ui-stone-border)', paddingBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h1 style={{ fontFamily: 'var(--a2ui-font-serif)', fontSize: '2.25rem', color: 'var(--a2ui-cedar)', margin: 0 }}>
              a2ui-warm-paper
            </h1>
            <span className="a2ui-badge a2ui-badge-terracotta">v1.0.0</span>
            <span className="a2ui-badge a2ui-badge-sage">A2UI v0.8 Standard</span>
          </div>
          <p style={{ color: 'var(--a2ui-ink-muted)', fontSize: '1.0625rem', margin: 0, lineHeight: 1.6 }}>
            Google A2UI (Agent-to-UI) declarative JSON specification component system with Nymrel's signature Warm Paper design aesthetic (#FAF8F2, #F4F0E6, #2A332E, #A8541F).
          </p>

          {/* Navigation Bar */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Components' },
              { id: 'decision', label: 'Decision Card' },
              { id: 'slider', label: 'Parameter Slider' },
              { id: 'approval', label: 'Approval Gate' },
              { id: 'diff', label: 'Diff Viewer' },
              { id: 'progress', label: 'Progress Tracker' },
              { id: 'table', label: 'Data Table' },
              { id: 'live', label: 'Live JSON Sandbox' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`a2ui-btn ${activeTab === tab.id ? 'a2ui-btn-primary' : 'a2ui-btn-secondary'} a2ui-btn-sm`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {/* Live Action Dispatch Banner */}
        {lastAction && (
          <div
            style={{
              backgroundColor: 'var(--a2ui-paper-elevated)',
              border: '1px solid var(--a2ui-stone-border)',
              borderRadius: 'var(--a2ui-radius-md)',
              padding: '0.75rem 1rem',
              marginBottom: '2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontWeight: 600, color: 'var(--a2ui-terracotta)', fontSize: '0.8125rem' }}>
                ⚡ Last Dispatched Action:
              </span>{' '}
              <code style={{ fontFamily: 'var(--a2ui-font-mono)', fontSize: '0.8125rem' }}>
                {lastAction.componentType}.{lastAction.action}
              </code>
            </div>
            <button type="button" className="a2ui-btn a2ui-btn-outline a2ui-btn-sm" onClick={clearHistory}>
              Clear History ({actionHistory.length})
            </button>
          </div>
        )}

        {/* Component Showcase Tabs */}
        {(activeTab === 'all' || activeTab === 'decision') && (
          <section style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontFamily: 'var(--a2ui-font-serif)', color: 'var(--a2ui-cedar)', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              1. Decision Card
            </h2>
            <p style={{ color: 'var(--a2ui-ink-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Multi-choice weighted voting & selection cards supporting 2-4 structured choices, percentage weight bars, and pros/cons tradeoffs.
            </p>
            <A2UIDecisionCard payload={sampleDecisionPayload} onAction={handleAction} />
          </section>
        )}

        {(activeTab === 'all' || activeTab === 'slider') && (
          <section style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontFamily: 'var(--a2ui-font-serif)', color: 'var(--a2ui-cedar)', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              2. Parameter Slider
            </h2>
            <p style={{ color: 'var(--a2ui-ink-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Steppers and continuous range sliders with preset buttons, live unit tags, and safety danger zone boundaries.
            </p>
            <A2UIParameterSlider payload={sampleSliderPayload} onAction={handleAction} />
          </section>
        )}

        {(activeTab === 'all' || activeTab === 'approval') && (
          <section style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontFamily: 'var(--a2ui-font-serif)', color: 'var(--a2ui-cedar)', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              3. Human-in-the-Loop Approval Gate
            </h2>
            <p style={{ color: 'var(--a2ui-ink-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              High-leverage risk evaluation gate with confidence indicator, impact checklist, and one-click Approve / Reject / Edit actions.
            </p>
            <A2UIApprovalGate payload={sampleApprovalGatePayload} onAction={handleAction} />
          </section>
        )}

        {(activeTab === 'all' || activeTab === 'diff') && (
          <section style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontFamily: 'var(--a2ui-font-serif)', color: 'var(--a2ui-cedar)', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              4. Code & Text Diff Viewer
            </h2>
            <p style={{ color: 'var(--a2ui-ink-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Unified and split code diff viewer with line gutter numbers, additions/deletions highlighting, and clipboard copy.
            </p>
            <A2UIDiffViewer payload={sampleDiffViewerPayload} />
          </section>
        )}

        {(activeTab === 'all' || activeTab === 'progress') && (
          <section style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontFamily: 'var(--a2ui-font-serif)', color: 'var(--a2ui-cedar)', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              5. Progress Tracker Timeline
            </h2>
            <p style={{ color: 'var(--a2ui-ink-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Step-by-step agent lifecycle tracker with live states, duration tags, error alerts, and sub-task lists.
            </p>
            <A2UIProgressTracker payload={sampleProgressTrackerPayload} onAction={handleAction} />
          </section>
        )}

        {(activeTab === 'all' || activeTab === 'table') && (
          <section style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontFamily: 'var(--a2ui-font-serif)', color: 'var(--a2ui-cedar)', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              6. Data Table
            </h2>
            <p style={{ color: 'var(--a2ui-ink-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Tabular agent registry with column sorting, live search filter, row selection, pagination, and CSV export.
            </p>
            <A2UIDataTable payload={sampleDataTablePayload} onAction={handleAction} />
          </section>
        )}

        {activeTab === 'live' && (
          <section style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontFamily: 'var(--a2ui-font-serif)', color: 'var(--a2ui-cedar)', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              7. Universal Polymorphic A2UIRenderer Sandbox
            </h2>
            <p style={{ color: 'var(--a2ui-ink-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Paste any arbitrary A2UI JSON payload below to test dynamic validation and rendering.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--a2ui-cedar)', display: 'block', marginBottom: '0.5rem' }}>
                  A2UI JSON Payload
                </label>
                <textarea
                  style={{
                    width: '100%',
                    height: '400px',
                    fontFamily: 'var(--a2ui-font-mono)',
                    fontSize: '0.8125rem',
                    padding: '0.75rem',
                    borderRadius: 'var(--a2ui-radius-md)',
                    border: '1px solid var(--a2ui-stone-border)',
                    backgroundColor: '#FFFFFF',
                    boxSizing: 'border-box',
                  }}
                  value={customJSON}
                  onChange={(e) => setCustomJSON(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--a2ui-cedar)', display: 'block', marginBottom: '0.5rem' }}>
                  Rendered Warm Paper Output
                </label>
                <A2UIRenderer data={customJSON} onAction={handleAction} />
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer style={{ marginTop: '4rem', borderTop: '1px solid var(--a2ui-stone-border)', paddingTop: '1.5rem', textAlign: 'center', color: 'var(--a2ui-ink-subtle)', fontSize: '0.8125rem' }}>
          <p style={{ margin: 0 }}>
            Built by <strong>Nymrel</strong> / <strong>JalenBuilds LLC</strong> · Licensed under MIT · Dual-Audience Machine Trust & Human Elegance
          </p>
        </footer>
      </div>
    </div>
  );
};
