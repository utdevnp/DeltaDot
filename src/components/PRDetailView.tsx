import React from 'react';
import type { PRDetail } from '../../core/types.js';
import { timeAgo } from '../../core/utils.js';

interface PRDetailViewProps {
  prDetail: PRDetail | null;
  loading: boolean;
  error: string;
  ownAuthor?: string;
  gitUserName?: string;
  onBack: () => void;
  onReview: () => void;
  onApprove: (comment: string) => Promise<void>;
}

function stateColor(state: string): string {
  const normalized = state.toLowerCase();
  if (normalized === 'open') return 'var(--accent-green)';
  if (normalized === 'merged') return 'var(--accent-purple)';
  if (normalized === 'closed') return 'var(--accent-red)';
  return 'var(--text-secondary)';
}

function fileStatusColor(status: string): string {
  if (status === 'added') return 'var(--accent-green)';
  if (status === 'deleted') return 'var(--accent-red)';
  if (status === 'renamed') return 'var(--accent-purple)';
  return 'var(--accent-blue)';
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

function renderPatch(patch: string) {
  return patch.split('\n').map((line, index) => {
    const type = line.startsWith('@@') ? 'hunk' : line.startsWith('+++') || line.startsWith('---') ? 'file' : line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : 'context';
    return <span className={`pr-diff-line ${type}`} key={`${index}-${line}`}>{line || ' '}{index < patch.split('\n').length - 1 ? '\n' : ''}</span>;
  });
}

function CopyIcon() {
  return <svg className="repo-context-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" /></svg>;
}

function CopyableValue({ value, mono = false }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch { /* Clipboard access can be unavailable in restricted environments. */ }
  };

  return <span className={`pr-copyable-value${mono ? ' mono' : ''}`}>
    <span>{value}</span><button type="button" className="pr-copy-button" onClick={(event) => { event.stopPropagation(); void copy(); }} title={copied ? 'Copied' : `Copy ${value}`} aria-label={copied ? `${value} copied` : `Copy ${value}`}><CopyIcon /></button>
  </span>;
}

export function PRDetailView({ prDetail, loading, error, ownAuthor, gitUserName, onBack, onReview, onApprove }: PRDetailViewProps) {
  const [expandedFiles, setExpandedFiles] = React.useState<Set<string>>(new Set());
  const [approvalOpen, setApprovalOpen] = React.useState(false);
  const [approvalComment, setApprovalComment] = React.useState('');
  const [approvalSubmitting, setApprovalSubmitting] = React.useState(false);
  const [approvalError, setApprovalError] = React.useState('');
  const [approvalComplete, setApprovalComplete] = React.useState(false);

  React.useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable;
      if (approvalOpen && event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!approvalSubmitting) setApprovalOpen(false);
        return;
      }
      if (!typing && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setApprovalOpen(true);
        setApprovalError('');
      }
    };
    window.addEventListener('keydown', handleShortcut, true);
    return () => window.removeEventListener('keydown', handleShortcut, true);
  }, [approvalOpen, approvalSubmitting]);

  if (loading) return <div className="state-message">Loading PR detail...</div>;
  if (error) return <div className="state-message error">{error}</div>;
  if (!prDetail) return <div className="state-message">No pull request selected.</div>;

  const toggleFile = (path: string) => setExpandedFiles((previous) => {
    const next = new Set(previous);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  const submitApproval = async () => {
    if (approvalSubmitting || approvalComplete) return;
    setApprovalSubmitting(true);
    setApprovalError('');
    try {
      await onApprove(approvalComment.trim());
      setApprovalComplete(true);
    } catch (err) {
      setApprovalError(err instanceof Error ? err.message : String(err));
    } finally {
      setApprovalSubmitting(false);
    }
  };

  return (
    <div className="detail-view pr-detail-view">
      <div className="pr-detail-toolbar">
        <div className="pr-detail-toolbar-title"><strong>Pull Request Details</strong><span className="pr-detail-repo">{prDetail.repoName ? <CopyableValue value={prDetail.repoName} /> : 'Repository'}</span></div>
        <div className="pr-detail-toolbar-actions">
          {prDetail.url && <button type="button" className="detail-action-btn secondary" onClick={() => window.api.openUrl(prDetail.url)} title="Open pull request in provider">Open in provider</button>}
          <button type="button" className="detail-action-btn primary" onClick={onReview}>✦ Review with AI</button>
        </div>
        <button type="button" className="back-btn" onClick={onBack} aria-label="Back to pull requests" title="Back to pull requests">←</button>
      </div>

      <header className="pr-detail-hero">
        <div className="pr-detail-number">#{prDetail.number}</div>
        <h1>{prDetail.title}</h1>
        <div className="pr-detail-subline">
          <span className="pr-state-badge" style={{ color: stateColor(prDetail.state), borderColor: stateColor(prDetail.state), background: `color-mix(in srgb, ${stateColor(prDetail.state)} 12%, transparent)` }}>{prDetail.state}</span>
          {prDetail.draft && <span className="pr-detail-muted-badge">Draft</span>}
          <span>opened by <CopyableValue value={prDetail.author} /></span><span>updated {timeAgo(prDetail.updatedAt)} ago</span>
        </div>
      </header>

      <div className="pr-detail-stats" aria-label="Pull request summary">
        <div><span>Changes</span><strong><em>+{prDetail.additions ?? 0}</em> <i>-{prDetail.deletions ?? 0}</i></strong></div>
        <div><span>Files</span><strong>{prDetail.changedFiles ?? prDetail.files?.length ?? 0}</strong></div>
        <div><span>Commits</span><strong>{prDetail.commitsCount ?? prDetail.commits?.length ?? 0}</strong></div>
        <div><span>Comments</span><strong>{prDetail.commentsCount ?? prDetail.comments?.length ?? 0}</strong></div>
      </div>

      <div className="pr-info-grid">
        <div className="pr-info-item"><span>From</span><CopyableValue value={prDetail.sourceBranch} mono /></div>
        <div className="pr-info-item"><span>Into</span><CopyableValue value={prDetail.targetBranch} mono /></div>
        <div className="pr-info-item"><span>Created</span><strong title={new Date(prDetail.createdAt).toLocaleString()}>{timeAgo(prDetail.createdAt)} ago</strong></div>
        <div className="pr-info-item"><span>Updated</span><strong title={new Date(prDetail.updatedAt).toLocaleString()}>{timeAgo(prDetail.updatedAt)} ago</strong></div>
        {prDetail.mergedAt && <div className="pr-info-item"><span>Merged</span><strong title={new Date(prDetail.mergedAt).toLocaleString()}>{timeAgo(prDetail.mergedAt)} ago</strong></div>}
        <div className="pr-info-item"><span>Approved</span><strong className="pr-info-positive">{prDetail.approvedBy?.length ?? 0}</strong></div>
        <div className="pr-info-item"><span>Changes requested</span><strong className="pr-info-negative">{prDetail.changesRequestedBy?.length ?? 0}</strong></div>
        <div className="pr-info-item"><span>Review comments</span><strong>{prDetail.reviewCommentsCount ?? 0}</strong></div>
        <div className="pr-info-item"><span>Activity</span><strong>{(prDetail.commentsCount ?? prDetail.comments?.length ?? 0) + (prDetail.reviewCommentsCount ?? 0)} events</strong></div>
        <div className="pr-info-item"><span>Labels</span><strong>{prDetail.labels?.length ?? 0}</strong></div>
        <div className="pr-info-item"><span>Participants</span><strong>{new Set([prDetail.author, ...(prDetail.requestedReviewers ?? []), ...(prDetail.approvedBy ?? []), ...(prDetail.changesRequestedBy ?? []), ...(prDetail.commentedBy ?? [])].filter(Boolean)).size}</strong></div>
        <div className="pr-info-item"><span>Author</span><CopyableValue value={prDetail.author} /></div>
        <div className="pr-info-item"><span>Reviewers</span><span className="pr-info-value-list">{prDetail.requestedReviewers?.length ? prDetail.requestedReviewers.map((reviewer) => <CopyableValue key={reviewer} value={reviewer} />) : 'None assigned'}</span></div>
        <div className="pr-info-item"><span>Assignees</span><span className="pr-info-value-list">{prDetail.assignees?.length ? prDetail.assignees.map((assignee) => <CopyableValue key={assignee} value={assignee} />) : 'None assigned'}</span></div>
        {prDetail.mergedBy && <div className="pr-info-item"><span>Merged by</span><CopyableValue value={prDetail.mergedBy} /></div>}
        {prDetail.mergeCommitSha && <div className="pr-info-item"><span>Merge commit</span><CopyableValue value={prDetail.mergeCommitSha} mono /></div>}
      </div>

      {(prDetail.labels?.length || prDetail.approvedBy?.length || prDetail.changesRequestedBy?.length) ? <div className="pr-detail-chips">
        {prDetail.labels?.map((label) => <span key={label} className="pr-detail-chip">{label}</span>)}
        {prDetail.approvedBy?.map((reviewer) => <span key={`approved-${reviewer}`} className="pr-detail-chip success">✓ <CopyableValue value={reviewer} /></span>)}
        {prDetail.changesRequestedBy?.map((reviewer) => <span key={`changes-${reviewer}`} className="pr-detail-chip danger">! Changes requested by <CopyableValue value={reviewer} /></span>)}
      </div> : null}

      <div className="pr-detail-content-grid">
      {prDetail.description && <section className="detail-section pr-detail-section pr-description-section"><h2>Description</h2><div className="detail-body">{prDetail.description}</div></section>}

      {prDetail.files && prDetail.files.length > 0 && <section className="detail-section pr-detail-section pr-files-section">
        <div className="pr-section-heading"><h2>Files changed</h2><span>{prDetail.files.length} files</span></div>
        <div className="pr-file-list">{prDetail.files.map((file) => {
          const expanded = expandedFiles.has(file.path);
            const displayPath = file.previousPath ? `${file.previousPath} → ${file.path}` : file.path;
            return <div className="pr-file-item" key={file.path}>
            <div className={`pr-file-header${file.patch ? '' : ' no-patch'}`} onClick={() => file.patch && toggleFile(file.path)} onKeyDown={(event) => { if (file.patch && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggleFile(file.path); } }} role={file.patch ? 'button' : undefined} tabIndex={file.patch ? 0 : undefined} aria-expanded={file.patch ? expanded : undefined}>
              <span className="pr-file-chevron" style={{ transform: expanded ? 'rotate(90deg)' : undefined }}>›</span><span className="pr-file-status" style={{ color: fileStatusColor(file.status) }}>{file.status}</span>
              <span className="pr-file-path-copy"><CopyableValue value={displayPath} mono /></span><span className="pr-file-counts"><b>+{file.additions}</b> <i>-{file.deletions}</i></span>
            </div>{expanded && file.patch && <pre className="pr-file-diff">{renderPatch(file.patch)}</pre>}
          </div>;
        })}</div>
      </section>}

      {prDetail.comments && prDetail.comments.length > 0 && <section className="detail-section pr-detail-section pr-comments-section">
        <div className="pr-section-heading"><h2>Comments</h2><span>{prDetail.comments.length}</span></div>
        <div className="pr-comment-list">{prDetail.comments.map((comment) => {
          const author = ownAuthor && comment.author.toLowerCase() === ownAuthor.toLowerCase() ? (gitUserName || comment.author) : comment.author;
          return <article className="pr-comment" key={comment.id}><div className="pr-comment-avatar">{initials(author)}</div><div className="pr-comment-content">
            <div className="pr-comment-meta"><CopyableValue value={author} /><span>{new Date(comment.createdAt).toLocaleString()}</span>{comment.path && <code>{comment.path}{comment.line ? `:${comment.line}` : ''}</code>}</div><div className="pr-comment-body">{comment.body}</div>
          </div></article>;
        })}</div>
      </section>}
      {(!prDetail.comments || prDetail.comments.length === 0) && prDetail.files && prDetail.files.length > 0 && <section className="detail-section pr-detail-section pr-comments-section">
        <div className="pr-section-heading"><h2>Comments</h2><span>0</span></div>
        <div className="pr-empty-comments"><span>○</span><strong>No comments yet</strong><p>Discussion and review feedback will appear here.</p></div>
      </section>}
      </div>
      {approvalOpen && <div className="pr-search-overlay pr-approval-overlay" role="presentation" onClick={() => !approvalSubmitting && setApprovalOpen(false)}>
        <aside className="pr-search-drawer pr-approval-drawer" role="dialog" aria-modal="true" aria-labelledby="pr-approval-title" onClick={(event) => event.stopPropagation()}>
          <div className="pr-search-drawer-header"><div><div id="pr-approval-title" className="pr-search-key">Approve PR #{prDetail.number}</div><div className="pr-approval-subtitle">{prDetail.title}</div></div><button type="button" className="pr-search-close" onClick={() => setApprovalOpen(false)} aria-label="Close approval drawer">×</button></div>
          <div className="pr-search-drawer-body pr-approval-body">
            {approvalComplete ? <div className="pr-approval-success"><div className="pr-approval-success-icon">✓</div><strong>Pull request approved</strong><span>Your approval was submitted successfully.</span></div> : <>
              <div className="pr-approval-confirmation"><span className="pr-approval-icon">✓</span><div><strong>Confirm approval</strong><p>You are approving this pull request for merging.</p></div></div>
              <label className="pr-approval-comment-label" htmlFor="pr-approval-comment">Comment <span>optional · Enter to submit</span></label>
              <textarea id="pr-approval-comment" className="pr-approval-comment" value={approvalComment} onChange={(event) => setApprovalComment(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitApproval(); } }} placeholder="Leave a note with your approval…" autoFocus disabled={approvalSubmitting} />
              {approvalError && <div className="pr-approval-error">{approvalError}</div>}
            </>}
          </div>
          {!approvalComplete && <div className="pr-search-drawer-footer pr-approval-footer"><button type="button" className="pr-search-review-button pr-approve-button" onClick={() => void submitApproval()} disabled={approvalSubmitting}>{approvalSubmitting ? 'Submitting approval…' : 'Approve pull request'}</button><span className="pr-approval-hint">Press Enter to submit · Shift+Enter for a new line</span></div>}
        </aside>
      </div>}
    </div>
  );
}
