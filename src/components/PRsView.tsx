import React from 'react';
import type { JiraIssue, PR } from '../../core/types.js';
import { timeAgo } from '../../core/utils.js';

export interface PRSearchResult {
  jira: JiraIssue | null;
  prs: Array<PR & { mergedAt?: string; mergedBy?: string }>;
  phase: 'jira' | 'prs' | 'ready';
  searchingRepo?: string;
  searchedRepos?: number;
  totalRepos?: number;
}

export interface PRSearchViewState {
  query: string;
  result: PRSearchResult | null;
  selectedPR: number;
  selectedPRs: Set<string>;
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
  onSearch: (query: string, onUpdate: (result: PRSearchResult) => void) => Promise<void>;
  onReviewSearchResult: (prs: PR[], jira: JiraIssue) => Promise<void>;
  hasMore: boolean;
  onLoadMore: () => void;
  searchState?: PRSearchViewState;
  onSearchStateChange?: (state: PRSearchViewState) => void;
  autoSearchQuery?: string;
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

export function PRsView({ prs, loading, error, selected, filter, onSelect, onBack, onSelectPR, onOpenConfig, onFilterChange, onSearch, onReviewSearchResult, hasMore, onLoadMore, searchState, onSearchStateChange, autoSearchQuery }: PRsViewProps) {
  const [searchQuery, setSearchQuery] = React.useState(() => searchState?.query ?? '');
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState('');
  const [searchResult, setSearchResult] = React.useState<PRSearchResult | null>(() => searchState?.result ?? null);
  const [selectedSearchPR, setSelectedSearchPR] = React.useState(() => searchState?.selectedPR ?? 0);
  const [selectedSearchPRs, setSelectedSearchPRs] = React.useState<Set<string>>(() => searchState?.selectedPRs ?? new Set());
  const searchRunRef = React.useRef(0);
  const filterLabel = filter === 'open' ? 'Open' : filter === 'closed' ? 'Closed' : 'All';

  React.useEffect(() => {
    onSearchStateChange?.({ query: searchQuery, result: searchResult, selectedPR: selectedSearchPR, selectedPRs: selectedSearchPRs });
  }, [searchQuery, searchResult, selectedSearchPR, selectedSearchPRs, onSearchStateChange]);

  React.useEffect(() => {
    if (!searchResult) return;
    setSelectedSearchPRs((previous) => {
      const next = new Set(previous);
      searchResult.prs.forEach((pr) => next.add(`${pr.repoName}-${pr.number}`));
      return next;
    });
  }, [searchResult?.prs]);

  const submitSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query || searching) return;
    setSearching(true);
    setSearchError('');
    setSearchResult({ jira: null, prs: [], phase: 'jira' });
    setSelectedSearchPRs(new Set());
    const searchRun = ++searchRunRef.current;
    try {
      await onSearch(query, (result) => {
        if (searchRun === searchRunRef.current) setSearchResult(result);
      });
      setSelectedSearchPR(0);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  React.useEffect(() => {
    if (!autoSearchQuery || searchResult || searching || searchQuery.trim() !== autoSearchQuery.trim()) return;
    void submitSearch({ preventDefault: () => {} } as React.FormEvent);
  }, [autoSearchQuery]);

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div className="pr-list-toolbar" style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Pull Requests</span>
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
        <div className="pr-search-overlay" role="presentation" onClick={() => { searchRunRef.current += 1; setSearching(false); setSearchResult(null); }}>
          <aside className="pr-search-drawer" role="dialog" aria-label="Jira search results" onClick={(e) => e.stopPropagation()}>
            <div className="pr-search-drawer-header">
              <div className="pr-search-key">{searchResult.jira?.key ?? 'Searching Jira…'}</div>
              <div className="pr-search-header-actions">
                {searchResult.prs.length > 0 && <button className="pr-search-icon-button" onClick={() => searchResult.prs.forEach((pr) => { if (pr.url) window.api.openUrl(pr.url); })} aria-label="Open all pull requests" title="Open all pull requests">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8 8h8v8" /><path d="M16 8 7 17" /><path d="M5 5h-1a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
                  </svg>
                </button>}
                <button className="pr-search-close" onClick={() => { searchRunRef.current += 1; setSearching(false); setSearchResult(null); }} aria-label="Close search results">×</button>
              </div>
            </div>
            <div className="pr-search-drawer-body">
              {searchResult.jira ? <>
                <div className="pr-search-summary">{searchResult.jira.summary}</div>
                <div className="pr-search-tags">
                  <span className="jira-chip dim">{searchResult.jira.status || 'Unknown status'}</span>
                  <span className="pr-search-issue-type">{searchResult.jira.issueType || 'Task'}</span>
                </div>
                <div className="pr-search-meta">
                  <span>Worked by</span>
                  <strong>{searchResult.jira.assignee || 'unassigned'}</strong>
                  <span>Updated</span>
                  <strong title={searchResult.jira.updatedAt ? new Date(searchResult.jira.updatedAt).toLocaleString() : undefined}>{relativeDate(searchResult.jira.updatedAt)}</strong>
                </div>
              </> : null}
              <div className="search-results-heading">
                <span>Related pull requests</span>
                <span>{searchResult.prs.length} {searchResult.prs.length === 1 ? 'PR' : 'PRs'}</span>
              </div>
              {searchResult.jira && searchResult.phase !== 'ready' && (
                <div className="search-progress-message">
                  <span>Searching {searchResult.searchingRepo ? <strong>{searchResult.searchingRepo}</strong> : 'repositories'}<span className="loading-dots" aria-hidden="true" /></span>
                  {searchResult.totalRepos ? <span className="search-repo-progress">{searchResult.searchedRepos ?? 0}/{searchResult.totalRepos}</span> : null}
                </div>
              )}
              {searchResult.phase === 'ready' && searchResult.prs.length === 0 && <div className="pr-search-empty">No related pull request found for this ticket.</div>}
              {searchResult.prs.map((pr, index) => (
                <div
                  key={`${pr.repoName}-${pr.number}`}
                  className={`pr-search-card ${selectedSearchPRs.has(`${pr.repoName}-${pr.number}`) ? 'is-selected' : ''} ${index === selectedSearchPR ? 'is-focused' : ''}`}
                  tabIndex={0}
                  onClick={(e) => {
                    setSelectedSearchPR(index);
                    e.currentTarget.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key.toLowerCase() === 'o') {
                      e.preventDefault();
                      e.stopPropagation();
                      if (pr.url) window.api.openUrl(pr.url);
                    }
                  }}
                >
                  <div className="pr-search-card-main">
                    <input type="checkbox" checked={selectedSearchPRs.has(`${pr.repoName}-${pr.number}`)} onChange={(e) => { e.stopPropagation(); const key = `${pr.repoName}-${pr.number}`; setSelectedSearchPRs((previous) => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }} onClick={(e) => e.stopPropagation()} aria-label={`Select PR #${pr.number}`} style={{ marginTop: 2, accentColor: 'var(--accent-blue)' }} />
                    <div className="pr-search-card-title">{pr.title}</div>
                  </div>
                  <div className="pr-search-card-repo">
                    <span>#{pr.number} · {pr.repoName} ·</span>
                    <span className={`pr-state ${pr.state.toLowerCase()}`}>{pr.state}</span>
                  </div>
                  <div className="pr-search-card-meta">
                    <span>Raised by</span>
                    <strong>{pr.author || 'unknown'}</strong>
                    <span title={new Date(pr.createdAt).toLocaleString()}>Raised <strong>{relativeDate(pr.createdAt)}</strong></span>
                    {pr.mergedAt ? <>
                      <span className="jira-chip purple">Merged</span>
                      <span>by <strong>{pr.mergedBy || 'unknown'}</strong>, <strong title={new Date(pr.mergedAt).toLocaleString()}>{relativeDate(pr.mergedAt)}</strong></span>
                    </> : <span>Not merged</span>}
                  </div>
                </div>
              ))}
            </div>
            {searchResult.prs.length > 0 && searchResult.jira && <div className="pr-search-drawer-footer">
              <button className="pr-search-review-button" disabled={selectedSearchPRs.size === 0} onClick={() => { const selected = searchResult.prs.filter((pr) => selectedSearchPRs.has(`${pr.repoName}-${pr.number}`)); if (selected.length) onReviewSearchResult(selected, searchResult.jira!).catch((err) => setSearchError(err instanceof Error ? err.message : String(err))); }}>Review {selectedSearchPRs.size} selected PR{selectedSearchPRs.size === 1 ? '' : 's'}</button>
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
          {prs.map((pr, i) => (
            <div
              key={`${pr.repoName}-${pr.number}`}
              className={`table-row ${i === selected ? 'selected' : ''}`}
              onClick={() => { onSelect(i); onSelectPR(); }}
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
          {hasMore && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <button disabled={loading} onClick={onLoadMore} style={{ padding: '7px 16px', border: '1px solid var(--border-blue)', borderRadius: 6, background: 'var(--tint-blue)', color: 'var(--accent-blue)', cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Loading…' : 'Load more'}
            </button>
          </div>}
        </div>
      )}
    </div>
  );
}
