import React, { useState } from 'react';
import type { AppConfig, JiraIssue, PRFile } from '../../core/types.js';
import { renderMarkdown } from '../../core/markdown.js';

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

export function ReviewView({ cfg, repoPath, prNumber, jiraIssue, loading, error, onBack }: ReviewViewProps) {
  const [tab, setTab] = useState<'jira' | 'ai'>('jira');
  const [aiReview, setAIReview] = useState<string | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);

  const addLog = (msg: string, ok?: boolean) => {
    setLog((prev) => [...prev, { msg, ok }]);
  };

// ─── Streaming ─────────────────────────────────────────────────────────

    const runReview = async () => {
      setAIReview('');
      setAIError('');
      setLog([]);
      setAILoading(true);

      if (cfg.aiProvider === 'none') {
        addLog('AI provider not configured', false);
        setAIError('AI provider not configured. Go to config (e) to set it up.');
        setAILoading(false);
        return;
      }

      addLog(`Provider: ${cfg.aiProvider}`, true);
      addLog(`Model: ${cfg.aiModel || '(default)'}`, true);
      addLog('Fetching PR details...');
      try {
        const remoteInfo = await window.api.getRemoteOwnerRepo(repoPath);
        if (!remoteInfo) { throw new Error('Could not detect remote repository'); }
        addLog(`Remote: ${remoteInfo.owner}/${remoteInfo.repo}`, true);

        const prDetail = await window.api.fetchPRDetail(remoteInfo.owner, remoteInfo.repo, prNumber, cfg.provider, cfg.token);
        addLog(`Fetched ${prDetail.files?.length ?? 0} changed file(s)`, true);

        const files: { path: string; patch?: string; additions: number; deletions: number; status: string }[] =
          (prDetail.files ?? []).map((f: PRFile) => ({
            path: f.path,
            patch: f.patch,
            additions: f.additions,
            deletions: f.deletions,
            status: f.status,
          }));
        const jiraDescription = jiraIssue?.description ?? '';

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
        // Ensure final text is set
        if (result && streamedText !== result) setAIReview(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addLog(msg, false);
        setAIError(msg);
      }
      setAILoading(false);
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

        {tab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
            {/* Run button */}
            {!aiLoading && (
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <button
                  onClick={runReview}
                  disabled={aiLoading}
                  style={{
                    padding: '10px 32px',
                    borderRadius: 8,
                    background: 'var(--accent-blue)',
                    border: 'none',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#4a90e2'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-blue)'; }}
                >
                  {aiReview ? 'Run Again' : 'Run AI Review'}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flex: 1, gap: 12, minHeight: 0 }}>
              {/* Left — Review result (70%) */}
              <div style={{ flex: 7, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {!aiReview && !aiLoading && !aiError && (
                  <div className="state-message" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Press "Run AI Review" to start
                  </div>
                )}
                {aiError && !aiLoading && (
                  <div className="error" style={{ flexShrink: 0 }}>{aiError}</div>
                )}
                {aiReview && (
                  <div style={{
                    flex: 1,
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
                      <div style={{ color: 'var(--text-dim)' }}>Starting...</div>
                    ) : (
                      log.map((entry, i) => (
                        <div key={i} style={{ color: entry.ok === false ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                          {entry.ok === true ? '✓ ' : entry.ok === false ? '✗ ' : '→ '}{entry.msg}
                        </div>
                      ))
                    )}
                    {aiLoading && (
                      <div style={{ color: 'var(--accent-cyan)', marginTop: log.length > 0 ? 4 : 0 }}>◌ Processing...</div>
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
