import React, { useState } from 'react';
import type { CommitDetail, CommitFile } from '../../core/types.js';

interface DetailViewProps {
  detail: CommitDetail;
  onBack: () => void;
}

function DiffLine({ line }: { line: string }) {
  if (line.startsWith('@@')) {
    return (
      <div style={{
        padding: '1px 12px',
        background: 'rgba(56,139,253,0.08)',
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
        background: 'rgba(63,185,80,0.12)',
        color: '#3fb950',
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
        background: 'rgba(248,81,73,0.1)',
        color: '#f85149',
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

function FilePanel({ file, isExpanded, onToggle }: { file: CommitFile; isExpanded: boolean; onToggle: () => void }) {
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
          gap: 10,
          padding: '8px 12px',
          background: 'var(--bg-tertiary)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
      >
        {/* Status icon */}
        <span style={{ flexShrink: 0, fontSize: 12, lineHeight: 1 }}>
          {file.status === 'added' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2">
              <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          ) : file.status === 'deleted' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f85149" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d29922" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          )}
        </span>

        {/* File path */}
        <span style={{
          flex: 1,
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {file.path}
        </span>

        {/* Change bar */}
        <div style={{
          width: barWidth,
          height: 10,
          borderRadius: 5,
          background: 'var(--bg-primary)',
          overflow: 'hidden',
          flexShrink: 0,
          display: 'flex',
        }}>
          <div style={{
            width: addWidth,
            height: '100%',
            background: '#3fb950',
            transition: 'width 0.2s',
          }} />
          <div style={{
            flex: 1,
            height: '100%',
            background: '#f85149',
            transition: 'width 0.2s',
          }} />
        </div>

        {/* Counts */}
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
          {file.additions > 0 && <span style={{ color: '#3fb950' }}>+{file.additions}</span>}
          {file.additions > 0 && file.deletions > 0 && <span style={{ color: 'var(--text-dim)' }}> </span>}
          {file.deletions > 0 && <span style={{ color: '#f85149' }}>-{file.deletions}</span>}
        </span>

        {/* Expand icon */}
        <span style={{ color: 'var(--text-dim)', fontSize: 10, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
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

export function DetailView({ detail, onBack }: DetailViewProps) {
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
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <button className="back-btn" onClick={onBack} style={{ marginBottom: 0 }}>← Back</button>
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
      </div>

      {/* Meta section */}
      <div style={{
        padding: '12px 16px',
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
          <span style={{ color: '#3fb950' }}>+{totalAdditions}</span>
          <span style={{ color: '#f85149' }}>-{totalDeletions}</span>
        </div>
      </div>

      {/* Body (commit message) */}
      {detail.body && (
        <div style={{
          margin: '12px 16px',
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
        <div style={{ padding: '0 16px 16px' }}>
          {/* Summary bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Files Changed ({files.length})
            </div>
            <button
              onClick={() => {
                const allExpanded = expandedFiles.size === files.length;
                setExpandedFiles(new Set(allExpanded ? [] : files.map((f) => f.path)));
              }}
              style={{
                padding: '4px 12px',
                borderRadius: 4,
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {expandedFiles.size === files.length ? 'Collapse All' : 'Expand All'}
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
                  background: '#3fb950',
                }} />
              )}
              {totalDeletions > 0 && (
                <div style={{
                  flex: totalDeletions / totalChanges,
                  background: '#f85149',
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
              onToggle={() => toggleFile(file.path)}
            />
          ))}
        </div>
      )}

      {/* Stat (fallback) */}
      {files.length === 0 && detail.stat && (
        <div style={{
          margin: '0 16px 16px',
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
