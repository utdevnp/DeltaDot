import React, { useState, useEffect, useCallback } from 'react';
import type { AppConfig, JiraIssue, PRFile } from '../../core/types.js';

interface ReviewViewProps {
  cfg: AppConfig;
  repoPath: string;
  prNumber: number;
  jiraIssue: JiraIssue | null;
  loading: boolean;
  error: string;
  onBack: () => void;
}

export function ReviewView({ cfg, repoPath, prNumber, jiraIssue, loading, error, onBack }: ReviewViewProps) {
  const [tab, setTab] = useState<'jira' | 'ai'>('jira');
  const [aiReview, setAIReview] = useState<string | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState('');

  // Load AI review when on ai tab
  const loadAIReview = useCallback(async () => {
    if (aiReview || aiLoading) return;
    if (cfg.aiProvider === 'none') {
      setAIError('AI provider not configured. Go to config (e) to set it up.');
      return;
    }
    setAILoading(true);
    setAIError('');
    try {
      const remoteInfo = await window.api.getRemoteOwnerRepo(repoPath);
      if (!remoteInfo) { setAIError('Could not detect remote'); setAILoading(false); return; }
      const prDetail = await window.api.fetchPRDetail('', remoteInfo.repo, prNumber, cfg.provider, cfg.token);
      const files: { path: string; patch?: string; additions: number; deletions: number; status: string }[] =
        (prDetail.files ?? []).map((f: PRFile) => ({
          path: f.path,
          patch: f.patch,
          additions: f.additions,
          deletions: f.deletions,
          status: f.status,
        }));
      const jiraDescription = jiraIssue?.description ?? '';
      const result = await window.api.fetchAIReview(
        {
          provider: cfg.aiProvider,
          apiKey: cfg.aiApiKey,
          apiUrl: cfg.aiApiUrl,
          model: cfg.aiModel,
          systemPrompt: cfg.aiSystemPrompt,
        },
        jiraDescription,
        files,
      );
      setAIReview(result);
    } catch (err) {
      setAIError(err instanceof Error ? err.message : String(err));
    }
    setAILoading(false);
  }, [cfg, repoPath, prNumber, jiraIssue, aiReview, aiLoading]);

  useEffect(() => {
    if (tab === 'ai') loadAIReview();
  }, [tab, loadAIReview]);

  if (loading) {
    return <div className="state-message">Loading review...</div>;
  }

  if (error) {
    return <div className="detail-view"><div className="state-message error">{error}</div></div>;
  }

  return (
    <div className="review-container">
      <div style={{ padding: '8px 16px', display: 'flex', gap: 8 }}>
        <button className="back-btn" onClick={onBack}>← Back</button>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, alignSelf: 'center' }}>
          Review · PR #{prNumber}
        </span>
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
              <div className="jira-description">{jiraIssue.description || '(no description)'}</div>
            </>
          ) : (
            <div className="state-message">No Jira issue linked to this PR</div>
          )
        )}

        {tab === 'ai' && (
          aiReview ? (
            <div className="ai-review-text">{aiReview}</div>
          ) : aiLoading ? (
            <div className="loading">Running AI review...</div>
          ) : aiError ? (
            <div className="error">{aiError}</div>
          ) : (
            <div className="state-message">Click the AI Review tab to start</div>
          )
        )}
      </div>
    </div>
  );
}
