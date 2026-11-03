import { useState } from 'react';
import { timeAgo, truncate } from '../../../core/utils.js';
import type { RepoState } from '../../../core/types.js';
import { contextColor } from './helpers.js';
import type { ActivityTab, KubeActivityEntry } from './types.js';
import { DashboardCardFooter } from './DashboardMetric.js';
import { DashboardIcon } from './DashboardIcon.js';

interface Props { repos: RepoState[]; kubeActivity: KubeActivityEntry[]; kubeLoading: boolean; onOpenRepositories: () => void; onOpenKubernetes: () => void; onSelectRepo: (repo: RepoState) => void; onSelectKube: (entry: KubeActivityEntry) => void; lastUpdated: string; onRefresh: () => void; refreshing: boolean; }

function compactCommitAge(age: string): string {
  return age
    .replace(/\babout\s+/i, '')
    .replace(/\bseconds?\b/gi, 'sec')
    .replace(/\bminutes?\b/gi, 'min')
    .replace(/\bhours?\b/gi, 'hr')
    .replace(/\bweeks?\b/gi, 'wk')
    .replace(/\s+/g, ' ')
    .trim();
}

function latestCommitTime(repo: RepoState): number {
  const date = repo.latestCommits[0]?.date;
  if (!date) return 0;
  const timestamp = new Date(date).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function DashboardActivityCard({ repos, kubeActivity, kubeLoading, onOpenRepositories, onOpenKubernetes, onSelectRepo, onSelectKube, lastUpdated, onRefresh, refreshing }: Props) {
  const [activeTab, setActiveTab] = useState<ActivityTab>('repos');
  const recentRepos = repos.filter((repo) => repo.lastCommitMsg).sort((a, b) => latestCommitTime(b) - latestCommitTime(a)).slice(0, 5);
  return <section className="card card-border bg-base-200 dashboard-card dashboard-activity-card">
    <div className="dashboard-card-header"><div className="dashboard-heading-with-icon"><span className="dashboard-heading-icon"><DashboardIcon name="activity" size={24} /></span><div><span className="dashboard-section-kicker">Recent updates</span><h2>Recent updates</h2></div></div><div className="tabs tabs-box tabs-xs dashboard-card-tabs" role="tablist" aria-label="Activity type"><button type="button" role="tab" aria-selected={activeTab === 'repos'} className={`tab ${activeTab === 'repos' ? 'tab-active is-active' : ''}`} onClick={() => setActiveTab('repos')}><DashboardIcon name="repository" size={13} />Repositories</button><button type="button" role="tab" aria-selected={activeTab === 'k8s'} className={`tab ${activeTab === 'k8s' ? 'tab-active is-active' : ''}`} onClick={() => setActiveTab('k8s')}><DashboardIcon name="kubernetes" size={13} />Kubernetes</button></div></div>
    {activeTab === 'repos' ? <div className="dashboard-activity-section"><div className="dashboard-table-head dashboard-activity-table-head"><span>Status</span><span>Update</span><span>Branch</span><span>Time</span></div>{recentRepos.length === 0 ? <div className="dashboard-empty">No repository activity yet. Sync the workspace to populate this view.</div> : <div className="list dashboard-activity-list">{recentRepos.map((repo) => {
      const statusLabel = repo.status === 'synced' ? 'Synced' : repo.status === 'behind' ? 'Behind' : repo.status === 'error' ? 'Sync error' : repo.status === 'syncing' ? 'Syncing' : repo.status === 'loading' ? 'Loading' : 'Stale';
      const statusTone = repo.status === 'error' || repo.status === 'behind' ? 'badge-error' : repo.status === 'stale' ? 'badge-warning' : repo.status === 'synced' ? 'badge-success' : 'badge-info';
      return <button type="button" className="list-row dashboard-activity-row" key={repo.path} onClick={() => onSelectRepo(repo)}><span className={`badge badge-soft ${statusTone} dashboard-activity-status-pill`}><DashboardIcon name={repo.status === 'synced' ? 'check' : repo.status === 'error' || repo.status === 'behind' ? 'alert' : repo.status === 'syncing' ? 'sync' : 'clock'} size={11} />{statusLabel}</span><span className="dashboard-activity-update" title={repo.lastCommitMsg}><strong>{truncate(repo.lastCommitMsg, 52)}</strong><small><DashboardIcon name="repository" size={12} />{repo.name}</small></span><span className="dashboard-activity-branch" title={repo.currentBranch || 'Current branch'}>{repo.currentBranch || '—'}</span><span className="dashboard-activity-age"><DashboardIcon name="clock" size={12} />{repo.lastCommitAge ? compactCommitAge(repo.lastCommitAge) : '—'}</span></button>;
    })}</div>}</div> : <div className="dashboard-activity-section">{kubeLoading ? <div className="dashboard-empty">Loading activity across Kubernetes contexts…</div> : kubeActivity.length === 0 ? <div className="dashboard-empty">No pod or deployment activity is available across the configured contexts.</div> : <div className="dashboard-kube-activity-list">{kubeActivity.map((entry) => <button type="button" className="dashboard-kube-activity-row" key={`${entry.context}-${entry.kind}-${entry.namespace}-${entry.name}`} onClick={() => onSelectKube(entry)}><span className={`badge badge-outline dashboard-kube-kind dashboard-kube-kind-${entry.kind.toLowerCase()}`}><DashboardIcon name={entry.kind === 'Pod' ? 'deployment' : 'kubernetes'} size={13} />{entry.kind === 'Pod' ? 'POD' : 'DEP'}</span><span className="dashboard-kube-activity-copy"><strong>{entry.name}</strong><span><em className="dashboard-kube-context" style={{ color: contextColor(entry.context) }}>{entry.context}</em> · {entry.namespace || 'cluster-wide'}</span></span><span className="dashboard-kube-activity-age"><DashboardIcon name="clock" size={12} />{timeAgo(entry.updatedAt)} ago</span></button>)}</div>}</div>}
    <DashboardCardFooter updatedAt={lastUpdated} loading={refreshing || kubeLoading} onRefresh={onRefresh} actionLabel={activeTab === 'repos' ? 'View all activity' : 'Open Kubernetes'} onAction={activeTab === 'repos' ? onOpenRepositories : onOpenKubernetes} />
  </section>;
}
