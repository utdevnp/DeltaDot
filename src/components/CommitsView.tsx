import React from 'react';
import type { CommitDetail, RepoState, CommitEntry, LatestCommit } from '../../core/types.js';
import { CommitDateRangeFilter, useCloseDetailsOnOutside } from './RepoCommitInspector.js';
import { DetailView } from './DetailView';

interface CommitsViewProps {
  repo: RepoState;
  selectedCommit: number;
  base: string;
  release: string;
  releaseStartDate?: string;
  onSelectCommit: (i: number) => void;
  onBack: () => void;
  onCommitDetail: (hash: string) => void;
}

type ExpandableCommit = { hash: string; message: string; author?: string; age?: string };

function CommitRow({ hash, message, author, age, isSelected, onClick }: {
  hash: string; message: string; author?: string; age?: string; isSelected: boolean; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        cursor: 'pointer',
        borderRadius: 4,
        margin: '0 8px',
        background: isSelected ? 'var(--selection-bg)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent-blue)' : '2px solid transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--accent-yellow)',
        flexShrink: 0,
        minWidth: 56,
      }}>
        {hash.slice(0, 7)}
      </span>
      <span style={{
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontSize: 13,
        color: isSelected ? 'var(--accent-yellow)' : 'var(--text-primary)',
        fontWeight: isSelected ? 500 : 400,
      }}>
        {message}
      </span>
      {author && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
          {author}
        </span>
      )}
      {age && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, minWidth: 32, textAlign: 'right' }}>
          {age}
        </span>
      )}
    </div>
  );
}

export function CommitsView({ repo, selectedCommit, base, release, releaseStartDate = '', onSelectCommit, onBack, onCommitDetail }: CommitsViewProps) {
  useCloseDetailsOnOutside();
  const diffCommits: (CommitEntry & { type: 'diff' })[] = (repo.diffCommits ?? []).map((c) => ({ ...c, type: 'diff' }));
  const latestCommits: (LatestCommit & { type: 'latest' })[] = (repo.latestCommits ?? []).map((c) => ({ ...c, type: 'latest' }));
  const [branchFilter, setBranchFilter] = React.useState<'all' | 'release' | 'base'>('all');
  const [authorFilters, setAuthorFilters] = React.useState<string[]>([]);
  const [dateFrom, setDateFrom] = React.useState(releaseStartDate);
  const [dateTo, setDateTo] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [displayMode, setDisplayMode] = React.useState<'list' | 'changes'>('list');
  const [expandedCommits, setExpandedCommits] = React.useState<Set<string>>(new Set());
  const [commitDetails, setCommitDetails] = React.useState<Record<string, CommitDetail | undefined>>({});
  const [loadingDetails, setLoadingDetails] = React.useState<Set<string>>(new Set());
  React.useEffect(() => { setAuthorFilters([]); }, [branchFilter]);
  const baseCommits: (LatestCommit & { type: 'base' })[] = (repo.baseCommits ?? []).map((c) => ({ ...c, type: 'base' }));
  const branchCommits = branchFilter === 'base' ? baseCommits : [...diffCommits, ...latestCommits];
  const authors = Array.from(new Set(branchCommits.map((commit) => commit.author).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const selectedAuthors = new Set(authorFilters.map((author) => author.trim().toLowerCase()));
  const allAuthorsSelected = authorFilters.length === 0;
  const matchesAuthor = (commit: { author?: string }) => allAuthorsSelected || !commit.author || !selectedAuthors.has(commit.author.trim().toLowerCase());
  const matchesDate = (commit: { date?: string }) => { const date = commit.date?.slice(0, 10) ?? ''; return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo); };
  const query = searchQuery.trim().toLowerCase();
  const matchesSearch = (commit: { hash: string; author?: string; message?: string; subject?: string }) => !query || [commit.hash, commit.author, commit.message, commit.subject].some((value) => value?.toLowerCase().includes(query));
  const visibleDiffCommits = branchFilter === 'base' ? [] : diffCommits.filter((commit) => matchesAuthor(commit) && matchesDate(commit) && matchesSearch(commit));
  const visibleLatestCommits = (branchFilter === 'base' ? baseCommits : latestCommits).filter((commit) => matchesAuthor(commit) && matchesDate(commit) && matchesSearch(commit));

  const hasDiff = diffCommits.length > 0;
  const hasLatest = latestCommits.length > 0;
  const toggleExpandedCommit = (hash: string) => {
    setExpandedCommits((previous) => {
      const next = new Set(previous);
      if (next.has(hash)) next.delete(hash); else next.add(hash);
      return next;
    });
    if (commitDetails[hash] || loadingDetails.has(hash)) return;
    setLoadingDetails((previous) => new Set(previous).add(hash));
    window.api.fetchCommitDetail(repo.path, hash)
      .then((commitDetail) => setCommitDetails((previous) => ({ ...previous, [hash]: commitDetail })))
      .finally(() => setLoadingDetails((previous) => { const next = new Set(previous); next.delete(hash); return next; }));
  };
  const renderChangesPanel = (title: string, commits: ExpandableCommit[], accent: string, emptyMessage: string) => (
    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRight: accent === 'var(--accent-red)' ? '1px solid var(--border)' : undefined }}>
      <div style={{ padding: '8px 12px', background: accent === 'var(--accent-red)' ? 'var(--tint-red)' : 'var(--tint-blue)', borderBottom: '1px solid var(--border)', color: accent, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}<span style={{ float: 'right', color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none' }}>{commits.length} commit{commits.length !== 1 ? 's' : ''}</span></div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {commits.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>{emptyMessage}</div> : commits.map((commit) => {
          const isExpanded = expandedCommits.has(commit.hash);
          return <section key={commit.hash} style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}><div className={`commit-change-row${isExpanded ? ' is-expanded' : ''}`} role="button" tabIndex={0} onClick={() => toggleExpandedCommit(commit.hash)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleExpandedCommit(commit.hash); } }} aria-expanded={isExpanded}><span style={{ color: 'var(--accent-blue)' }}>{isExpanded ? '▼' : '▶'}</span><span style={{ color: 'var(--accent-yellow)', font: '11px var(--font-mono)' }}>{commit.hash.slice(0, 7)}</span><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{commit.message}</span><span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{commit.author || ''} {commit.age || ''}</span><button type="button" className="commit-copy-button" onClick={(event) => { event.stopPropagation(); void navigator.clipboard.writeText(commit.hash); }} title="Copy full commit ID" aria-label={`Copy commit ID ${commit.hash}`}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button></div>{isExpanded && <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-primary)' }}>{loadingDetails.has(commit.hash) ? <div className="state-message">Loading commit changes…</div> : commitDetails[commit.hash] ? <DetailView detail={commitDetails[commit.hash]!} embedded onBack={() => undefined} /> : <div className="state-message">Unable to load commit changes.</div>}</div>}</section>;
        })}
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{repo.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {base} ← {release}
        </span>
        {hasDiff && (
          <span style={{
            padding: '2px 10px',
            borderRadius: 10,
            background: 'var(--tint-red)',
            color: 'var(--accent-red)',
            fontSize: 11,
            fontWeight: 600,
          }}>
            {visibleDiffCommits.length} commit{visibleDiffCommits.length !== 1 ? 's' : ''} behind
          </span>
        )}
        <div style={{ flex: 1 }} />
        <label className="repo-pr-search commit-list-search"><span aria-hidden="true">⌕</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search commits…" aria-label="Search commits by hash, author, or title" />{searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear commit search">×</button>}</label>
        <button type="button" className="commit-reset-filter" onClick={() => setDisplayMode((mode) => mode === 'list' ? 'changes' : 'list')}>{displayMode === 'list' ? 'Show changes' : 'Show commit list'}</button>
        <div className="commit-view-filters">
          <select className="repo-pr-filter" value={branchFilter} onChange={(event) => { setBranchFilter(event.target.value as typeof branchFilter); setAuthorFilters([]); }} aria-label="Filter commits by branch">
            <option value="all">All branches</option><option value="release">{release}</option><option value="base">{base}</option>
          </select>
          <details className="commit-author-filter"><summary>{allAuthorsSelected ? 'All authors' : `Exclude ${authorFilters.length} author${authorFilters.length === 1 ? '' : 's'}`}</summary><div className="commit-author-menu"><label><input type="checkbox" checked={allAuthorsSelected} onChange={() => setAuthorFilters([])} /> All authors</label>{authors.map((author) => <label key={author}><input type="checkbox" checked={authorFilters.includes(author)} onChange={() => setAuthorFilters(authorFilters.includes(author) ? authorFilters.filter((item) => item !== author) : [...authorFilters, author])} /> {author}</label>)}</div></details>
          <CommitDateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
          <button type="button" className="commit-reset-filter" onClick={() => { setBranchFilter('all'); setAuthorFilters([]); setDateFrom(releaseStartDate); setDateTo(''); setSearchQuery(''); }}>Reset</button>
        </div>
        <button className="back-btn" onClick={onBack}>←</button>
      </div>

      {/* Content */}
      {displayMode === 'changes' ? <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 0 }}>
        {renderChangesPanel('DIFF — commits on release not in base', visibleDiffCommits.map((commit) => ({ hash: commit.hash, message: commit.message, author: commit.author, age: commit.age })), 'var(--accent-red)', repo.missingRelease ? 'Release branch not found for this repository' : 'No differences — branches are in sync')}
        {renderChangesPanel(`LATEST — origin/${release}`, visibleLatestCommits.map((commit) => ({ hash: commit.hash, message: commit.subject, author: commit.author, age: commit.age })), 'var(--accent-blue)', `No commits found on origin/${release}`)}
      </div> : <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 0 }}>
        {/* DIFF panel */}
        <div style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border)',
        }}>
          <div style={{
            padding: '8px 12px',
            background: 'var(--tint-red)',
            borderBottom: '1px solid var(--border)',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--accent-red)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 18 17 12 23 6"/><path d="M1 6h12a4 4 0 0 1 4 4v8"/>
            </svg>
            DIFF — commits on release not in base
            <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none' }}>
              {visibleDiffCommits.length} commit{visibleDiffCommits.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!visibleDiffCommits.length ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                {repo.missingRelease
                  ? 'Release branch not found for this repository'
                  : 'No differences — branches are in sync'}
              </div>
            ) : (
              visibleDiffCommits.map((c, i) => (
                <CommitRow
                  key={c.hash}
                  hash={c.hash}
                  message={c.message}
                  author={c.author}
                  age={c.age}
                  isSelected={selectedCommit === i}
                  onClick={() => { onSelectCommit(i); onCommitDetail(c.hash); }}
                />
              ))
            )}
          </div>
        </div>

        {/* LATEST panel */}
        <div style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            padding: '8px 12px',
            background: 'var(--tint-blue)',
            borderBottom: '1px solid var(--border)',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--accent-blue)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 6 17 12 23 18"/><path d="M17 14H9a4 4 0 0 1-4-4V2"/>
            </svg>
            LATEST — origin/{release}
            <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none' }}>
              last {visibleLatestCommits.length}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!visibleLatestCommits.length ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                No commits found on origin/{release}
              </div>
            ) : (
              visibleLatestCommits.map((c, i) => {
                const idx = visibleDiffCommits.length + i;
                return (
                  <CommitRow
                    key={c.hash}
                    hash={c.hash}
                    message={c.subject}
                    author={c.author}
                    age={c.age}
                    isSelected={selectedCommit === idx}
                    onClick={() => { onSelectCommit(idx); onCommitDetail(c.hash); }}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>}
    </div>
  );
}
