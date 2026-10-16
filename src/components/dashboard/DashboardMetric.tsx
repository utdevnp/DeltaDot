export function DashboardMetric({ label, value, tone = 'blue', detail, onViewDetail }: { label: string; value: string | number; tone?: 'blue' | 'green' | 'yellow' | 'red'; detail?: string; onViewDetail?: () => void }) {
  const glyph = tone === 'green' ? '✓' : tone === 'red' ? '!' : tone === 'yellow' ? '⑂' : '▤';
  const trend = tone === 'red' ? 'Needs attention' : tone === 'yellow' ? 'Review queue' : 'Healthy';
  return <div className={`dashboard-metric dashboard-metric-${tone}`}><div className="dashboard-metric-top"><span className="dashboard-metric-icon" aria-hidden="true">{glyph}</span><span className="dashboard-metric-label">{label}</span>{onViewDetail && <button type="button" className="dashboard-metric-detail" onClick={onViewDetail} aria-label={`View ${label} detail`}>›</button>}</div><div className="dashboard-metric-value"><strong>{value}</strong><span className="dashboard-metric-trend">{tone === 'red' ? '↑' : '✓'} {trend}</span></div>{detail && <small className="dashboard-metric-note">{detail}</small>}</div>;
}

export function DashboardCardFooter({ updatedAt, loading, onRefresh }: { updatedAt: string; loading?: boolean; onRefresh: () => void }) {
  return <div className="dashboard-card-footer"><span>{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not updated yet'}</span><button type="button" className="dashboard-card-refresh" onClick={onRefresh} disabled={loading} aria-label="Refresh card" title="Refresh card">↻</button></div>;
}
