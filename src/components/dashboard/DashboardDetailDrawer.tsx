import { useEffect, useState, type ReactNode } from 'react';
import type { DashboardDrawerItem } from './types.js';
import { timeAgo } from '../../../core/utils.js';
import { contextColor } from './helpers.js';

interface Props { item: DashboardDrawerItem; onClose: () => void; onOpenKubeLogs: (entry: Extract<DashboardDrawerItem, { type: 'kube' }>['entry']) => void; onViewDetail: (commitHash?: string) => void; }

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="dashboard-drawer-fact"><span>{label}</span><strong>{value || '—'}</strong></div>;
}

function factLabel(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (character) => character.toUpperCase());
}

function FactsGrid({ entries }: { entries: Array<[string, string]> }) {
  return <div className="dashboard-drawer-facts is-grid">{entries.filter(([, value]) => value).map(([label, value]) => <Fact key={label} label={factLabel(label)} value={value} />)}</div>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="dashboard-drawer-section"><h3>{title}</h3>{children}</section>;
}

function StatusBadge({ value, tone = 'neutral' }: { value: string; tone?: 'good' | 'warning' | 'bad' | 'neutral' }) {
  return <span className={`dashboard-drawer-badge is-${tone}`}><span />{value}</span>;
}

function ChangeCard({ hash, title, meta, selected, onSelect }: { hash: string; title: string; meta: string; selected?: boolean; onSelect?: () => void }) {
  return <button type="button" className={`dashboard-drawer-change${selected ? ' is-selected' : ''}`} onClick={onSelect} title={onSelect ? 'Select commit, then press o to open it in the provider' : undefined}><div className="dashboard-drawer-change-top"><code>{hash}</code><span>{meta}</span></div><strong>{title}</strong></button>;
}

function DetailList({ items, empty = 'No additional details available.' }: { items: string[]; empty?: string }) {
  return items.length > 0
    ? <div className="dashboard-drawer-detail-list">{items.map((item, index) => <div key={`${item}-${index}`}><span className="dashboard-drawer-detail-dot" />{item}</div>)}</div>
    : <p className="dashboard-drawer-empty">{empty}</p>;
}

export function DashboardDetailDrawer({ item, onClose, onOpenKubeLogs, onViewDetail }: Props) {
  const title = item.type === 'repo' ? item.repo.name : item.type === 'pr' ? `PR #${item.pr.number}` : item.entry.name;
  const subtitle = item.type === 'repo' ? 'Repository overview' : item.type === 'pr' ? 'Pull request overview' : `${item.entry.kind} overview`;
  const [selectedCommitHash, setSelectedCommitHash] = useState(item.type === 'repo' ? item.repo.latestCommits[0]?.hash ?? item.repo.diffCommits[0]?.hash ?? '' : '');

  const openSelectedCommit = async () => {
    if (item.type !== 'repo' || !selectedCommitHash) return;
    const remoteUrl = await window.api.getRemoteUrl(item.repo.path);
    if (!remoteUrl) return;
    const commitUrl = await window.api.getCommitUrl(remoteUrl, selectedCommitHash);
    if (commitUrl) await window.api.openUrl(commitUrl);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'o' && item.type === 'repo') {
        event.preventDefault();
        event.stopPropagation();
        void openSelectedCommit();
      }
      if (event.key === 'o' && item.type === 'kube') {
        event.preventDefault();
        event.stopPropagation();
        onOpenKubeLogs(item.entry);
      }
      if (event.key === 'o' && item.type === 'pr') {
        event.preventDefault();
        event.stopPropagation();
        if (item.pr.url) void window.api.openUrl(item.pr.url);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [item, onClose, onOpenKubeLogs, selectedCommitHash]);

  return <><button type="button" className="dashboard-drawer-backdrop" aria-label="Close details" onClick={onClose} /><aside className="dashboard-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="dashboard-drawer-title" onClick={(event) => event.stopPropagation()}><div className="dashboard-drawer-header"><div><span className="dashboard-section-kicker">{subtitle}</span><h2 id="dashboard-drawer-title">{title}</h2></div><button type="button" className="dashboard-drawer-close" onClick={onClose} aria-label="Close details">×</button></div>
    <div className="dashboard-drawer-body">{item.type === 'repo' && <><div className="dashboard-drawer-hero"><StatusBadge value={item.repo.status} tone={item.repo.status === 'error' ? 'bad' : item.repo.status === 'behind' ? 'warning' : 'good'} /><p>{item.repo.lastCommitMsg || 'No recent commit message available.'}</p></div><div className="dashboard-drawer-facts is-grid"><Fact label="Branch" value={item.repo.currentBranch} /><Fact label="Last commit" value={item.repo.lastCommitAge} /><Fact label="Author" value={item.repo.lastCommitAuthor} /><Fact label="Version" value={item.repo.latestVersion ?? ''} /></div>{item.repo.error && <div className="dashboard-drawer-error"><span>Sync error</span>{item.repo.error}</div>}<DetailSection title={`Changes from ${item.repo.currentBranch || 'base'} comparison`}><div className="dashboard-drawer-changes">{item.repo.diffCommits.length > 0 ? item.repo.diffCommits.map((commit) => <ChangeCard key={commit.hash} hash={commit.hash} title={commit.message} meta={`${commit.author || 'Unknown author'}${commit.age ? ` · ${commit.age}` : ''}`} selected={selectedCommitHash === commit.hash} onSelect={() => setSelectedCommitHash(commit.hash)} />) : <p className="dashboard-drawer-empty">No commits are ahead of the comparison branch.</p>}</div></DetailSection><DetailSection title="Recent commits"><div className="dashboard-drawer-changes">{item.repo.latestCommits.length > 0 ? item.repo.latestCommits.map((commit) => <ChangeCard key={commit.hash} hash={commit.hash} title={commit.subject} meta={`${commit.author || 'Unknown author'} · ${commit.age || 'time unavailable'}`} selected={selectedCommitHash === commit.hash} onSelect={() => setSelectedCommitHash(commit.hash)} />) : <p className="dashboard-drawer-empty">No recent commits available.</p>}</div></DetailSection><div className="dashboard-drawer-path">{item.repo.path}</div></>}
      {item.type === 'pr' && <><div className="dashboard-drawer-hero"><StatusBadge value={item.pr.hasConflicts ? 'Needs attention' : item.pr.approved ? 'Approved' : 'Waiting for review'} tone={item.pr.hasConflicts ? 'bad' : item.pr.approved ? 'good' : 'warning'} /><p>{item.pr.title}</p></div><div className="dashboard-drawer-facts is-grid"><Fact label="Repository" value={item.pr.repoName} /><Fact label="Author" value={item.pr.author} /><Fact label="State" value={item.pr.state} /><Fact label="Created" value={item.pr.createdAt ? `${timeAgo(item.pr.createdAt)} ago` : ''} /><Fact label="Branches" value={`${item.pr.sourceBranch} → ${item.pr.targetBranch}`} /><Fact label="Jira" value={`${item.pr.title} ${item.pr.sourceBranch}`.match(/\b[A-Z][A-Z0-9]+-\d+\b/)?.[0] ?? 'Not linked'} /></div><div className="dashboard-drawer-status-line">{item.pr.hasConflicts ? 'Merge conflicts need attention' : item.pr.approved ? 'Approved and ready to merge' : 'Approval is still pending'}</div><DetailSection title="Review details"><DetailList items={[item.pr.hasConflicts ? 'This pull request has merge conflicts.' : 'No merge conflicts reported.', item.pr.approved ? 'Approved by reviewers.' : 'Approval is still pending.', item.pr.url ? `Complete change set: ${item.pr.url}` : 'Pull request URL unavailable.']} /></DetailSection></>}
      {item.type === 'kube' && <><div className={`dashboard-drawer-hero ${item.entry.healthy ? 'is-healthy' : 'is-unhealthy'}`}><StatusBadge value={item.entry.healthy ? 'Healthy' : 'Unhealthy'} tone={item.entry.healthy ? 'good' : 'bad'} /><p>{item.entry.reason}</p></div><DetailSection title="Resource identity"><FactsGrid entries={[['Context', item.entry.context], ['Cluster', item.entry.cluster || item.entry.context], ['Kind', item.entry.kind], ['Namespace', item.entry.namespace || 'cluster-wide'], ['Name', item.entry.name], ['Updated', item.entry.updatedAt ? `${timeAgo(item.entry.updatedAt)} ago` : '']]} /></DetailSection><div className="dashboard-drawer-reason"><span>Health signal</span><strong>{item.entry.reason}</strong></div><DetailSection title="Resource signals"><FactsGrid entries={Object.entries(item.entry.details).map(([key, value]) => [key, value])} /></DetailSection><div className="dashboard-drawer-context" style={{ color: contextColor(item.entry.context) }}>{item.entry.context}{item.entry.cluster ? ` · ${item.entry.cluster}` : ''}</div></>}</div>
    <div className="dashboard-drawer-footer"><button type="button" className="dashboard-secondary-button" onClick={onClose}>Close</button><button type="button" className="dashboard-sync-button" onClick={() => onViewDetail(item.type === 'repo' ? selectedCommitHash : undefined)}>View detail ↗</button></div>
  </aside></>;
}
