import React, { useState } from 'react';
import type { AppConfig, JiraIssue, PRDetail } from '../../core/types.js';
import { JiraTaskPanel } from './review/JiraTaskPanel.js';
import { PRDetailsPanel } from './review/PRDetailsPanel.js';
import { AIReviewPanel } from './review/AIReviewPanel.js';

interface ReviewViewProps {
  cfg: AppConfig;
  repoPath: string;
  prNumber: number;
  prTitle?: string;
  jiraIssue: JiraIssue | null;
  loading: boolean;
  error: string;
  onBack: () => void;
}

type ReviewTab = 'jira' | 'pr' | 'ai';

/**
 * Container for the review screen. Hosts the tab bar and delegates the
 * content of each tab to a dedicated component:
 *   - Jira Task  → JiraTaskPanel
 *   - PR Details → PRDetailsPanel
 *   - AI Review  → AIReviewPanel
 */
export function ReviewView({ cfg, repoPath, prNumber, prTitle, jiraIssue, loading, error, onBack }: ReviewViewProps) {
  const [tab, setTab] = useState<ReviewTab>('jira');
  const [prDetail, setPrDetail] = useState<PRDetail | null>(null);
  const [prDetailLoading, setPrDetailLoading] = useState(false);
  const [prDetailError, setPrDetailError] = useState('');

  // Fetch PR detail lazily the first time the PR Details tab is opened
  const openPRTab = () => {
    setTab('pr');
    if (!prDetail && !prDetailLoading && !prDetailError) {
      setPrDetailLoading(true);
      setPrDetailError('');
      (async () => {
        try {
          const remoteInfo = await window.api.getRemoteOwnerRepo(repoPath);
          if (!remoteInfo) throw new Error('Could not detect remote repository');
          const detail = await window.api.fetchPRDetail(remoteInfo.owner, remoteInfo.repo, prNumber, cfg.provider, cfg.token);
          setPrDetail(detail);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setPrDetailError(msg);
        }
        setPrDetailLoading(false);
      })();
    }
  };

  if (loading) {
    return <div className="state-message">Loading review...</div>;
  }

  if (error) {
    return <div className="detail-view"><div className="state-message error">{error}</div></div>;
  }

  return (
    <div className="review-container">
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          flexShrink: 0,
        }}>
          Review
        </span>
        <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>·</span>
        <span style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {prTitle || `PR #${prNumber}`}
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
        <div style={tab === 'jira' ? undefined : { display: 'none' }}>
          <JiraTaskPanel jiraIssue={jiraIssue} />
        </div>
        <div style={tab === 'pr' ? undefined : { display: 'none' }}>
          <PRDetailsPanel
            prDetail={prDetail}
            loading={prDetailLoading}
            error={prDetailError}
          />
        </div>
        <div style={tab === 'ai' ? { height: '100%' } : { display: 'none' }}>
          <AIReviewPanel
            cfg={cfg}
            repoPath={repoPath}
            prNumber={prNumber}
            jiraIssue={jiraIssue}
            onPRDetailLoaded={setPrDetail}
          />
        </div>
      </div>
    </div>
  );
}
