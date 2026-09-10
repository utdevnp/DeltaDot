import React, { useState } from 'react';
import type { AppConfig, JiraIssue, PR, PRDetail } from '../../core/types.js';
import { JiraTaskPanel } from './review/JiraTaskPanel.js';
import { PRDetailsPanel } from './review/PRDetailsPanel.js';
import { AIReviewPanel } from './review/AIReviewPanel.js';

interface ReviewViewProps {
  cfg: AppConfig;
  repoPath: string;
  prNumber: number;
  prTitle?: string;
  relatedPRs?: Array<PR & { repoPath?: string }>;
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
export function ReviewView({ cfg, repoPath, prNumber, prTitle, relatedPRs = [], jiraIssue, loading, error, onBack }: ReviewViewProps) {
  const [tab, setTab] = useState<ReviewTab>('jira');
  const [prDetail, setPrDetail] = useState<PRDetail | null>(null);
  const [prDetails, setPrDetails] = useState<Record<string, PRDetail | null>>({});
  const [selectedPRNumber, setSelectedPRNumber] = useState(prNumber);
  const [prDetailLoading, setPrDetailLoading] = useState(false);
  const [prDetailError, setPrDetailError] = useState('');

  const allRelatedPRs = relatedPRs.length > 0 ? relatedPRs : [{ number: prNumber, title: prTitle ?? '', repoName: '', repoPath, author: '', state: '', sourceBranch: '', targetBranch: '', createdAt: '', url: '', approved: false }];
  const prKey = (pr: Pick<PR, 'number' | 'repoName'>) => `${pr.repoName || repoPath}-${pr.number}`;

  // Fetch all related PR details lazily the first time the PR Details tab is opened.
  const openPRTab = () => {
    setTab('pr');
    if (Object.keys(prDetails).length === 0 && !prDetailLoading && !prDetailError) {
      setPrDetailLoading(true);
      setPrDetailError('');
      (async () => {
        try {
          const results = await Promise.all(allRelatedPRs.map(async (pr) => {
            const remoteInfo = await window.api.getRemoteOwnerRepo(pr.repoPath || repoPath);
            if (!remoteInfo) return [prKey(pr), null] as const;
            const detail = await window.api.fetchPRDetail(remoteInfo.owner, pr.repoName || remoteInfo.repo, pr.number, cfg.provider, cfg.token);
            return [prKey(pr), detail] as const;
          }));
          const details = Object.fromEntries(results);
          setPrDetails(details);
          const selected = allRelatedPRs.find((pr) => pr.number === selectedPRNumber) ?? allRelatedPRs[0];
          setPrDetail(selected ? details[prKey(selected)] ?? null : null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setPrDetailError(msg);
        }
        setPrDetailLoading(false);
      })();
    } else {
      const selected = allRelatedPRs.find((pr) => pr.number === selectedPRNumber) ?? allRelatedPRs[0];
      if (selected) setPrDetail(prDetails[prKey(selected)] ?? null);
    }
  };

  const selectRelatedPR = (number: number) => {
    setSelectedPRNumber(number);
    const selected = allRelatedPRs.find((pr) => pr.number === number);
    setPrDetail(selected ? prDetails[prKey(selected)] ?? null : null);
  };

  if (loading) {
    return <div className="state-message">Loading review...</div>;
  }

  if (error) {
    return <div className="detail-view"><div className="state-message error">{error}</div></div>;
  }

  return (
    <div className="review-container">
      <div className="review-view-header" style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
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
          Jira
        </div>
        <div className={`review-tab ${tab === 'pr' ? 'active' : ''}`} onClick={openPRTab}>
          PRs / Details
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
            relatedPRs={allRelatedPRs}
            selectedPRNumber={selectedPRNumber}
            onSelectPR={selectRelatedPR}
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
            relatedPRs={allRelatedPRs}
            onPRDetailLoaded={setPrDetail}
          />
        </div>
      </div>
    </div>
  );
}
