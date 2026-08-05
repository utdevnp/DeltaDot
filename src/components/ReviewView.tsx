import React, { useState } from 'react';
import type { AppConfig, JiraIssue, PRFile, PRDetail } from '../../core/types.js';
import { renderMarkdown } from '../../core/markdown.js';
import { timeAgo } from '../../core/utils.js';

interface ReviewViewProps {
  cfg: AppConfig;
  repoPath: string;
  prNumber: number;
  jiraIssue: JiraIssue | null;
  loading: boolean;
  error: string;
  onBack: () => void;
}

interface LogEntry {
  msg: string;
  ok?: boolean;
}

type ReviewTab = 'jira' | 'pr' | 'ai';

export function ReviewView({ cfg, repoPath, prNumber, jiraIssue, loading, error, onBack }: ReviewViewProps) {
  const [tab, setTab] = useState<ReviewTab>('jira');
  const [aiReview, setAIReview] = useState<string | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState('');
  const [phase, setPhase] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [prDetail, setPrDetail] = useState<PRDetail | null>(null);
  const [prDetailLoading, setPrDetailLoading] = useState(false);
  const [prDetailError, setPrDetailError] = useState('');

  const addLog = (msg: string, ok?: boolean) => {
    setLog((prev) => [...prev, { msg, ok }]);
  };

  // ─── PR detail (shared by the PR Details tab and the review flow) ────────

  const loadPRDetail = async (): Promise<PRDetail | null> => {
    try {
      const remoteInfo = await window.api.getRemoteOwnerRepo(repoPath);
      if (!remoteInfo) throw new Error('Could not detect remote repository');
      const detail = await window.api.fetchPRDetail(remoteInfo.owner, remoteInfo.repo, prNumber, cfg.provider, cfg.token);
      setPrDetail(detail);
      return detail;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPrDetailError(msg);
      return null;
    }
  };

  const openPRTab = () => {
    setTab('pr');
    if (!prDetail && !prDetailLoading && !prDetailError) {
      setPrDetailLoading(true);
      setPrDetailError('');
      loadPRDetail().finally(() => setPrDetailLoading(false));
    }
  };

  // ─── Streaming ─────────────────────────────────────────────────────────

  const runReview = async () => {
    setAIReview('');
    setAIError('');
    setLog([]);
    setAILoading(true);
    setPhase('Fetching Jira content...');

    if (cfg.aiProvider === 'none') {
      addLog('AI provider not configured', false);
      setAIError('AI provider not configured. Go to config (e) to set it up.');
      setAILoading(false);
      setPhase(null);
      return;
    }

    addLog(`Provider: ${cfg.aiProvider}`, true);
    addLog(`Model: ${cfg.aiModel || '(default)'}`, true);
    try {
      const remoteInfo = await window.api.getRemoteOwnerRepo(repoPath);
      if (!remoteInfo) { throw new Error('Could not detect remote repository'); }
      addLog(`Remote: ${remoteInfo.owner}/${remoteInfo.repo}`, true);
      addLog(`Jira: ${jiraIssue ? jiraIssue.key : '(none linked)'}`, true);

      setPhase('Getting PR changes...');
      const detail = await window.api.fetchPRDetail(remoteInfo.owner, remoteInfo.repo, prNumber, cfg.provider, cfg.token);
      addLog(`Fetched ${detail.files?.length ?? 0} changed file(s)`, true);
      setPrDetail(detail);

      const files: { path: string; patch?: string; additions: number; deletions: number; status: string }[] =
        (detail.files ?? []).map((f: PRFile) => ({
          path: f.path,
          patch: f.patch,
          additions: f.additions,
          deletions: f.deletions,
          status: f.status,
        }));
      const jiraDescription = jiraIssue?.description ?? '';

      setPhase('Reviewing...');
      addLog(`Sending to ${cfg.aiProvider}${cfg.aiProvider === 'ollama' ? ' (local)' : ''}...`);

      // Stream the response — chunks arrive progressively
      let streamedText = '';
      const result = await window.api.streamAIReview(
        {
          provider: cfg.aiProvider,
          apiKey: cfg.aiApiKey,
          apiUrl: cfg.aiApiUrl,
          model: cfg.aiModel,
          systemPrompt: cfg.aiSystemPrompt,
        },
        jiraDescription,
        files,
        (chunk: string) => {
          streamedText += chunk;
          setAIReview(streamedText);
        },
      );

      addLog('Review complete', true);
      // Always force the final text so the review is never left blank
      const finalText = result || streamedText;
      if (finalText) setAIReview(finalText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(msg, false);
      setAIError(msg);
    }
    setAILoading(false);
    setPhase(null);
  };

  if (loading) {
    return <div className="state-message">Loading review...</div>;
  }

  if (error) {
    return <div className="detail-view"><div className="state-message error">{error}</div></div>;
  }

  return (
    <div className="review-container">
      <div style={{ padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, alignSelf: 'center' }}>
          Review · PR #{prNumber}
        </span>
        <div style={{ flex: 1 }} />
        <button className="back-btn" onClick={onBack}>←</button>
      </div>

      <div className="review-tabs">
        <div className={`review-tab ${tab === 'jira' ? 'active' : ''}`} onClick={() => setTab('jira')}>
          Jira Task
        </div>
        <div className={`review-tab ${tab === 'pr' ? 'active' : ''}`} onClick={openPRTab}>
          PR Details
        </div>
        <div className={`review-tab ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>
          AI Review
        </div>
      </div>

      <div className="review-content">
        {tab === 'jira' && (
          jiraIssue ? (
            <>
              <div className="jira-header">
                <h3>{jiraIssue.key} — {jiraIssue.summary}</h3>
                <div className="jira-meta">
                  {jiraIssue.status} · {jiraIssue.issueType} · {jiraIssue.assignee}
                </div>
              </div>
              <div className="jira-description" dangerouslySetInnerHTML={{ __html: renderMarkdown(jiraIssue.description || '(no description)') }} />
            </>
          ) : (
            <div className="state-message">No Jira issue linked to this PR</div>
          )
        )}

        {tab === 'pr' && (
          prDetailLoading ? (
            <div className="loading">Loading PR details... <span className="loading-dots" /></div>
          ) : prDetailError ? (
            <div className="error">{prDetailError}</div>
          ) : prDetail ? (
            <div className="detail-view" style={{ padding: 0 }}>
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
            </div>
          ) : (
            <div className="state-message">No PR details available</div>
          )
        )}

        {tab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', flex: 1, gap: 12, minHeight: 0 }}>
              {/* Left — Review result (70%) */}
              <div style={{ flex: 7, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
                {/* Idle state — button centered in the box */}
                {!aiReview && !aiLoading && !aiError && (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 14,
                    minHeight: 200,
                  }}>
                    <button
                      onClick={runReview}
                      style={{
                        padding: '12px 40px',
                        borderRadius: 8,
                        background: 'var(--accent-blue)',
                        border: 'none',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        boxShadow: '0 2px 8px rgba(88,166,255,0.35)',
                        transition: 'background 0.15s, transform 0.1s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#4a90e2'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-blue)'; }}
                      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      ▶ Run AI Review
                    </button>
                    <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                      Analyzes PR changes with {cfg.aiProvider === 'none' ? 'AI' : cfg.aiProvider} against the linked Jira task
                    </div>
                  </div>
                )}

                {/* Loading — spinner + phase with animated dots (only when nothing to show yet) */}
                {aiLoading && !aiReview && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div className="loading-spinner" />
                      <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 16 }}>
                        {phase || 'Processing...'}<span className="loading-dots" />
                      </div>
                    </div>
                  </div>
                )}

                {aiError && !aiLoading && (
                  <div className="error" style={{ flexShrink: 0 }}>{aiError}</div>
                )}

                {/* Result — shown progressively while streaming, kept after completion */}
                {aiReview && (
                  <>
                    {!aiLoading && (
                      <div style={{ flexShrink: 0, textAlign: 'center', marginBottom: 8 }}>
                        <button
                          onClick={runReview}
                          disabled={aiLoading}
                          style={{
                            padding: '6px 18px',
                            borderRadius: 6,
                            background: 'var(--accent-blue)',
                            border: 'none',
                            color: '#fff',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#4a90e2'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-blue)'; }}
                        >
                          ↻ Run Again
                        </button>
                      </div>
                    )}
                    <div style={{
                      flex: 1,
                      minHeight: 0,
                      overflowY: 'auto',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text-primary)',
                      background: 'var(--bg-secondary)',
                      padding: 12,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                    }} dangerouslySetInnerHTML={{ __html: renderMarkdown(aiReview) }} />
                  </>
                )}
              </div>

              {/* Right — Log panel (30%) */}
              <div style={{ flex: 3, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {(log.length > 0 || aiLoading) && (
                  <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    lineHeight: 1.8,
                    padding: 12,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Log</div>
                    {log.length === 0 ? (
                      <div style={{ color: 'var(--text-dim)' }}>Starting...<span className="loading-dots" /></div>
                    ) : (
                      log.map((entry, i) => (
                        <div key={i} style={{ color: entry.ok === false ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                          {entry.ok === true ? '✓ ' : entry.ok === false ? '✗ ' : '→ '}{entry.msg}
                        </div>
                      ))
                    )}
                    {aiLoading && (
                      <div style={{ color: 'var(--accent-cyan)', marginTop: log.length > 0 ? 4 : 0 }}>
                        {phase || 'Processing...'}<span className="loading-dots" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
