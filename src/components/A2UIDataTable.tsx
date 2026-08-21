import React, { useState, useMemo } from 'react';
import { A2UIDataTablePayload, A2UIDataTableColumn, A2UIActionHandler } from '../types';

export interface A2UIDataTableProps {
  payload: A2UIDataTablePayload;
  onAction?: A2UIActionHandler;
  className?: string;
  style?: React.CSSProperties;
}

export const A2UIDataTable: React.FC<A2UIDataTableProps> = ({
  payload,
  onAction,
  className = '',
  style,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([]);

  const pageSize = payload.pagination?.pageSize || 10;

  const handleSort = (colKey: string, sortable?: boolean) => {
    if (!sortable) return;
    if (sortKey === colKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(colKey);
      setSortAsc(true);
    }
  };

  const filteredRows = useMemo(() => {
    let list = [...payload.rows];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((r) =>
        Object.values(r).some((v) => String(v).toLowerCase().includes(q))
      );
    }

    if (sortKey) {
      list.sort((a, b) => {
        const valA = a[sortKey];
        const valB = b[sortKey];
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        if (valA < valB) return sortAsc ? -1 : 1;
        return sortAsc ? 1 : -1;
      });
    }

    return list;
  }, [payload.rows, searchTerm, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSelectRow = (index: number) => {
    if (!payload.selectable) return;
    let newSelected: number[];
    if (selectedRowIndices.includes(index)) {
      newSelected = selectedRowIndices.filter((i) => i !== index);
    } else {
      newSelected = [...selectedRowIndices, index];
    }
    setSelectedRowIndices(newSelected);

    if (onAction) {
      onAction({
        componentId: payload.id,
        componentType: 'data_table',
        action: 'row_select',
        payload: {
          selectedIndices: newSelected,
          selectedRows: newSelected.map((i) => payload.rows[i]),
        },
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleExportCSV = () => {
    const headers = payload.columns.map((c) => `"${c.header}"`).join(',');
    const rows = filteredRows.map((r) =>
      payload.columns.map((c) => `"${String(r[c.key] ?? '')}"`).join(',')
    );
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${payload.title || 'data-export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderCellContent = (column: A2UIDataTableColumn, value: unknown) => {
    if (value === null || value === undefined) {
      return <span style={{ color: 'var(--a2ui-ink-faint)' }}>—</span>;
    }

    switch (column.type) {
      case 'badge':
        return <span className="a2ui-badge a2ui-badge-cedar">{String(value)}</span>;
      case 'boolean':
        return value ? (
          <span className="a2ui-badge a2ui-badge-sage">Yes</span>
        ) : (
          <span className="a2ui-badge a2ui-badge-muted">No</span>
        );
      case 'code':
        return (
          <code style={{ fontFamily: 'var(--a2ui-font-mono)', fontSize: '0.8125rem', backgroundColor: 'var(--a2ui-paper-soft)', padding: '0.15rem 0.35rem', borderRadius: '4px' }}>
            {String(value)}
          </code>
        );
      case 'link':
        return (
          <a
            href={String(value)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--a2ui-terracotta)', textDecoration: 'underline' }}
          >
            {String(value)}
          </a>
        );
      case 'number':
        return <span style={{ fontFamily: 'var(--a2ui-font-mono)' }}>{Number(value).toLocaleString()}</span>;
      default:
        return String(value);
    }
  };

  return (
    <div
      id={`a2ui-table-${payload.id}`}
      className={`a2ui-container ${className}`}
      style={style}
    >
      <div className="a2ui-header">
        <div className="a2ui-header-left">
          <div className="a2ui-title-group">
            <h4 className="a2ui-title">{payload.title || 'Data Records'}</h4>
            {payload.subtitle && <p className="a2ui-subtitle">{payload.subtitle}</p>}
          </div>
          <span className="a2ui-badge a2ui-badge-muted">{filteredRows.length} Rows</span>
        </div>

        <div className="a2ui-header-right">
          {payload.exportable && (
            <button
              type="button"
              className="a2ui-btn a2ui-btn-secondary a2ui-btn-sm"
              onClick={handleExportCSV}
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      <div className="a2ui-body">
        {payload.searchable && (
          <div className="a2ui-table-toolbar">
            <input
              type="text"
              className="a2ui-search-input"
              placeholder="Filter records..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        )}

        <div className="a2ui-table-container">
          <table className="a2ui-data-table">
            <thead>
              <tr>
                {payload.selectable && (
                  <th style={{ width: '35px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={
                        pageRows.length > 0 &&
                        pageRows.every((_, idx) =>
                          selectedRowIndices.includes((currentPage - 1) * pageSize + idx)
                        )
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          const currentIndices = pageRows.map(
                            (_, idx) => (currentPage - 1) * pageSize + idx
                          );
                          setSelectedRowIndices(Array.from(new Set([...selectedRowIndices, ...currentIndices])));
                        } else {
                          const currentIndices = pageRows.map(
                            (_, idx) => (currentPage - 1) * pageSize + idx
                          );
                          setSelectedRowIndices(
                            selectedRowIndices.filter((i) => !currentIndices.includes(i))
                          );
                        }
                      }}
                    />
                  </th>
                )}
                {payload.columns.map((col) => (
                  <th
                    key={col.key}
                    className={col.sortable ? 'sortable' : ''}
                    style={{ textAlign: col.align || 'left', width: col.width }}
                    onClick={() => handleSort(col.key, col.sortable)}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      {col.header}
                      {col.sortable && sortKey === col.key && (
                        <span>{sortAsc ? '▲' : '▼'}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={payload.columns.length + (payload.selectable ? 1 : 0)}
                    style={{ textAlign: 'center', padding: '2rem', color: 'var(--a2ui-ink-subtle)' }}
                  >
                    {payload.emptyMessage || 'No matching records found.'}
                  </td>
                </tr>
              ) : (
                pageRows.map((row, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx;
                  const isSelected = selectedRowIndices.includes(globalIdx);

                  return (
                    <tr
                      key={globalIdx}
                      style={{
                        backgroundColor: isSelected ? 'var(--a2ui-terracotta-bg)' : undefined,
                        cursor: payload.selectable ? 'pointer' : undefined,
                      }}
                      onClick={() => toggleSelectRow(globalIdx)}
                    >
                      {payload.selectable && (
                        <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(globalIdx)}
                          />
                        </td>
                      )}
                      {payload.columns.map((col) => (
                        <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                          {renderCellContent(col, row[col.key])}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '1rem',
              fontSize: '0.8125rem',
            }}
          >
            <span style={{ color: 'var(--a2ui-ink-subtle)' }}>
              Page {currentPage} of {totalPages}
            </span>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              <button
                type="button"
                className="a2ui-btn a2ui-btn-secondary a2ui-btn-sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                ← Previous
              </button>
              <button
                type="button"
                className="a2ui-btn a2ui-btn-secondary a2ui-btn-sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
