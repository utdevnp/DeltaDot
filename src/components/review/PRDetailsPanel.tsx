import React, { useState } from 'react';
import type { PRDetail } from '../../../core/types.js';
import { timeAgo } from '../../../core/utils.js';

interface PRDetailsPanelProps {
  prDetail: PRDetail | null;
  loading: boolean;
  error: string;
}

const statusColor = (status: string) =>
  status === 'added' ? 'var(--accent-green)'
    : status === 'deleted' ? 'var(--accent-red)'
    : status === 'modified' ? 'var(--accent-orange)'
    : 'var(--text-secondary)';

/**
 * Renders the patch text of a file with simple diff coloring.
 */
function DiffView({ patch }: { patch: string }) {
  return (
    <div className="pr-file-diff">
      {patch.split('\n').map((line, i) => {
        let color = 'var(--text-secondary)';
        if (line.startsWith('+')) color = 'var(--accent-green)';
        else if (line.startsWith('-')) color = 'var(--accent-red)';
        else if (line.startsWith('@@')) color = 'var(--accent-cyan)';
        return (
          <div key={i} style={{ color, minHeight: 15 }}>
            {line || ' '}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Displays the pull request details: basic info in a 4-column grid and the
 * changed files in collapsible rows with their diffs.
 */
export function PRDetailsPanel({ prDetail, loading, error }: PRDetailsPanelProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (loading) {
    return <div className="loading">Loading PR details... <span className="loading-dots" /></div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!prDetail) {
    return <div className="state-message">No PR details available</div>;
  }

  const metaCards: { label: string; value: React.ReactNode }[] = [
    {
      label: 'State',
      value: (
        <span>
          <span className={`pr-state ${prDetail.state.toLowerCase()}`}>{prDetail.state}</span>
          {prDetail.draft && <span className="pr-state draft" style={{ marginLeft: 6 }}>DRAFT</span>}
        </span>
      ),
    },
    { label: 'Author', value: prDetail.author },
    {
      label: 'Branch',
      value: (
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          {prDetail.sourceBranch} → {prDetail.targetBranch}
        </span>
      ),
    },
    {
      label: 'Created',
      value: (
        <>
          {new Date(prDetail.createdAt).toLocaleString()}
          <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>({timeAgo(prDetail.createdAt)} ago)</span>
        </>
      ),
    },
    { label: 'Updated', value: new Date(prDetail.updatedAt).toLocaleString() },
  ];

  if (prDetail.additions !== undefined) {
    metaCards.push({
      label: 'Changes',
      value: (
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: 'var(--accent-green)' }}>+{prDetail.additions}</span>{' '}
          <span style={{ color: 'var(--accent-red)' }}>-{prDetail.deletions}</span>
          {' · '}{prDetail.changedFiles} files{prDetail.commitsCount ? ` · ${prDetail.commitsCount} commits` : ''}
        </span>
      ),
    });
  }

  if (prDetail.labels && prDetail.labels.length > 0) {
    metaCards.push({ label: 'Labels', value: prDetail.labels.join(', ') });
  }

  if (prDetail.approvedBy && prDetail.approvedBy.length > 0) {
    metaCards.push({
      label: 'Approved by',
      value: <span style={{ color: 'var(--accent-green)' }}>{prDetail.approvedBy.join(', ')}</span>,
    });
  }

  if (prDetail.requestedReviewers && prDetail.requestedReviewers.length > 0) {
    metaCards.push({ label: 'Reviewers', value: prDetail.requestedReviewers.join(', ') });
  }

  return (
    <div className="detail-view" style={{ padding: 0 }}>
      <div className="detail-header">
        <h2>#{prDetail.number} — {prDetail.title}</h2>
      </div>

      {/* Basic info — 4-column grid */}
      <div className="pr-meta-grid">
        {metaCards.map((card) => (
          <div key={card.label} className="pr-meta-card">
            <div className="label">{card.label}</div>
            <div className="value">{card.value}</div>
          </div>
        ))}
      </div>

      {prDetail.description && (
        <div className="detail-section">
          <h3>Description</h3>
          <div className="detail-body">{prDetail.description}</div>
        </div>
      )}

      {/* Files changed — collapsible */}
      {prDetail.files && prDetail.files.length > 0 && (
        <div className="detail-section">
          <h3>Files Changed ({prDetail.files.length})</h3>
          <div>
            {prDetail.files.map((f) => {
              const expanded = expandedFiles.has(f.path);
              return (
                <div key={f.path} className="pr-file-item">
                  <div className="pr-file-header" onClick={() => toggleFile(f.path)} title={expanded ? 'Collapse' : 'Expand diff'}>
                    <span className="pr-file-chevron" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                    <span className="pr-file-status" style={{ color: statusColor(f.status) }}>{f.status}</span>
                    <span className="pr-file-path">{f.path}</span>
                    {f.additions > 0 && <span style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', fontSize: 12, flexShrink: 0 }}>+{f.additions}</span>}
                    {f.deletions > 0 && <span style={{ color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', fontSize: 12, flexShrink: 0 }}>-{f.deletions}</span>}
                  </div>
                  {expanded && (
                    f.patch ? <DiffView patch={f.patch} /> : <div className="pr-file-diff" style={{ color: 'var(--text-dim)' }}>(no diff available)</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
