import React, { useState } from 'react';
import type { CommitDetail, CommitFile } from '../../core/types.js';

interface DetailViewProps {
  detail: CommitDetail;
  onBack: () => void;
  embedded?: boolean;
}

function DiffLine({ line }: { line: string }) {
  if (line.startsWith('@@')) {
    return (
      <div style={{
        padding: '1px 12px',
        background: 'var(--tint-blue)',
        color: 'var(--accent-blue)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        lineHeight: 1.5,
      }}>
        {line}
      </div>
    );
  }
  if (line.startsWith('+')) {
    return (
      <div style={{
        padding: '1px 12px',
        background: 'var(--tint-green)',
        color: 'var(--accent-green)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        lineHeight: 1.5,
      }}>
        <span style={{ userSelect: 'none', marginRight: 4, opacity: 0.5 }}>+</span>
        {line.slice(1)}
      </div>
    );
  }
  if (line.startsWith('-')) {
    return (
      <div style={{
        padding: '1px 12px',
        background: 'var(--tint-red)',
        color: 'var(--accent-red)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        lineHeight: 1.5,
      }}>
        <span style={{ userSelect: 'none', marginRight: 4, opacity: 0.5 }}>-</span>
        {line.slice(1)}
      </div>
    );
  }
  // Context line or header
  if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('index')) {
    return (
      <div style={{
        padding: '1px 12px',
        color: 'var(--text-dim)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        lineHeight: 1.5,
      }}>
        {line}
      </div>
    );
  }
  return (
    <div style={{
      padding: '1px 12px',
      color: 'var(--text-secondary)',
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      lineHeight: 1.5,
    }}>
      {line}
    </div>
  );
}

function FilePanel({ file, isExpanded, onToggle, compact = false }: { file: CommitFile; isExpanded: boolean; onToggle: () => void; compact?: boolean }) {
  const totalChanges = file.additions + file.deletions;
  const barWidth = 80;
  const addWidth = totalChanges > 0 ? (file.additions / totalChanges) * barWidth : 0;

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 6,
      overflow: 'hidden',
      marginBottom: 6,
    }}>
      {/* File header */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: compact ? 6 : 10,
          padding: compact ? '5px 7px' : '8px 12px',
          background: 'var(--bg-tertiary)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
      >
        {/* Status icon */}
        <span style={{ flexShrink: 0, fontSize: compact ? 10 : 12, lineHeight: 1 }}>
          {file.status === 'added' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2">
              <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          ) : file.status === 'deleted' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-yellow)" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          )}
        </span>

        {/* File path */}
        <span style={{
          flex: 1,
          fontFamily: 'var(--font-mono)',
          fontSize: compact ? 11 : 13,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {file.path}
        </span>

        {/* Change bar */}
        <div style={{
          width: compact ? 58 : barWidth,
          height: compact ? 7 : 10,
          borderRadius: 5,
          background: 'var(--bg-primary)',
          overflow: 'hidden',
          flexShrink: 0,
          display: 'flex',
        }}>
          <div style={{
            width: addWidth,
            height: '100%',
            background: 'var(--accent-green)',
            transition: 'width 0.2s',
          }} />
          <div style={{
            flex: 1,
            height: '100%',
            background: 'var(--accent-red)',
            transition: 'width 0.2s',
          }} />
        </div>

        {/* Counts */}
        <span style={{ fontSize: compact ? 9 : 11, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
          {file.additions > 0 && <span style={{ color: 'var(--accent-green)' }}>+{file.additions}</span>}
          {file.additions > 0 && file.deletions > 0 && <span style={{ color: 'var(--text-dim)' }}> </span>}
          {file.deletions > 0 && <span style={{ color: 'var(--accent-red)' }}>-{file.deletions}</span>}
        </span>

        {/* Expand icon */}
        <span style={{ color: 'var(--text-dim)', fontSize: compact ? 8 : 10, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          ▶
        </span>
      </div>

      {/* Diff content */}
      {isExpanded && file.patch && (
        <div style={{
          borderTop: '1px solid var(--border)',
          maxHeight: 400,
          overflowY: 'auto',
        }}>
          {file.patch.split('\n').map((line, i) => (
            <DiffLine key={i} line={line} />
          ))}
        </div>
      )}
      {isExpanded && !file.patch && (
        <div style={{
          padding: '16px',
          textAlign: 'center',
          color: 'var(--text-dim)',
          fontSize: 12,
          borderTop: '1px solid var(--border)',
        }}>
          {file.status === 'deleted' ? 'File was deleted — no diff available' : 'Binary file — no diff available'}
        </div>
      )}
    </div>
  );
}

export function DetailView({ detail, onBack, embedded = false }: DetailViewProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showAllDiffs, setShowAllDiffs] = useState(false);

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const files = detail.files ?? [];
  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);
  const totalChanges = totalAdditions + totalDeletions;

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {/* Back + meta bar */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        padding: embedded ? '8px 12px' : '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {detail.subject}
          </div>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-dim)',
          flexShrink: 0,
        }}>
          {detail.hash.slice(0, 7)}
        </span>
        {!embedded && <button className="back-btn" onClick={onBack}>←</button>}
      </div>

      {/* Meta section */}
      <div style={{
        padding: embedded ? '10px 12px' : '12px 16px',
        display: 'flex',
        gap: 20,
        flexWrap: 'wrap',
        borderBottom: '1px solid var(--border)',
        fontSize: 13,
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-dim)' }}>Author:</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{detail.author}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-dim)' }}>Date:</span>
          <span style={{ color: 'var(--text-secondary)' }}>{detail.date}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-dim)' }}>Files:</span>
          <span style={{ color: 'var(--text-secondary)' }}>{files.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-dim)' }}>Changes:</span>
          <span style={{ color: 'var(--accent-green)' }}>+{totalAdditions}</span>
          <span style={{ color: 'var(--accent-red)' }}>-{totalDeletions}</span>
        </div>
      </div>

      {/* Body (commit message) */}
      {detail.body && (
        <div style={{
          margin: embedded ? '6px 12px 3px' : '12px 16px',
          padding: '10px 14px',
          background: 'var(--bg-tertiary)',
          borderRadius: 6,
          border: '1px solid var(--border)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap',
        }}>
          {detail.body}
        </div>
      )}

      {/* File list + diffs */}
      {files.length > 0 && (
        <div style={{ padding: embedded ? '6px 12px 12px' : '0 16px 16px' }}>
          {/* Summary bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            minHeight: 22,
            padding: '1px 4px',
            marginBottom: 2,
            border: '1px solid var(--border)',
            borderRadius: 5,
            background: 'var(--bg-tertiary)',
          }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 10, fontWeight: 650, letterSpacing: '0.25px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Files Changed ({files.length})
            </div>
            <span style={{ font: '9px var(--font-mono)', color: 'var(--accent-green)' }}>+{totalAdditions}</span>
            <span style={{ font: '9px var(--font-mono)', color: 'var(--accent-red)' }}>-{totalDeletions}</span>
            <button
              type="button"
              className="detail-action-btn secondary"
              onClick={() => {
                const allExpanded = expandedFiles.size === files.length;
                setExpandedFiles(new Set(allExpanded ? [] : files.map((f) => f.path)));
              }}
              style={{
                minHeight: 21,
                padding: '2px 7px',
                fontSize: 9,
              }}
            >
              {expandedFiles.size === files.length ? 'Collapse all' : 'Expand all'}
            </button>
          </div>

          {/* Change bar graph */}
          {totalChanges > 0 && (
            <div style={{
              height: 4,
              borderRadius: 2,
              overflow: 'hidden',
              background: 'var(--bg-primary)',
              marginBottom: 12,
              display: 'flex',
            }}>
              {totalAdditions > 0 && (
                <div style={{
                  flex: totalAdditions / totalChanges,
                  background: 'var(--accent-green)',
                }} />
              )}
              {totalDeletions > 0 && (
                <div style={{
                  flex: totalDeletions / totalChanges,
                  background: 'var(--accent-red)',
                }} />
              )}
            </div>
          )}

          {/* Files */}
          {files.map((file) => (
            <FilePanel
              key={file.path}
              file={file}
              isExpanded={expandedFiles.has(file.path)}
              compact={embedded}
              onToggle={() => toggleFile(file.path)}
            />
          ))}
        </div>
      )}

      {/* Stat (fallback) */}
      {files.length === 0 && detail.stat && (
        <div style={{
          margin: embedded ? '0 12px 12px' : '0 16px 16px',
          padding: '10px 14px',
          background: 'var(--bg-secondary)',
          borderRadius: 6,
          border: '1px solid var(--border)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
          whiteSpace: 'pre',
        }}>
          {detail.stat}
        </div>
      )}
    </div>
  );
}
