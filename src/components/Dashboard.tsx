import { useEffect, useRef, useState } from 'react';
import { DashboardMetric } from './dashboard/DashboardMetric.js';
import { DashboardActivityCard } from './dashboard/DashboardActivityCard.js';
import { JiraLinksCard, KubernetesHealthCard, PullRequestCard, QuickActions } from './dashboard/DashboardCards.js';
import { useKubernetesDashboardData } from './dashboard/useKubernetesDashboardData.js';
import type { DashboardProps } from './dashboard/types.js';
import { timeAgo } from '../../core/utils.js';
import { DashboardDetailDrawer } from './dashboard/DashboardDetailDrawer.js';
import type { DashboardDrawerItem } from './dashboard/types.js';

export type { DashboardProps } from './dashboard/types.js';

export function Dashboard({ workspaceName, workspacePath, base, release, repos, prs, kubeContexts, kubeContextTabs, lastSync, prLastUpdated, prLoading, syncInterval, isSyncing, syncProgress, onSyncAll, onRefreshPRs, onOpenRepositories, onOpenPRs, onOpenKubernetes, onOpenSettings, onOpenWorkspace, onOpenRepo, onOpenPRDetail, onOpenKubeDetail, onViewMetric }: DashboardProps) {
  const synced = repos.filter((repo) => repo.status === 'synced').length;
  const behind = repos.filter((repo) => repo.status === 'behind').length;
  const errors = repos.filter((repo) => repo.status === 'error').length;
  const visibleRepoNames = new Set(repos.map((repo) => repo.name));
  const visiblePRs = prs.filter((pr) => !pr.repoName || visibleRepoNames.has(pr.repoName));
  const visibleOpenPRs = visiblePRs.filter((pr) => pr.state === 'open').length;
  const visibleApprovedPRs = visiblePRs.filter((pr) => pr.approved).length;
  const kube = useKubernetesDashboardData(kubeContexts, kubeContextTabs);
  const [drawerItem, setDrawerItem] = useState<DashboardDrawerItem | null>(null);
  const activityLastUpdated = [lastSync, kube.lastUpdated].filter(Boolean).sort().at(-1) ?? '';
  const syncRef = useRef(onSyncAll);
  const prRefreshRef = useRef(onRefreshPRs);
  syncRef.current = onSyncAll;
  prRefreshRef.current = onRefreshPRs;

  useEffect(() => {
    prRefreshRef.current();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      syncRef.current();
      prRefreshRef.current();
      kube.refresh();
    }, Math.max(1, syncInterval) * 60 * 1000);
    return () => clearInterval(interval);
  }, [syncInterval, kube.refresh]);

  return <main className="dashboard-view">
    <div className="dashboard-header"><div><span className="dashboard-eyebrow">Workspace dashboard</span><h1>{workspaceName}</h1><p title={workspacePath}>{workspacePath}</p></div><div className="dashboard-header-actions"><button type="button" className="dashboard-secondary-button" onClick={onOpenSettings}>Settings</button><button type="button" className="dashboard-sync-button" onClick={onSyncAll} disabled={isSyncing}>{isSyncing ? `Syncing ${syncProgress.done}/${syncProgress.total}` : 'Sync all'}</button></div></div>
    <section className="dashboard-branch-card"><div><span className="dashboard-section-kicker">Current comparison</span><strong>{release} <span>→</span> {base}</strong></div><span className={`dashboard-sync-pill ${isSyncing ? 'is-syncing' : lastSync ? 'is-synced' : ''}`}>{isSyncing ? 'Sync in progress' : lastSync ? `Synced ${timeAgo(lastSync)} ago` : 'Not synced yet'}</span></section>
    <section className="dashboard-metrics" aria-label="Workspace health"><DashboardMetric label="Repositories" value={repos.length} detail={`${synced} synced`} onViewDetail={() => onViewMetric('repositories')} /><DashboardMetric label="Not synced repositories" value={behind} tone={behind > 0 ? 'red' : 'green'} detail={behind > 0 ? 'Needs attention' : 'All clear'} onViewDetail={() => onViewMetric('behind')} /><DashboardMetric label="Open pull requests" value={visibleOpenPRs} tone="yellow" detail={`${visibleApprovedPRs} approved`} onViewDetail={() => onViewMetric('pullRequests')} /><DashboardMetric label="Sync errors" value={errors} tone={errors > 0 ? 'red' : 'green'} detail={errors > 0 ? 'Needs attention' : 'No errors'} onViewDetail={() => onViewMetric('errors')} /></section>
    <div className="dashboard-grid"><DashboardActivityCard repos={repos} kubeActivity={kube.activity} kubeLoading={kube.loading} onOpenRepositories={onOpenRepositories} onOpenKubernetes={onOpenKubernetes} onSelectRepo={(repo) => setDrawerItem({ type: 'repo', repo })} onSelectKube={(entry) => setDrawerItem({ type: 'kube', entry })} lastUpdated={activityLastUpdated} onRefresh={() => { onSyncAll(); kube.refresh(); }} refreshing={isSyncing} /><PullRequestCard prs={visiblePRs} onOpenPRs={onOpenPRs} lastUpdated={prLastUpdated} onRefresh={onRefreshPRs} loading={prLoading} /></div>
    <div className="dashboard-insight-grid"><KubernetesHealthCard contextNames={kubeContexts.map((context) => context.name)} activity={kube.activity} issues={kube.healthIssues} loading={kube.loading} error={kube.error} lastUpdated={kube.lastUpdated} onRefresh={kube.refresh} onOpenKubernetes={onOpenKubernetes} onSelectKube={(entry) => setDrawerItem({ type: 'kube', entry })} /><JiraLinksCard prs={visiblePRs} onOpenPRs={onOpenPRs} onSelectPR={(pr) => setDrawerItem({ type: 'pr', pr })} lastUpdated={prLastUpdated} onRefresh={onRefreshPRs} loading={prLoading} /></div>
    <QuickActions onSyncAll={onSyncAll} onOpenRepositories={onOpenRepositories} onOpenPRs={onOpenPRs} onOpenKubernetes={onOpenKubernetes} onOpenWorkspace={onOpenWorkspace} />
    {drawerItem && <DashboardDetailDrawer item={drawerItem} onClose={() => setDrawerItem(null)} onViewDetail={() => { const item = drawerItem; setDrawerItem(null); if (item.type === 'repo') onOpenRepo(item.repo); else if (item.type === 'pr') onOpenPRDetail(item.pr); else onOpenKubeDetail(item.entry); }} />}
  </main>;
}
