import React from 'react';
import type { PRDetail } from '../../core/types.js';
import { timeAgo } from '../../core/utils.js';

interface PRDetailViewProps {
  prDetail: PRDetail;
  loading: boolean;
  error: string;
  ownAuthor?: string;
  gitUserName?: string;
  onBack: () => void;
  onReview: () => void;
}

export function PRDetailView({ prDetail, loading, error, ownAuthor, gitUserName, onBack, onReview }: PRDetailViewProps) {
  if (loading) {
    return <div className="state-message">Loading PR detail...</div>;
  }

  if (error) {
    return <div className="state-message error">{error}</div>;
  }

  return (
    <div className="detail-view">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="back-btn" onClick={onReview} style={{ color: 'var(--accent-blue)' }}>
          Review
        </button>
        <div style={{ flex: 1 }} />
        <button className="back-btn" onClick={onBack}>←</button>
      </div>

      <div className="detail-header">
        <h2>#{prDetail.number} — {prDetail.title}</h2>
      </div>

      <div className="detail-meta">
        <span className="meta-label">State</span>
        <span className="meta-value">
          <span className={`pr-state ${prDetail.state.toLowerCase()}`}>{prDetail.state}</span>
          {prDetail.draft && <span className="pr-state draft" style={{ marginLeft: 6 }}>DRAFT</span>}
        </span>
        <span className="meta-label">Author</span>
        <span className="meta-value">{prDetail.author}</span>
        <span className="meta-label">Branch</span>
        <span className="meta-value" style={{ fontFamily: 'var(--font-mono)' }}>
          {prDetail.sourceBranch} → {prDetail.targetBranch}
        </span>
        <span className="meta-label">Created</span>
        <span className="meta-value">{new Date(prDetail.createdAt).toLocaleString()} ({timeAgo(prDetail.createdAt)} ago)</span>
        <span className="meta-label">Updated</span>
        <span className="meta-value">{new Date(prDetail.updatedAt).toLocaleString()}</span>
        {prDetail.additions !== undefined && (
          <>
            <span className="meta-label">Changes</span>
            <span className="meta-value" style={{ fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--accent-green)' }}>+{prDetail.additions}</span>{' '}
              <span style={{ color: 'var(--accent-red)' }}>-{prDetail.deletions}</span>
              {' · '}{prDetail.changedFiles} files{prDetail.commitsCount ? ` · ${prDetail.commitsCount} commits` : ''}
            </span>
          </>
        )}
        {prDetail.labels && prDetail.labels.length > 0 && (
          <>
            <span className="meta-label">Labels</span>
            <span className="meta-value">{prDetail.labels.join(', ')}</span>
          </>
        )}
        {prDetail.approvedBy && prDetail.approvedBy.length > 0 && (
          <>
            <span className="meta-label">Approved by</span>
            <span className="meta-value" style={{ color: 'var(--accent-green)' }}>{prDetail.approvedBy.join(', ')}</span>
          </>
        )}
        {prDetail.requestedReviewers && prDetail.requestedReviewers.length > 0 && (
          <>
            <span className="meta-label">Reviewers</span>
            <span className="meta-value">{prDetail.requestedReviewers.join(', ')}</span>
          </>
        )}
      </div>

      {prDetail.description && (
        <div className="detail-section">
          <h3>Description</h3>
          <div className="detail-body">{prDetail.description}</div>
        </div>
      )}

      {prDetail.files && prDetail.files.length > 0 && (
        <div className="detail-section">
          <h3>Files Changed ({prDetail.files.length})</h3>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {prDetail.files.map((f) => (
              <div key={f.path} style={{ padding: '2px 0', display: 'flex', gap: 8 }}>
                <span style={{
                  color: f.status === 'added' ? 'var(--accent-green)' : f.status === 'deleted' ? 'var(--accent-red)' : 'var(--text-secondary)',
                  minWidth: 60,
                }}>
                  {f.status}
                </span>
                <span style={{ flex: 1, color: 'var(--text-primary)' }}>{f.path}</span>
                {f.additions > 0 && <span style={{ color: 'var(--accent-green)' }}>+{f.additions}</span>}
                {f.deletions > 0 && <span style={{ color: 'var(--accent-red)' }}>-{f.deletions}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {prDetail.comments && prDetail.comments.length > 0 && (
        <div className="detail-section">
          <h3>Comments ({prDetail.comments.length})</h3>
          {prDetail.comments.map((c) => (
            <div key={c.id} style={{
              padding: 8,
              marginBottom: 8,
              background: 'var(--bg-secondary)',
              borderRadius: 6,
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>
                  {ownAuthor && c.author.toLowerCase() === ownAuthor.toLowerCase()
                    ? (gitUserName || c.author)
                    : c.author}
                </strong>
                {' · '}{c.path && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-yellow)' }}>{c.path}{c.line ? `:${c.line}` : ''}</span>}
                {' · '}{new Date(c.createdAt).toLocaleString()}
              </div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{c.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
