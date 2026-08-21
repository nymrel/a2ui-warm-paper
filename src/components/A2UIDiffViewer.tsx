import React, { useState } from 'react';
import { A2UIDiffViewerPayload, A2UIDiffViewMode } from '../types';

export interface A2UIDiffViewerProps {
  payload: A2UIDiffViewerPayload;
  className?: string;
  style?: React.CSSProperties;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  oldLineNum?: number;
  newLineNum?: number;
  content: string;
}

function computeSimpleDiff(original: string, modified: string): DiffLine[] {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const result: DiffLine[] = [];

  let i = 0;
  let j = 0;

  while (i < origLines.length || j < modLines.length) {
    if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
      result.push({
        type: 'unchanged',
        oldLineNum: i + 1,
        newLineNum: j + 1,
        content: origLines[i] || '',
      });
      i++;
      j++;
    } else {
      // Find if orig line appears later in mod
      let foundInMod = -1;
      for (let k = j; k < Math.min(j + 5, modLines.length); k++) {
        if (origLines[i] === modLines[k]) {
          foundInMod = k;
          break;
        }
      }

      if (foundInMod !== -1) {
        // Mod has added lines before matching
        while (j < foundInMod) {
          result.push({
            type: 'added',
            newLineNum: j + 1,
            content: modLines[j] || '',
          });
          j++;
        }
      } else if (i < origLines.length) {
        // Orig line removed
        result.push({
          type: 'removed',
          oldLineNum: i + 1,
          content: origLines[i] || '',
        });
        i++;
      } else if (j < modLines.length) {
        // Mod line added
        result.push({
          type: 'added',
          newLineNum: j + 1,
          content: modLines[j] || '',
        });
        j++;
      }
    }
  }

  return result;
}

export const A2UIDiffViewer: React.FC<A2UIDiffViewerProps> = ({
  payload,
  className = '',
  style,
}) => {
  const [mode, setMode] = useState<A2UIDiffViewMode>(payload.viewMode || 'unified');
  const [copied, setCopied] = useState<boolean>(false);

  const diffLines = computeSimpleDiff(payload.originalContent, payload.modifiedContent);

  const additions = payload.summary?.additions ?? diffLines.filter((l) => l.type === 'added').length;
  const deletions = payload.summary?.deletions ?? diffLines.filter((l) => l.type === 'removed').length;

  const handleCopyModified = async () => {
    try {
      await navigator.clipboard.writeText(payload.modifiedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      id={`a2ui-diff-${payload.id}`}
      className={`a2ui-container ${className}`}
      style={style}
    >
      <div className="a2ui-diff-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span className="a2ui-diff-filename">{payload.filename || 'Source Diff'}</span>
          {payload.language && (
            <span className="a2ui-badge a2ui-badge-muted" style={{ fontSize: '0.6875rem' }}>
              {payload.language}
            </span>
          )}
          <span className="a2ui-badge a2ui-badge-sage" style={{ fontSize: '0.6875rem' }}>
            +{additions}
          </span>
          <span className="a2ui-badge a2ui-badge-rust" style={{ fontSize: '0.6875rem' }}>
            -{deletions}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {payload.allowModeToggle !== false && (
            <div style={{ display: 'flex', border: '1px solid var(--a2ui-stone-border)', borderRadius: 'var(--a2ui-radius-sm)', overflow: 'hidden' }}>
              <button
                type="button"
                className={`a2ui-btn ${mode === 'unified' ? 'a2ui-btn-primary' : 'a2ui-btn-secondary'} a2ui-btn-sm`}
                style={{ borderRadius: 0, padding: '0.2rem 0.5rem' }}
                onClick={() => setMode('unified')}
              >
                Unified
              </button>
              <button
                type="button"
                className={`a2ui-btn ${mode === 'split' ? 'a2ui-btn-primary' : 'a2ui-btn-secondary'} a2ui-btn-sm`}
                style={{ borderRadius: 0, padding: '0.2rem 0.5rem' }}
                onClick={() => setMode('split')}
              >
                Split
              </button>
            </div>
          )}

          {payload.copyable !== false && (
            <button
              type="button"
              className="a2ui-btn a2ui-btn-secondary a2ui-btn-sm"
              onClick={handleCopyModified}
              style={{ padding: '0.2rem 0.5rem' }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>

      <div className="a2ui-diff-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {mode === 'unified' ? (
          <table className="a2ui-diff-table">
            <tbody>
              {diffLines.map((line, idx) => {
                const rowClass =
                  line.type === 'added'
                    ? 'a2ui-diff-added'
                    : line.type === 'removed'
                    ? 'a2ui-diff-removed'
                    : 'a2ui-diff-unchanged';
                const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

                return (
                  <tr key={idx} className={`a2ui-diff-row ${rowClass}`}>
                    <td className="a2ui-diff-gutter" style={{ width: '35px' }}>
                      {line.oldLineNum ?? ''}
                    </td>
                    <td className="a2ui-diff-gutter" style={{ width: '35px' }}>
                      {line.newLineNum ?? ''}
                    </td>
                    <td className="a2ui-diff-content">
                      <span style={{ userSelect: 'none', marginRight: '0.35rem', opacity: 0.7 }}>
                        {prefix}
                      </span>
                      {line.content}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ borderRight: '1px solid var(--a2ui-stone-border)' }}>
              <div style={{ padding: '0.25rem 0.5rem', background: 'var(--a2ui-paper-soft)', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--a2ui-ink-subtle)' }}>
                Original
              </div>
              <pre style={{ margin: 0, padding: '0.5rem', fontSize: '0.75rem', overflowX: 'auto', backgroundColor: '#FFF' }}>
                {payload.originalContent}
              </pre>
            </div>
            <div>
              <div style={{ padding: '0.25rem 0.5rem', background: 'var(--a2ui-paper-soft)', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--a2ui-ink-subtle)' }}>
                Modified
              </div>
              <pre style={{ margin: 0, padding: '0.5rem', fontSize: '0.75rem', overflowX: 'auto', backgroundColor: '#FFF' }}>
                {payload.modifiedContent}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
