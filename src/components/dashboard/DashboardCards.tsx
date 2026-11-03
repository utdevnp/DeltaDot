import { useState } from 'react';
import type { PR, RepoState } from '../../../core/types.js';
import { timeAgo, truncate } from '../../../core/utils.js';
import { contextColor } from './helpers.js';
import type { KubeActivityEntry } from './types.js';
import { DashboardCardFooter } from './DashboardMetric.js';
import { DashboardIcon, type DashboardIconName } from './DashboardIcon.js';

export function PullRequestCard({ prs, onOpenPRs, onSelectPR, lastUpdated, onRefresh, loading }: { prs: PR[]; onOpenPRs: (filter?: 'all' | 'review' | 'conflicts' | 'approved') => void; onSelectPR: (pr: PR) => void; lastUpdated: string; onRefresh: () => void; loading: boolean }) {
  const [filter, setFilter] = useState<'all' | 'review' | 'conflicts' | 'approved'>('all');
  const open = prs.filter((pr) => pr.state === 'open');
  const approved = open.filter((pr) => pr.approved).length;
  const conflicts = open.filter((pr) => pr.hasConflicts === true).length;
  const needsReview = open.filter((pr) => !pr.approved).length;
  const filtered = open.filter((pr) => filter === 'all' || (filter === 'review' && !pr.approved && !pr.hasConflicts) || (filter === 'conflicts' && pr.hasConflicts) || (filter === 'approved' && pr.approved));
  return <section className="card card-border bg-base-200 dashboard-card dashboard-pr-card">
    <div className="dashboard-card-header"><div className="dashboard-heading-with-icon"><span className="dashboard-heading-icon"><DashboardIcon name="pull-request" size={23} /></span><div><span className="dashboard-section-kicker">Review queue</span><h2>Pull requests</h2></div></div><select className="select select-sm dashboard-pr-filter-select" aria-label="Filter pull requests" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All ({open.length})</option><option value="review">Needs review ({needsReview})</option><option value="conflicts">Conflicts ({conflicts})</option><option value="approved">Approved ({approved})</option></select></div>
    <div className="dashboard-pr-table-scroll"><div className="dashboard-table-head dashboard-pr-table-head"><span>PR</span><span>Title</span><span>Status</span></div>
    {filtered.length === 0 ? <p className="dashboard-card-note">{open.length === 0 ? 'No open pull requests are available for this workspace.' : 'No pull requests match this filter.'}</p> : <div className="dashboard-pr-list">{filtered.slice(0, 5).map((pr) => <button type="button" className="dashboard-pr-row" key={`${pr.repoName}-${pr.number}`} onClick={() => onSelectPR(pr)}><span className="dashboard-pr-number">#{pr.number}</span><span className="dashboard-pr-title"><strong>{truncate(pr.title, 48)}</strong><small><DashboardIcon name="repository" size={12} />{pr.repoName || 'Repository'}</small></span><span className={`badge badge-soft dashboard-pr-status ${pr.hasConflicts ? 'badge-error is-conflict' : pr.approved ? 'badge-success is-approved' : 'badge-warning is-review'}`}><DashboardIcon name={pr.hasConflicts ? 'alert' : pr.approved ? 'check' : 'clock'} size={12} />{pr.hasConflicts ? 'Conflicts' : pr.approved ? 'Approved' : 'Needs review'}</span></button>)}</div>}</div>
    <DashboardCardFooter updatedAt={lastUpdated} loading={loading} onRefresh={onRefresh} actionLabel="View all PRs" onAction={() => onOpenPRs(filter)} />
  </section>;
}

export function KubernetesHealthCard({ contextNames, resources, issues, loading, error, lastUpdated, onRefresh, onOpenKubernetes, onSelectKube }: { contextNames: string[]; activity: KubeActivityEntry[]; resources: KubeActivityEntry[]; issues: KubeActivityEntry[]; loading: boolean; error: boolean; lastUpdated: string; onRefresh: () => void; onOpenKubernetes: () => void; onSelectKube: (entry: KubeActivityEntry) => void }) {
  const [tab, setTab] = useState<'health' | 'clusters'>('health');
  const [resourceTab, setResourceTab] = useState<'pods' | 'deployments' | 'namespaces'>('pods');
  const allContextNames = [...new Set([...contextNames, ...resources.map((entry) => entry.context), ...issues.map((issue) => issue.context)])];
  const pods = resources.filter((entry) => entry.kind === 'Pod');
  const deployments = resources.filter((entry) => entry.kind === 'Deployment');
  const readyPods = pods.filter((entry) => entry.healthy && !entry.pending).length;
  const readyDeployments = deployments.filter((entry) => entry.healthy && !entry.pending).length;
  const resourceEntries = resourceTab === 'pods' ? pods : deployments;
  const previewCount = Math.min(3, resourceEntries.length);
  const previewKind = resourceTab === 'pods' ? 'pod' : 'deployment';

  const namespaceMap = new Map<string, { context: string; namespace: string; total: number; healthy: number; pending: number; unhealthy: number }>();
  for (const entry of resources) {
    const namespace = entry.namespace || 'Cluster-wide';
    const key = JSON.stringify([entry.context, namespace]);
    const group = namespaceMap.get(key) ?? { context: entry.context, namespace, total: 0, healthy: 0, pending: 0, unhealthy: 0 };
    group.total += 1;
    if (entry.pending) group.pending += 1;
    else if (entry.healthy) group.healthy += 1;
    else group.unhealthy += 1;
    namespaceMap.set(key, group);
  }
  const namespaces = [...namespaceMap.values()].sort((a, b) => b.unhealthy - a.unhealthy || b.pending - a.pending || a.namespace.localeCompare(b.namespace));
  const displayed = resourceTab === 'namespaces' ? namespaces : resourceEntries;
  const healthy = resourceTab === 'namespaces' ? namespaces.filter((group) => group.unhealthy === 0 && group.pending === 0).length : resourceEntries.filter((entry) => entry.healthy && !entry.pending).length;
  const pending = resourceTab === 'namespaces' ? namespaces.filter((group) => group.unhealthy === 0 && group.pending > 0).length : resourceEntries.filter((entry) => entry.pending).length;
  const unhealthy = displayed.length - healthy - pending;
  const healthRank = (entry: KubeActivityEntry) => !entry.healthy && !entry.pending ? 0 : entry.pending ? 1 : 2;
  const updatedAtTime = (entry: KubeActivityEntry) => {
    const timestamp = Date.parse(entry.updatedAt);
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  const recentEntries = [...resourceEntries]
    .sort((a, b) => updatedAtTime(b) - updatedAtTime(a) || healthRank(a) - healthRank(b) || a.name.localeCompare(b.name))
    .slice(0, 3);
  const heatmapTiles = resourceTab === 'namespaces'
    ? namespaces.map((group) => ({
      key: JSON.stringify([group.context, group.namespace]),
      state: group.unhealthy || group.pending ? 'unhealthy' : 'healthy',
      label: `${group.namespace} in ${group.context}: ${group.total} resources, ${group.healthy} healthy, ${group.pending} pending, ${group.unhealthy} unhealthy`,
    }))
    : [...resourceEntries].sort((a, b) => healthRank(a) - healthRank(b) || a.context.localeCompare(b.context) || a.name.localeCompare(b.name)).map((entry) => ({
      key: JSON.stringify([entry.context, entry.kind, entry.namespace, entry.name]),
      state: entry.healthy && !entry.pending ? 'healthy' : 'unhealthy',
      label: `${entry.kind} ${entry.name} in ${entry.context} / ${entry.namespace || 'Cluster-wide'}: ${entry.reason}`,
    }));
  const heatmapPreview = heatmapTiles.slice(0, 48);
  const clusterCounts = allContextNames.map((context) => {
    const entries = resources.filter((entry) => entry.context === context);
    return {
      context,
      healthy: entries.filter((entry) => entry.healthy && !entry.pending).length,
      unhealthy: entries.filter((entry) => !entry.healthy && !entry.pending).length,
      pending: entries.filter((entry) => entry.pending).length,
    };
  });

  return <section className="card card-border bg-base-200 dashboard-card dashboard-insight-card">
    <div className="dashboard-card-header">
      <div className="dashboard-heading-with-icon">
        <span className="dashboard-heading-icon dashboard-kube-heading-icon"><DashboardIcon name="kubernetes" size={24} /></span>
        <div><span className="dashboard-section-kicker">Kubernetes</span><h2>Kubernetes health</h2></div>
      </div>
      <div className="tabs tabs-box tabs-xs dashboard-card-tabs" role="tablist" aria-label="Cluster health view">
        <button type="button" role="tab" aria-selected={tab === 'health'} className={`tab ${tab === 'health' ? 'tab-active is-active' : ''}`} onClick={() => setTab('health')}><DashboardIcon name="check" size={13} />Cluster health</button>
        <button type="button" role="tab" aria-selected={tab === 'clusters'} className={`tab ${tab === 'clusters' ? 'tab-active is-active' : ''}`} onClick={() => setTab('clusters')}><DashboardIcon name="workspace" size={13} />By cluster</button>
      </div>
    </div>
    <div className="dashboard-summary-strip">
      <div><span><DashboardIcon name="workspace" size={15} />Contexts</span><strong>{allContextNames.length}</strong></div>
      <div><span><DashboardIcon name="repository" size={15} />Pods ready</span><strong>{loading || error ? '—' : `${readyPods} / ${pods.length}`}</strong></div>
      <div><span><DashboardIcon name="deployment" size={15} />Deployments</span><strong>{loading || error ? '—' : `${readyDeployments} / ${deployments.length}`}</strong></div>
      <div><span><DashboardIcon name="workspace" size={15} />Namespaces</span><strong>{loading || error ? '—' : namespaces.length}</strong></div>
    </div>
    {tab === 'health' ? <>
      <div className="tabs tabs-xs dashboard-resource-tabs" role="tablist" aria-label="Kubernetes resource type">
        {(['pods', 'deployments', 'namespaces'] as const).map((resource) =>
          <button type="button" role="tab" aria-selected={resourceTab === resource} className={`tab ${resourceTab === resource ? 'tab-active is-active' : ''}`} key={resource} onClick={() => setResourceTab(resource)}>{resource[0]!.toUpperCase() + resource.slice(1)}</button>
        )}
      </div>
      {loading ? <div className="dashboard-empty">Checking {resourceTab} health…</div>
        : error ? <div className="dashboard-empty">Health data unavailable. Open Kubernetes to check context access.</div>
        : displayed.length === 0 ? <div className="dashboard-empty">No {resourceTab} data is available for the configured Kubernetes contexts.</div>
        : <>
          <div className="dashboard-kube-status-summary" aria-label={`${healthy} healthy, ${unhealthy} unhealthy, ${pending} pending`}>
            <span className="is-healthy">{healthy} healthy</span>
            <span className="is-unhealthy">{unhealthy} unhealthy</span>
            <span className="is-pending">{pending} pending</span>
          </div>
          <div className="dashboard-kube-heatmap-scroll" role="region" aria-label={`${resourceTab} health preview`}>
            <div className="dashboard-kube-heatmap">
              {heatmapPreview.map((tile) => <span key={tile.key} className={`dashboard-kube-heatmap-cell is-${tile.state}`} role="img" aria-label={tile.label} title={tile.label} />)}
            </div>
          </div>
          {heatmapTiles.length > heatmapPreview.length && <span className="dashboard-kube-heatmap-note">Showing {heatmapPreview.length} of {heatmapTiles.length} · issues first</span>}
          {resourceTab !== 'namespaces' && <div className="dashboard-kube-health-list" role="region" aria-label={`Latest ${previewCount} ${previewKind}${previewCount === 1 ? '' : 's'}`}>
            <span className="dashboard-kube-list-caption">Latest {previewCount} {previewKind}{previewCount === 1 ? '' : 's'}</span>
            {recentEntries.map((entry) => {
                const state = entry.pending ? 'pending' : entry.healthy ? 'healthy' : 'unhealthy';
                return <button type="button" className="dashboard-kube-health-row" key={JSON.stringify([entry.context, entry.kind, entry.namespace, entry.name])} onClick={() => onSelectKube(entry)}>
                  <span className={`dashboard-kube-health-dot is-${state}`} aria-hidden="true" />
                  <span className="dashboard-kube-health-copy">
                    <strong>{entry.name}</strong>
                    <small><em style={{ color: contextColor(entry.context) }}>{entry.context}</em> · {entry.namespace || 'Cluster-wide'}{!entry.healthy ? ` · ${entry.reason}` : ''}</small>
                  </span>
                  <span className={`badge badge-soft dashboard-kube-health-badge badge-${state === 'healthy' ? 'success' : state === 'pending' ? 'warning' : 'error'}`}>{state === 'healthy' ? 'Healthy' : state === 'pending' ? 'Pending' : 'Unhealthy'}</span>
                </button>;
              })}
          </div>}
        </>}
    </> : <div className="dashboard-cluster-counts">
      {loading ? <div className="dashboard-empty">Checking cluster health…</div>
        : error ? <div className="dashboard-empty">Cluster counts unavailable. Open Kubernetes to check context access.</div>
        : resources.length === 0 ? <div className="dashboard-empty">No Kubernetes resource data is available for the configured contexts.</div>
        : clusterCounts.map(({ context, healthy: ready, unhealthy: failed, pending: waiting }) =>
          <button type="button" className="dashboard-cluster-count-row" key={context} onClick={onOpenKubernetes}>
            <span className="dashboard-cluster-count-name" style={{ color: contextColor(context) }}>{context}</span>
            <span className="dashboard-cluster-count-label">{ready} healthy · {failed} unhealthy · {waiting} pending</span>
          </button>
        )}
    </div>}
    <DashboardCardFooter updatedAt={lastUpdated} loading={loading} onRefresh={onRefresh} actionLabel="Open Kubernetes" onAction={onOpenKubernetes} />
  </section>;
}

export function JiraLinksCard({ prs, onOpenJira, onSelectPR, lastUpdated, onRefresh, loading }: { prs: PR[]; onOpenJira: () => void; onSelectPR: (pr: PR) => void; lastUpdated: string; onRefresh: () => void; loading: boolean }) {
  const classified = prs.map((pr) => ({ pr, key: `${pr.title} ${pr.sourceBranch}`.match(/\b[A-Z][A-Z0-9]+-\d+\b/)?.[0] ?? '' }));
  const linked = classified.filter((item) => item.key);
  const unlinked = classified.filter((item) => !item.key);
  const issueCount = new Set(linked.map((item) => item.key)).size;
    const renderList = (items: typeof classified, empty: string) => items.length > 0 ? <div className="dashboard-jira-list">{items.slice(0, 4).map(({ pr, key }) => <button type="button" className="dashboard-jira-row" key={`${pr.repoName}-${pr.number}`} onClick={() => onSelectPR(pr)}>{key && <span className="badge badge-outline badge-primary dashboard-jira-key"><DashboardIcon name="jira" size={12} />{key}</span>}<span className="dashboard-jira-copy"><strong>{truncate(pr.title, 42)}</strong><small><span className="dashboard-jira-pr-number"><DashboardIcon name="pull-request" size={12} />PR #{pr.number}</span><span>{pr.author || 'Unknown author'}</span><span>{pr.createdAt ? timeAgo(pr.createdAt) + ' ago' : 'time unavailable'}</span></small></span><span className="dashboard-jira-row-arrow">↗</span></button>)}</div> : <p className="dashboard-card-note">{empty}</p>;
  return <section className="card card-border bg-base-200 dashboard-card dashboard-insight-card dashboard-jira-card"><div className="dashboard-card-header"><div className="dashboard-heading-with-icon"><span className="dashboard-heading-icon dashboard-jira-heading-icon"><DashboardIcon name="jira" size={24} /></span><div><span className="dashboard-section-kicker">Jira links</span><h2>Jira tracking</h2></div></div><button type="button" className="btn btn-ghost btn-sm dashboard-link-button" onClick={onOpenJira}>View in Jira <DashboardIcon name="arrow-right" size={14} /></button></div><div className="dashboard-summary-strip dashboard-jira-summary"><div><span><DashboardIcon name="pull-request" size={15} />Linked PRs</span><strong>{linked.length}</strong></div><div><span><DashboardIcon name="jira" size={15} />Jira issues</span><strong>{issueCount}</strong></div><div><span><DashboardIcon name="clock" size={15} />In Progress</span><strong title="Jira workflow statuses are not available from the current PR data">—</strong></div><div><span><DashboardIcon name="check" size={15} />Done (this release)</span><strong title="Jira workflow statuses are not available from the current PR data">—</strong></div></div><div className="dashboard-jira-columns"><div className="dashboard-jira-panel"><div className="dashboard-jira-panel-title"><span>Linked pull requests</span><strong>{linked.length}</strong></div>{renderList(linked, 'No PRs are linked to Jira tickets.')}</div><div className="dashboard-jira-panel"><div className="dashboard-jira-panel-title"><span>Not linked</span><strong>{unlinked.length}</strong></div>{renderList(unlinked, 'All loaded PRs are linked to Jira tickets.')}</div></div><DashboardCardFooter updatedAt={lastUpdated} loading={loading} onRefresh={onRefresh} /></section>;
}

export function QuickActions({ onOpenRepositories, onCreatePR }: { onOpenRepositories: () => void; onCreatePR: () => void }) {
  const actions: { icon: DashboardIconName; label: string; description: string; onClick: () => void }[] = [
    { icon: 'branch', label: 'Compare branches', description: 'Open repository view', onClick: onOpenRepositories },
    { icon: 'pull-request', label: 'Create pull request', description: 'Compare release to base', onClick: onCreatePR },
  ];
  return <section className="card card-border bg-base-200 dashboard-card dashboard-quick-card"><div className="dashboard-card-header"><div className="dashboard-heading-with-icon"><span className="dashboard-heading-icon"><DashboardIcon name="activity" size={24} /></span><div><span className="dashboard-section-kicker">Quick actions</span><h2>Quick actions</h2></div></div></div><div className="dashboard-actions">{actions.map((action) => <button type="button" className="btn btn-outline dashboard-action" key={action.label} onClick={action.onClick}><span className="dashboard-action-icon"><DashboardIcon name={action.icon} size={18} /></span><span className="dashboard-action-copy"><strong>{action.label}</strong><small>{action.description}</small></span><span className="dashboard-action-arrow"><DashboardIcon name="arrow-right" size={15} /></span></button>)}</div></section>;
}
