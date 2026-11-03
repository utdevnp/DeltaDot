import { useEffect, useRef, useState } from 'react';
import { DashboardMetric } from './dashboard/DashboardMetric.js';
import { DashboardActivityCard } from './dashboard/DashboardActivityCard.js';
import { JiraLinksCard, KubernetesHealthCard, PullRequestCard, QuickActions } from './dashboard/DashboardCards.js';
import { useKubernetesDashboardData } from './dashboard/useKubernetesDashboardData.js';
import type { DashboardProps } from './dashboard/types.js';
import { timeAgo } from '../../core/utils.js';
import { DashboardDetailDrawer } from './dashboard/DashboardDetailDrawer.js';
import type { DashboardDrawerItem } from './dashboard/types.js';
import { DashboardIcon } from './dashboard/DashboardIcon.js';

export type { DashboardProps } from './dashboard/types.js';

export function Dashboard({ workspaceName, workspacePath, base, release, repos, prs, kubeContexts, kubeContextTabs, lastSync, prLastUpdated, prLoading, syncInterval, isSyncing, syncProgress, onSyncAll, onRefreshPRs, onOpenRepositories, onOpenPRs, onOpenKubernetes, onOpenJira, onCreatePR, onOpenSettings, onOpenCommitList, onOpenPRDetail, onOpenKubeDetail, onOpenKubeLogs, onViewMetric }: DashboardProps) {
  const synced = repos.filter((repo) => repo.status === 'synced').length;
  const behind = repos.filter((repo) => repo.status === 'behind').length;
  const errors = repos.filter((repo) => repo.status === 'error').length;
  const visibleRepoNames = new Set(repos.map((repo) => repo.name));
  const visiblePRs = prs.filter((pr) => !pr.repoName || visibleRepoNames.has(pr.repoName));
  const visibleOpenPRs = visiblePRs.filter((pr) => pr.state === 'open').length;
  const visibleApprovedPRs = visiblePRs.filter((pr) => pr.approved).length;
  const kube = useKubernetesDashboardData(kubeContexts, kubeContextTabs, workspacePath);
  const [drawerItem, setDrawerItem] = useState<DashboardDrawerItem | null>(null);
  const activityLastUpdated = [lastSync, kube.lastUpdated].filter(Boolean).sort().at(-1) ?? '';
  const syncRef = useRef(onSyncAll);
  const prRefreshRef = useRef(onRefreshPRs);
  syncRef.current = onSyncAll;
  prRefreshRef.current = onRefreshPRs;

  useEffect(() => {
    const interval = setInterval(() => {
      syncRef.current();
      prRefreshRef.current();
      kube.refresh();
    }, Math.max(1, syncInterval) * 60 * 1000);
    return () => clearInterval(interval);
  }, [syncInterval, kube.refresh]);

  return <main className="dashboard-view">
    <div className="dashboard-header"><div><span className="dashboard-eyebrow">Workspace dashboard</span><h1>{workspaceName}</h1><p title={workspacePath}>{workspacePath}</p></div><div className="dashboard-header-actions"><button type="button" className="btn btn-outline btn-sm dashboard-secondary-button" onClick={onOpenSettings}><DashboardIcon name="settings" size={16} /> Settings</button><button type="button" className="btn btn-primary btn-sm dashboard-sync-button" onClick={onSyncAll} disabled={isSyncing}><DashboardIcon name="sync" size={17} /> {isSyncing ? `Syncing ${syncProgress.done}/${syncProgress.total}` : 'Sync all'}</button></div></div>
    <section className="card card-border bg-base-200 dashboard-branch-card">
      <div className="dashboard-comparison-main">
        <div className="dashboard-comparison-label"><DashboardIcon name="branch" size={23} /><span>Comparison (sync)</span></div>
        <div className="dashboard-comparison-branches">
          <span className="dashboard-branch-name"><DashboardIcon name="branch" size={14} />{release}</span>
          <span className="dashboard-comparison-arrow"><DashboardIcon name="arrow-right" size={17} /></span>
          <span className="dashboard-branch-name"><DashboardIcon name="branch" size={14} />{base}</span>
        </div>
      </div>
      <div className="dashboard-comparison-sync">
        <span className={`dashboard-sync-check ${isSyncing ? 'is-syncing' : lastSync ? 'is-synced' : ''}`}>{isSyncing ? <DashboardIcon name="sync" size={14} /> : lastSync ? <DashboardIcon name="check" size={15} /> : <DashboardIcon name="clock" size={15} />}</span>
        <span><strong>{isSyncing ? `Syncing ${syncProgress.done}/${syncProgress.total}` : lastSync ? <>Last sync: <b>{timeAgo(lastSync)} ago</b></> : 'Not synced yet'}</strong><small>{lastSync ? new Date(lastSync).toLocaleString() : 'Sync the workspace to update repositories'}</small></span>
      </div>
    </section>
    <section className="dashboard-metrics" aria-label="Workspace health"><DashboardMetric label="Repositories" value={repos.length} detail={`${synced} synced`} onViewDetail={() => onViewMetric('repositories')} /><DashboardMetric label="Not synced repositories" value={behind} tone={behind > 0 ? 'red' : 'green'} detail={behind > 0 ? 'Needs attention' : 'All clear'} onViewDetail={() => onViewMetric('behind')} /><DashboardMetric label="Open pull requests" value={visibleOpenPRs} tone="yellow" detail={`${visibleApprovedPRs} approved`} onViewDetail={() => onViewMetric('pullRequests')} /><DashboardMetric label="Sync errors" value={errors} tone={errors > 0 ? 'red' : 'green'} detail={errors > 0 ? 'Needs attention' : 'No errors'} onViewDetail={() => onViewMetric('errors')} /></section>
    <div className="dashboard-grid"><DashboardActivityCard repos={repos} kubeActivity={kube.activity} kubeLoading={kube.loading} onOpenRepositories={onOpenRepositories} onOpenKubernetes={onOpenKubernetes} onSelectRepo={(repo) => setDrawerItem({ type: 'repo', repo })} onSelectKube={(entry) => setDrawerItem({ type: 'kube', entry })} lastUpdated={activityLastUpdated} onRefresh={() => { onSyncAll(); kube.refresh(); }} refreshing={isSyncing} /><PullRequestCard prs={visiblePRs} onOpenPRs={onOpenPRs} onSelectPR={(pr) => setDrawerItem({ type: 'pr', pr })} lastUpdated={prLastUpdated} onRefresh={onRefreshPRs} loading={prLoading} /></div>
    <div className="dashboard-insight-grid"><KubernetesHealthCard contextNames={kubeContexts.map((context) => context.name)} activity={kube.activity} resources={kube.resources} issues={kube.healthIssues} loading={kube.loading} error={kube.error} lastUpdated={kube.lastUpdated} onRefresh={kube.refresh} onOpenKubernetes={onOpenKubernetes} onSelectKube={(entry) => setDrawerItem({ type: 'kube', entry })} /><JiraLinksCard prs={visiblePRs} onOpenJira={onOpenJira} onSelectPR={(pr) => setDrawerItem({ type: 'pr', pr })} lastUpdated={prLastUpdated} onRefresh={onRefreshPRs} loading={prLoading} /></div>
    <QuickActions onOpenRepositories={onOpenRepositories} onCreatePR={onCreatePR} />
    {drawerItem && <DashboardDetailDrawer item={drawerItem} onClose={() => setDrawerItem(null)} onOpenKubeLogs={onOpenKubeLogs} onViewDetail={(commitHash) => { const item = drawerItem; setDrawerItem(null); if (item.type === 'repo') onOpenCommitList(item.repo, commitHash); else if (item.type === 'pr') onOpenPRDetail(item.pr); else onOpenKubeDetail(item.entry); }} />}
  </main>;
}
