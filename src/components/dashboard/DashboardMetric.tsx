import { DashboardIcon } from './DashboardIcon.js';

export function DashboardMetric({ label, value, tone = 'blue', detail, onViewDetail }: { label: string; value: string | number; tone?: 'blue' | 'green' | 'yellow' | 'red'; detail?: string; onViewDetail?: () => void }) {
  const icon = label === 'Repositories' ? 'repository' : label === 'Not synced repositories' ? 'sync' : label === 'Open pull requests' ? 'pull-request' : 'alert';
  return <div className={`stats dashboard-metric dashboard-metric-${tone}`}><div className="stat"><div className="stat-title dashboard-metric-top"><span className="dashboard-metric-icon"><DashboardIcon name={icon} size={22} /></span><span className="dashboard-metric-label">{label}</span>{onViewDetail && <button type="button" className="btn btn-ghost btn-xs dashboard-metric-detail" onClick={onViewDetail} aria-label={`View ${label} detail`}><DashboardIcon name="arrow-right" size={15} /></button>}</div><div className="stat-value dashboard-metric-value"><strong>{value}</strong></div>{detail && <div className="stat-desc dashboard-metric-note">{detail}</div>}</div></div>;
}

export function DashboardCardFooter({ updatedAt, loading, onRefresh, actionLabel, onAction }: { updatedAt: string; loading?: boolean; onRefresh: () => void; actionLabel?: string; onAction?: () => void }) {
  return <div className="dashboard-card-footer">
    {actionLabel && onAction && <button type="button" className="btn btn-ghost btn-xs dashboard-card-action" onClick={onAction}>{actionLabel}<DashboardIcon name="arrow-right" size={13} /></button>}
    <div className="dashboard-card-update-group">
      <span className="dashboard-card-updated"><DashboardIcon name="clock" size={13} />{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not updated yet'}</span>
      <button type="button" className="btn btn-ghost btn-xs dashboard-card-refresh" onClick={onRefresh} disabled={loading} aria-label="Refresh card" title="Refresh card"><DashboardIcon name="refresh" size={15} /></button>
    </div>
  </div>;
}
