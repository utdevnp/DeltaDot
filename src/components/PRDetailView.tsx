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
  onFindRelatedPRs: () => Promise<void>;
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

function PersonAvatar({ name, tone = 'blue' }: { name: string; tone?: 'blue' | 'purple' | 'green' }) {
  return <span className={`pr-person-avatar ${tone}`}>{initials(name)}</span>;
}

function FactIcon({ type }: { type: 'files' | 'add' | 'remove' | 'commits' | 'conversation' | 'clock' | 'merge' }) {
  const paths: Record<string, React.ReactNode> = {
    files: <><path d="M5 3h9l4 4v14H5z" /><path d="M14 3v5h4" /></>,
    add: <><path d="M12 5v14M5 12h14" /></>,
    remove: <path d="M5 12h14" />,
    commits: <><path d="M6 4v16M18 4v5a4 4 0 0 1-4 4H6" /><circle cx="6" cy="4" r="2" /><circle cx="6" cy="20" r="2" /><circle cx="18" cy="4" r="2" /></>,
    conversation: <><path d="M5 6h14v10H9l-4 3z" /><path d="M8 10h8M8 13h5" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    merge: <><path d="M6 4v16M18 4v5a4 4 0 0 1-4 4H6" /><circle cx="6" cy="4" r="2" /><circle cx="6" cy="20" r="2" /><circle cx="18" cy="4" r="2" /></>,
  };
  return <svg className={`pr-fact-icon ${type}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg>;
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

export function PRDetailView({ prDetail, loading, error, ownAuthor, gitUserName, onBack, onReview, onApprove, onFindRelatedPRs }: PRDetailViewProps) {
  const [expandedFiles, setExpandedFiles] = React.useState<Set<string>>(new Set());
  const [fileQuery, setFileQuery] = React.useState('');
  const [approvalOpen, setApprovalOpen] = React.useState(false);
  const [approvalComment, setApprovalComment] = React.useState('');
  const [approvalSubmitting, setApprovalSubmitting] = React.useState(false);
  const [approvalError, setApprovalError] = React.useState('');
  const [approvalComplete, setApprovalComplete] = React.useState(false);
  const [findingRelatedPRs, setFindingRelatedPRs] = React.useState(false);
  const [relatedPRsError, setRelatedPRsError] = React.useState('');

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

  const visibleFiles = (prDetail.files ?? []).filter((file) => {
    const query = fileQuery.trim().toLowerCase();
    return !query || file.path.toLowerCase().includes(query) || file.status.toLowerCase().includes(query);
  });
  const reviewers = prDetail.requestedReviewers ?? prDetail.reviewers ?? [];
  const latestCommit = [...(prDetail.commits ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const timelineEvents = [
    { id: 'opened', date: prDetail.createdAt, username: prDetail.author, text: 'opened this PR', time: `${timeAgo(prDetail.createdAt)} ago`, tone: 'neutral' },
    ...(latestCommit ? [{ id: 'commits', date: latestCommit.date, username: latestCommit.author, text: `pushed ${prDetail.commitsCount ?? prDetail.commits?.length ?? 1} commits`, time: `${timeAgo(latestCommit.date)} ago`, tone: 'neutral' }] : []),
    ...(prDetail.comments ?? []).map((comment) => ({ id: `comment-${comment.id}`, date: comment.createdAt, username: comment.author, text: 'commented on this PR', time: `${timeAgo(comment.createdAt)} ago`, tone: 'neutral' })),
    ...(prDetail.approvedBy ?? []).map((reviewer) => ({ id: `approved-${reviewer}`, date: prDetail.updatedAt, username: reviewer, text: 'approved', time: 'Review recorded', tone: 'approved' })),
    ...(prDetail.changesRequestedBy ?? []).map((reviewer) => ({ id: `changes-${reviewer}`, date: prDetail.updatedAt, username: reviewer, text: 'requested changes', time: 'Review recorded', tone: 'changes' })),
    ...(prDetail.mergedAt ? [{ id: 'merged', date: prDetail.mergedAt, username: prDetail.mergedBy || prDetail.author, text: 'merged this PR', time: `${timeAgo(prDetail.mergedAt)} ago`, tone: 'approved' }] : []),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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

  const findRelatedPRs = async () => {
    if (findingRelatedPRs) return;
    setFindingRelatedPRs(true);
    setRelatedPRsError('');
    try {
      await onFindRelatedPRs();
    } catch (err) {
      setRelatedPRsError(err instanceof Error ? err.message : String(err));
    } finally {
      setFindingRelatedPRs(false);
    }
  };

  return (
    <div className="detail-view pr-detail-view">
      <div className="pr-detail-toolbar">
        <div className="pr-detail-toolbar-title"><span>Pull Request</span><b>/</b><strong>{prDetail.repoName}</strong></div>
        <button type="button" className="back-btn" onClick={onBack} aria-label="Back to pull requests" title="Back to pull requests">←</button>
      </div>

      <div className="pr-detail-main-grid">
        <main className="pr-detail-primary-column">
      <header className="pr-detail-hero">
        <div className="pr-reference-header">
          <div className="pr-reference-heading">
            <div className="pr-hero-topline"><span className="pr-detail-number">#{prDetail.number}</span><span className="pr-state-badge" style={{ color: stateColor(prDetail.state), borderColor: stateColor(prDetail.state), background: `color-mix(in srgb, ${stateColor(prDetail.state)} 12%, transparent)` }}>{prDetail.state}</span>{prDetail.draft && <span className="pr-detail-muted-badge">Draft</span>}</div>
            <h1>{prDetail.title}</h1>
        <div className="pr-detail-subline">
          <span>opened by <CopyableValue value={prDetail.author} /></span><span>·</span><span>updated {timeAgo(prDetail.updatedAt)} ago</span>
        </div>
        <div className="pr-hero-context"><div className="pr-branch-node source"><span>Source</span><CopyableValue value={prDetail.sourceBranch} mono /></div><span className="pr-hero-arrow" aria-label="merges into">→</span><div className="pr-branch-node target"><span>Target</span><CopyableValue value={prDetail.targetBranch} mono /></div></div>
          </div>
          <div className="pr-detail-toolbar-actions pr-reference-actions">
            {prDetail.url && <button type="button" className="detail-action-btn secondary" onClick={() => window.api.openUrl(prDetail.url)} title="Open pull request in provider">↗ Open in provider</button>}
            <button type="button" className="detail-action-btn secondary" onClick={() => void findRelatedPRs()} disabled={findingRelatedPRs} title="Find pull requests related to this Jira ticket">{findingRelatedPRs ? 'Searching…' : '⌕ Related PRs'}</button>
            <button type="button" className="detail-action-btn approve" onClick={() => { setApprovalOpen(true); setApprovalError(''); }} title="Approve pull request">✓ Approve</button>
            <button type="button" className="detail-action-btn primary" onClick={onReview}>✦ Review with AI</button>
          </div>
          {relatedPRsError && <div className="pr-approval-error" role="alert">{relatedPRsError}</div>}
        </div>
      </header>

      <section className="pr-overview-band" aria-label="Pull request overview">
        <div className="pr-overview-metrics">
          <div className="pr-overview-metric"><FactIcon type="files" /><div><strong>{prDetail.changedFiles ?? prDetail.files?.length ?? 0}</strong><span>Files changed</span></div></div>
          <div className="pr-overview-metric added"><FactIcon type="add" /><div><strong>+{prDetail.additions ?? 0}</strong><span>Additions</span></div></div>
          <div className="pr-overview-metric removed"><FactIcon type="remove" /><div><strong>−{prDetail.deletions ?? 0}</strong><span>Deletions</span></div></div>
          <div className="pr-overview-metric"><FactIcon type="commits" /><div><strong>{prDetail.commitsCount ?? prDetail.commits?.length ?? 0}</strong><span>Commits</span></div></div>
          <div className="pr-overview-metric"><FactIcon type="conversation" /><div><strong>{(prDetail.commentsCount ?? prDetail.comments?.length ?? 0) + (prDetail.reviewCommentsCount ?? 0)}</strong><span>Conversations</span></div></div>
        </div>
        <div className="pr-overview-meta"><span><FactIcon type="clock" /><b>Updated</b>{timeAgo(prDetail.updatedAt)} ago</span><span><FactIcon type="clock" /><b>Created</b>{timeAgo(prDetail.createdAt)} ago</span>{prDetail.mergedAt && <span className="pr-fact-merged"><FactIcon type="merge" /><b>Merged</b>{timeAgo(prDetail.mergedAt)} ago</span>}</div>
      </section>

      {(prDetail.labels?.length || prDetail.approvedBy?.length || prDetail.changesRequestedBy?.length) ? <div className="pr-detail-chips">
        {prDetail.labels?.map((label) => <span key={label} className="pr-detail-chip">{label}</span>)}
        {prDetail.approvedBy?.map((reviewer) => <span key={`approved-${reviewer}`} className="pr-detail-chip success">✓ <CopyableValue value={reviewer} /></span>)}
        {prDetail.changesRequestedBy?.map((reviewer) => <span key={`changes-${reviewer}`} className="pr-detail-chip danger">! Changes requested by <CopyableValue value={reviewer} /></span>)}
      </div> : null}

      {prDetail.files && prDetail.files.length > 0 && <section className="detail-section pr-detail-section pr-files-section">
        <div className="pr-section-heading pr-files-heading"><div><h2>Files changed</h2><span className="pr-files-summary">{visibleFiles.length} of {prDetail.files.length} files · <em>+{prDetail.additions ?? 0}</em> <i>−{prDetail.deletions ?? 0}</i></span></div><label className="pr-file-search"><span aria-hidden="true">⌕</span><input type="search" value={fileQuery} onChange={(event) => setFileQuery(event.target.value)} placeholder="Search files…" aria-label="Search changed files" />{fileQuery && <button type="button" onClick={() => setFileQuery('')} aria-label="Clear file search">×</button>}</label></div>
        <div className="pr-file-list">{visibleFiles.map((file) => {
          const expanded = expandedFiles.has(file.path);
            const displayPath = file.previousPath ? `${file.previousPath} → ${file.path}` : file.path;
            return <div className="pr-file-item" key={file.path}>
            <div className={`pr-file-header${file.patch ? '' : ' no-patch'}`} onClick={() => file.patch && toggleFile(file.path)} onKeyDown={(event) => { if (file.patch && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggleFile(file.path); } }} role={file.patch ? 'button' : undefined} tabIndex={file.patch ? 0 : undefined} aria-expanded={file.patch ? expanded : undefined}>
              <span className="pr-file-chevron" style={{ transform: expanded ? 'rotate(90deg)' : undefined }}>›</span><span className="pr-file-status" style={{ color: fileStatusColor(file.status) }}>{file.status}</span>
              <span className="pr-file-path-copy"><CopyableValue value={displayPath} mono /></span><span className="pr-file-counts"><b>+{file.additions}</b> <i>-{file.deletions}</i></span>
            </div>{expanded && file.patch && <pre className="pr-file-diff">{renderPatch(file.patch)}</pre>}
          </div>;
        })}</div>
        {visibleFiles.length === 0 && <div className="pr-file-filter-empty">No changed files match “{fileQuery}”.</div>}
      </section>}

      {prDetail.description && <section className="detail-section pr-detail-section pr-description-section"><div className="pr-section-heading"><h2>Description</h2><span>Context</span></div><div className="detail-body">{prDetail.description}</div></section>}

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
        </main>
        <aside className="pr-detail-side-rail" aria-label="Pull request overview">
          <section className="pr-info-card pr-review-card">
            <h2>Review status</h2>
            <div className="pr-review-state"><span className="pr-review-state-dot" style={{ background: stateColor(prDetail.state) }} /><strong>{prDetail.state}{prDetail.draft ? ' · draft' : ''}</strong></div>
            <div className="pr-review-progress"><span style={{ width: `${Math.min(100, ((prDetail.approvedBy?.length ?? 0) / Math.max(1, (prDetail.requestedReviewers?.length ?? 0))) * 100)}%` }} /></div>
            <div className="pr-review-counts"><span className="pr-info-positive">✓ {prDetail.approvedBy?.length ?? 0} approved</span><span className="pr-info-negative">! {prDetail.changesRequestedBy?.length ?? 0} changes requested</span></div>
          </section>
          <section className="pr-info-card">
            <h2>Reviewers</h2>
            {reviewers.length ? <div className="pr-person-list">{reviewers.map((reviewer, index) => {
              const approved = prDetail.approvedBy?.some((name) => name.toLowerCase() === reviewer.toLowerCase());
              const requestedChanges = prDetail.changesRequestedBy?.some((name) => name.toLowerCase() === reviewer.toLowerCase());
              return <div className="pr-person-row" key={reviewer}><PersonAvatar name={reviewer} tone={index % 2 ? 'purple' : 'blue'} /><span>{reviewer}</span><span className={`pr-person-status ${approved ? 'approved' : requestedChanges ? 'changes' : 'pending'}`} title={approved ? 'Approved' : requestedChanges ? 'Changes requested' : 'Awaiting review'}>{approved ? '✓' : requestedChanges ? '!' : '○'}</span></div>;
            })}</div> : <div className="pr-side-empty">No reviewers assigned</div>}
          </section>
          <section className="pr-info-card">
            <h2>Labels</h2>
            {prDetail.labels?.length ? <div className="pr-label-list">{prDetail.labels.map((label, index) => <span key={label} className={`pr-side-label tone-${index % 3}`}>{label}</span>)}</div> : <div className="pr-side-empty">No labels</div>}
          </section>
          <section className="pr-info-card">
            <h2>Assignees</h2>
            {prDetail.assignees?.length ? <div className="pr-person-list">{prDetail.assignees.map((assignee) => <div className="pr-person-row" key={assignee}><PersonAvatar name={assignee} tone="green" /><span>{assignee}</span></div>)}</div> : <div className="pr-side-empty">No assignees</div>}
          </section>
          <section className="pr-info-card">
            <h2>Timeline</h2>
            {timelineEvents.length ? <div className="pr-timeline">{timelineEvents.map((event) => <div className="pr-timeline-item" key={event.id}><span className={`pr-timeline-dot ${event.tone}`} /><div><strong>{event.username}</strong> {event.text}<small>{event.time}</small></div></div>)}</div> : <div className="pr-side-empty">No activity yet</div>}
          </section>
        </aside>
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
