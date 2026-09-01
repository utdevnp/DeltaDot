import React from 'react';
import type { JiraIssue, PR } from '../../core/types.js';
import { timeAgo } from '../../core/utils.js';

export interface PRSearchResult {
  jira: JiraIssue;
  prs: Array<PR & { mergedAt?: string; mergedBy?: string }>;
}

interface PRsViewProps {
  prs: PR[];
  loading: boolean;
  error: string;
  selected: number;
  filter: 'open' | 'closed' | 'all';
  onSelect: (i: number) => void;
  onBack: () => void;
  onSelectPR: () => void;
  onOpenConfig: () => void;
  onFilterChange: (f: 'open' | 'closed' | 'all') => void;
  onSearch: (query: string) => Promise<PRSearchResult>;
  onReviewSearchResult: (pr: PR, jira: JiraIssue) => Promise<void>;
}

function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: 6,
        border: active ? '1px solid var(--accent-blue)' : '1px solid transparent',
        background: active ? 'var(--tint-blue)' : 'transparent',
        color: active ? 'var(--accent-blue)' : 'var(--text-dim)',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}

function relativeDate(iso?: string): string {
  if (!iso) return '—';
  const value = timeAgo(iso);
  return value === 'now' ? 'just now' : value.replace(/^(\d+)([smhdw]|mo|y)$/, (_, amount, unit) => `${amount} ${({ s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week', mo: 'month', y: 'year' } as Record<string, string>)[unit]}${amount === '1' ? '' : 's'} ago`);
}

export function PRsView({ prs, loading, error, selected, filter, onSelect, onBack, onSelectPR, onOpenConfig, onFilterChange, onSearch }: PRsViewProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState('');
  const [searchResult, setSearchResult] = React.useState<PRSearchResult | null>(null);
  const [selectedSearchPR, setSelectedSearchPR] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(prs.length / pageSize));
  const pageStart = page * pageSize;
  const visiblePRs = prs.slice(pageStart, pageStart + pageSize);
  const filterLabel = filter === 'open' ? 'Open' : filter === 'closed' ? 'Closed' : 'All';

  React.useEffect(() => {
    setPage(0);
  }, [filter, prs.length]);

  React.useEffect(() => {
    setPage(Math.min(Math.floor(selected / pageSize), pageCount - 1));
  }, [selected, pageCount]);

  const submitSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query || searching) return;
    setSearching(true);
    setSearchError('');
    try {
      setSearchResult(await onSearch(query));
      setSelectedSearchPR(0);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Pull Request</span>
        <div style={{ flex: 1 }} />
        <FilterTab label="Open" active={filter === 'open'} onClick={() => onFilterChange('open')} />
        <FilterTab label="Closed" active={filter === 'closed'} onClick={() => onFilterChange('closed')} />
        <FilterTab label="All" active={filter === 'all'} onClick={() => onFilterChange('all')} />
        <form onSubmit={submitSearch} style={{ display: 'flex', gap: 6, width: 310, marginLeft: 8 }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Jira key (e.g. NUVEI-123)"
            aria-label="Search PR by Jira ticket"
            disabled={searching}
            style={{ flex: 1, minWidth: 0, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12, outline: 'none' }}
          />
          <button type="submit" disabled={loading || searching || !searchQuery.trim()} style={{ padding: '4px 10px', border: '1px solid var(--border-blue)', borderRadius: 6, background: 'var(--tint-blue)', color: 'var(--accent-blue)', cursor: loading || searching || !searchQuery.trim() ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, opacity: loading || searching || !searchQuery.trim() ? 0.55 : 1 }}>
            {searching ? 'Searching…' : 'Find'}
          </button>
        </form>
        <button className="back-btn" onClick={onBack}>←</button>
      </div>
      {searchError && <div style={{ padding: '6px 16px', color: 'var(--accent-red)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{searchError}</div>}
      {searchResult && (
        <div role="presentation" onClick={() => setSearchResult(null)} style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'color-mix(in srgb, var(--bg-primary) 68%, transparent)' }}>
          <aside role="dialog" aria-label="Jira search results" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, width: 430, maxWidth: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-pop)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ color: 'var(--accent-blue)', fontSize: 15, fontWeight: 700 }}>{searchResult.jira.key}</div>
              <button onClick={() => setSearchResult(null)} aria-label="Close search results" style={{ border: 0, background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>
              <div style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>{searchResult.jira.summary}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <span className="jira-chip dim">{searchResult.jira.status || 'Unknown status'}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12, alignSelf: 'center' }}>{searchResult.jira.issueType || 'Task'}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Worked by</span>
                <strong style={{ color: 'var(--text-primary)', fontSize: 12 }}>{searchResult.jira.assignee || 'unassigned'}</strong>
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Updated</span>
                <strong style={{ color: 'var(--text-secondary)', fontSize: 12 }} title={searchResult.jira.updatedAt ? new Date(searchResult.jira.updatedAt).toLocaleString() : undefined}>{relativeDate(searchResult.jira.updatedAt)}</strong>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, margin: '20px 0 7px' }}>Related pull requests</div>
              {searchResult.prs.length === 0 && <div style={{ padding: '12px 0', color: 'var(--text-dim)', fontSize: 12 }}>No related pull request found for this ticket.</div>}
              {searchResult.prs.map((pr, index) => (
                <div key={`${pr.repoName}-${pr.number}`} onClick={() => setSelectedSearchPR(index)} style={{ padding: '10px 8px', borderTop: '1px solid var(--border)', borderRadius: 5, background: index === selectedSearchPR ? 'var(--tint-blue)' : 'transparent', cursor: 'pointer' }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{pr.title}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 7 }}>#{pr.number} · {pr.repoName} · {pr.state}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Raised by</span>
                    <strong style={{ color: 'var(--text-primary)', fontSize: 12 }}>{pr.author || 'unknown'}</strong>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }} title={new Date(pr.createdAt).toLocaleString()}>Raised <strong>{relativeDate(pr.createdAt)}</strong></span>
                    {pr.mergedAt ? <>
                      <span className="jira-chip green">Merged</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>by <strong>{pr.mergedBy || 'unknown'}</strong>, <strong title={new Date(pr.mergedAt).toLocaleString()}>{relativeDate(pr.mergedAt)}</strong></span>
                    </> : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Not merged</span>}
                  </div>
                </div>
              ))}
            </div>
            {searchResult.prs.length > 0 && <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button onClick={() => { const pr = searchResult.prs[selectedSearchPR]; if (pr) onReviewSearchResult(pr, searchResult.jira).catch((err) => setSearchError(err instanceof Error ? err.message : String(err))); }} style={{ width: '100%', padding: '9px 12px', border: 0, borderRadius: 6, background: 'linear-gradient(135deg, var(--btn-blue), var(--btn-blue-dark))', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>Review selected PR</button>
            </div>}
          </aside>
        </div>
      )}
      {loading ? (
        <div className="state-message">Loading pull requests...</div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <div style={{ color: 'var(--accent-red)', fontSize: 14, textAlign: 'center', lineHeight: 1.6, maxWidth: 480 }}>{error}</div>
          {(error.toLowerCase().includes('token') || error.toLowerCase().includes('config') || error.toLowerCase().includes('settings')) && <button onClick={onOpenConfig} style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Open Settings</button>}
        </div>
      ) : prs.length === 0 ? (
        <div className="empty-state">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 15h-6"/>
            <path d="M9 9H3"/>
            <path d="M21 9h-6"/>
            <path d="M15 15H3"/>
          </svg>
          <div className="text" style={{ marginTop: 8 }}>No {filterLabel.toLowerCase()} pull requests</div>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-header">
            <div className="cell" style={{ width: 50, flexShrink: 0 }}>#</div>
            <div className="cell" style={{ flex: 3, minWidth: 0 }}>TITLE</div>
            <div className="cell" style={{ width: 74, flexShrink: 0 }}>STATE</div>
            <div className="cell" style={{ width: 44, flexShrink: 0, textAlign: 'center' }}>APRVD</div>
            <div className="cell" style={{ width: 66, flexShrink: 0, textAlign: 'right', paddingRight: 18 }}>AGE</div>
            <div className="cell" style={{ width: 120, flexShrink: 0 }}>AUTHOR</div>
          </div>
          {visiblePRs.map((pr, i) => (
            <div
              key={`${pr.repoName}-${pr.number}`}
              className={`table-row ${pageStart + i === selected ? 'selected' : ''}`}
              onClick={() => { onSelect(pageStart + i); onSelectPR(); }}
            >
              <div className="cell pr-number" style={{ width: 50, flexShrink: 0 }}>#{pr.number}</div>
              <div className="cell pr-title" style={{ flex: 3, minWidth: 0, fontWeight: i === selected ? 600 : 400 }}>
                {pr.title}
              </div>
              <div className="cell" style={{ width: 74, flexShrink: 0 }}>
                <span className={`pr-state ${pr.state.toLowerCase()}`}>{pr.state}</span>
              </div>
              <div className="cell" style={{ width: 44, flexShrink: 0, textAlign: 'center' }}>
                <span className="pr-approved">{pr.approved ? '✓' : ''}</span>
              </div>
              <div className="cell pr-age" style={{ width: 66, flexShrink: 0, textAlign: 'right', paddingRight: 18 }}>
                {timeAgo(pr.createdAt)}
              </div>
              <div className="cell" style={{ width: 120, flexShrink: 0, color: 'var(--text-secondary)', fontSize: 12 }}>
                {pr.author}
              </div>
            </div>
          ))}
          {pageCount > 1 && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} style={{ padding: '4px 9px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>Previous</button>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Page {page + 1} of {pageCount}</span>
            <button disabled={page >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} style={{ padding: '4px 9px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: page >= pageCount - 1 ? 'default' : 'pointer', opacity: page >= pageCount - 1 ? 0.5 : 1 }}>Next</button>
          </div>}
        </div>
      )}
    </div>
  );
}
