import type { DashboardDrawerItem } from './types.js';
import { timeAgo } from '../../../core/utils.js';
import { contextColor } from './helpers.js';

interface Props { item: DashboardDrawerItem; onClose: () => void; onViewDetail: () => void; }

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="dashboard-drawer-fact"><span>{label}</span><strong>{value || '—'}</strong></div>;
}

export function DashboardDetailDrawer({ item, onClose, onViewDetail }: Props) {
  const title = item.type === 'repo' ? item.repo.name : item.type === 'pr' ? `PR #${item.pr.number}` : item.entry.name;
  const subtitle = item.type === 'repo' ? 'Repository overview' : item.type === 'pr' ? 'Pull request overview' : `${item.entry.kind} overview`;
  return <><button type="button" className="dashboard-drawer-backdrop" aria-label="Close details" onClick={onClose} /><aside className="dashboard-detail-drawer" aria-label={`${title} details`}><div className="dashboard-drawer-header"><div><span className="dashboard-section-kicker">{subtitle}</span><h2>{title}</h2></div><button type="button" className="dashboard-drawer-close" onClick={onClose} aria-label="Close details">×</button></div>
    <div className="dashboard-drawer-body">{item.type === 'repo' && <><p className="dashboard-drawer-summary">{item.repo.lastCommitMsg || 'No recent commit message available.'}</p><div className="dashboard-drawer-facts"><Fact label="Status" value={item.repo.status} /><Fact label="Branch" value={item.repo.currentBranch} /><Fact label="Last commit" value={item.repo.lastCommitAge} /><Fact label="Author" value={item.repo.lastCommitAuthor} /><Fact label="Version" value={item.repo.latestVersion ?? ''} /></div><div className="dashboard-drawer-path">{item.repo.path}</div></>}
      {item.type === 'pr' && <><p className="dashboard-drawer-summary">{item.pr.title}</p><div className="dashboard-drawer-facts"><Fact label="Repository" value={item.pr.repoName} /><Fact label="Author" value={item.pr.author} /><Fact label="State" value={item.pr.state} /><Fact label="Created" value={item.pr.createdAt ? `${timeAgo(item.pr.createdAt)} ago` : ''} /><Fact label="Branches" value={`${item.pr.sourceBranch} → ${item.pr.targetBranch}`} /><Fact label="Jira" value={`${item.pr.title} ${item.pr.sourceBranch}`.match(/\b[A-Z][A-Z0-9]+-\d+\b/)?.[0] ?? 'Not linked'} /></div><div className="dashboard-drawer-status-line">{item.pr.hasConflicts ? 'Merge conflicts need attention' : item.pr.approved ? 'Approved and ready to merge' : 'Waiting for review'}</div></>}
      {item.type === 'kube' && <><p className="dashboard-drawer-summary">{item.entry.reason}</p><div className="dashboard-drawer-facts"><Fact label="Context" value={item.entry.context} /><Fact label="Kind" value={item.entry.kind} /><Fact label="Namespace" value={item.entry.namespace || 'cluster-wide'} /><Fact label="Updated" value={item.entry.updatedAt ? `${timeAgo(item.entry.updatedAt)} ago` : ''} /><Fact label="Health" value={item.entry.healthy ? 'Healthy' : 'Unhealthy'} /></div><div className="dashboard-drawer-context" style={{ color: contextColor(item.entry.context) }}>{item.entry.context}</div></>}</div>
    <div className="dashboard-drawer-footer"><button type="button" className="dashboard-secondary-button" onClick={onClose}>Close</button><button type="button" className="dashboard-sync-button" onClick={onViewDetail}>View detail ↗</button></div>
  </aside></>;
}
