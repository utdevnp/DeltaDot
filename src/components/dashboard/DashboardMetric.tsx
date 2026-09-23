export function DashboardMetric({ label, value, tone = 'blue', detail, onViewDetail }: { label: string; value: string | number; tone?: 'blue' | 'green' | 'yellow' | 'red'; detail?: string; onViewDetail?: () => void }) {
  return <div className={`dashboard-metric dashboard-metric-${tone}`}><span className="dashboard-metric-label">{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}{onViewDetail && <button type="button" className="dashboard-metric-detail" onClick={onViewDetail}>View detail ↗</button>}</div>;
}

export function DashboardCardFooter({ updatedAt, loading, onRefresh }: { updatedAt: string; loading?: boolean; onRefresh: () => void }) {
  return <div className="dashboard-card-footer"><span>{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not updated yet'}</span><button type="button" className="dashboard-card-refresh" onClick={onRefresh} disabled={loading} aria-label="Refresh card" title="Refresh card">↻</button></div>;
}
