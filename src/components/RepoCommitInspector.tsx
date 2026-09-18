import React from 'react';
import type { RepoState } from '../../core/types.js';

export interface RepoCommitInspectorTab {
  id: string;
  repo: RepoState;
  selected: number;
}

interface RepoCommitInspectorProps {
  tabs: RepoCommitInspectorTab[];
  activeId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onSelect: (id: string, index: number) => void;
  onOpenDetail: (id: string, hash: string) => void;
  embedded?: boolean;
  branchFilter: 'all' | 'release' | 'base';
  authorFilters: string[];
  onBranchFilterChange: (value: 'all' | 'release' | 'base') => void;
  onAuthorFilterChange: (value: string[]) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}

export function CommitDateRangeFilter({ dateFrom, dateTo, onDateFromChange, onDateToChange }: { dateFrom: string; dateTo: string; onDateFromChange: (value: string) => void; onDateToChange: (value: string) => void }) {
  const label = dateFrom || dateTo ? `${dateFrom || '…'}${dateTo ? ` – ${dateTo}` : ''}` : '';
  const initial = dateFrom ? new Date(`${dateFrom}T00:00:00`) : new Date();
  const [month, setMonth] = React.useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [hoverDate, setHoverDate] = React.useState('');
  const selectingEnd = React.useRef(false);
  React.useEffect(() => { if (!dateFrom && !dateTo) document.querySelectorAll<HTMLDetailsElement>('.commit-date-range-filter[open]').forEach((element) => { element.open = false; }); }, [dateFrom, dateTo]);
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const toKey = (day: number) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const choose = (value: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (!selectingEnd.current) { onDateFromChange(value); onDateToChange(''); selectingEnd.current = true; return; }
    if (value < dateFrom) { onDateFromChange(value); onDateToChange(''); return; }
    onDateToChange(value);
    selectingEnd.current = false;
    const details = event.currentTarget.closest('details') as HTMLDetailsElement | null;
    if (details) details.open = false;
  };
  return <details className="commit-date-range-filter" onToggle={(event) => { if (event.currentTarget.open) selectingEnd.current = false; }}><summary title="Filter commits by date"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9h18"/></svg>{label && <em>{label}</em>}</summary><div className="commit-date-range-menu"><div className="calendar-header"><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><strong>{monthLabel}</strong><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div><div className="calendar-weekdays">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: firstDay }, (_, index) => <span className="calendar-empty" key={`empty-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => { const value = toKey(index + 1); const selected = value === dateFrom || value === dateTo; const inRange = dateFrom && ((dateTo && value > dateFrom && value < dateTo) || (!dateTo && hoverDate > dateFrom && value > dateFrom && value <= hoverDate)); return <button type="button" key={value} className={`${selected ? 'is-selected' : ''}${inRange ? ' is-in-range' : ''}`} onClick={(event) => choose(value, event)} onMouseEnter={() => setHoverDate(value)}>{index + 1}</button>; })}</div><div className="calendar-range-label">{dateFrom ? `From ${dateFrom}` : 'Select start date'}{dateTo ? ` · To ${dateTo}` : ''}</div><button type="button" className="calendar-clear" onClick={() => { onDateFromChange(''); onDateToChange(''); setHoverDate(''); selectingEnd.current = false; }}>Clear date filter</button></div></details>;
}

export function CommitFilterControls({ branchFilter, authorFilters, authors, baseBranch, releaseBranch, dateFrom, dateTo, onBranchFilterChange, onAuthorFilterChange, onDateFromChange, onDateToChange }: { branchFilter: 'all' | 'release' | 'base'; authorFilters: string[]; authors: string[]; baseBranch: string; releaseBranch: string; dateFrom: string; dateTo: string; onBranchFilterChange: (value: 'all' | 'release' | 'base') => void; onAuthorFilterChange: (value: string[]) => void; onDateFromChange: (value: string) => void; onDateToChange: (value: string) => void }) {
  const toggleAuthor = (author: string) => onAuthorFilterChange(authorFilters.includes(author) ? authorFilters.filter((item) => item !== author) : [...authorFilters, author]);
  const allAuthorsSelected = authorFilters.length === 0;
  return <div className="repo-pr-inspector-actions"><select className="repo-pr-filter" value={branchFilter} onChange={(event) => onBranchFilterChange(event.target.value as 'all' | 'release' | 'base')} aria-label="Filter commits by branch"><option value="all">All branches</option><option value="release">{releaseBranch}</option><option value="base">{baseBranch}</option></select><details className="commit-author-filter"><summary>{allAuthorsSelected ? 'All authors' : `${authorFilters.length} authors`}</summary><div className="commit-author-menu"><label><input type="checkbox" checked={allAuthorsSelected} onChange={() => onAuthorFilterChange([])} /> All authors</label>{authors.map((author) => <label key={author}><input type="checkbox" checked={authorFilters.includes(author)} onChange={() => toggleAuthor(author)} /> {author}</label>)}</div></details><CommitDateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={onDateFromChange} onDateToChange={onDateToChange} /></div>;
}

export function RepoCommitInspector({ tabs, activeId, onActivate, onClose, onSelect, onOpenDetail, embedded = false, branchFilter, authorFilters, onBranchFilterChange, onAuthorFilterChange, dateFrom, dateTo, onDateFromChange, onDateToChange }: RepoCommitInspectorProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [height, setHeight] = React.useState(320);
  const dragRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
  const active = tabs.find((tab) => tab.id === activeId);
  if (!active) return null;
  const releaseCommits = [
    ...(active.repo.latestCommits ?? []).map((commit) => ({ hash: commit.hash, message: commit.subject, author: commit.author, age: commit.age, date: commit.date, kind: 'release' })),
    ...(active.repo.diffCommits ?? []).map((commit) => ({ hash: commit.hash, message: commit.message, author: commit.author ?? '', age: commit.age ?? '', date: commit.date, kind: 'release' })),
  ];
  const baseCommits = (active.repo.baseCommits ?? []).map((commit) => ({ hash: commit.hash, message: commit.subject, author: commit.author, age: commit.age, date: commit.date, kind: 'base' }));
  const commits = [...releaseCommits, ...baseCommits].filter((commit, index, all) => all.findIndex((candidate) => candidate.hash === commit.hash) === index);
  const branchCommits = branchFilter === 'release' ? releaseCommits : branchFilter === 'base' ? baseCommits : commits;
  const authors = Array.from(new Set(branchCommits.map((commit) => commit.author).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const query = searchQuery.trim().toLowerCase();
  const selectedAuthors = new Set(authorFilters.map((author) => author.trim().toLowerCase()));
  const allAuthorsSelected = authorFilters.length === 0;
  const authorCommits = allAuthorsSelected ? branchCommits : branchCommits.filter((commit) => commit.author && selectedAuthors.has(commit.author.trim().toLowerCase()));
  const dateCommits = authorCommits.filter((commit) => { const date = commit.date?.slice(0, 10) ?? ''; return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo); });
  const visibleCommits = query ? dateCommits.filter((commit) => [commit.hash, commit.message, commit.author, commit.kind].some((value) => value.toLowerCase().includes(query))) : dateCommits;
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => { event.preventDefault(); dragRef.current = { startY: event.clientY, startHeight: height }; event.currentTarget.setPointerCapture(event.pointerId); };
  const resize = (event: React.PointerEvent<HTMLDivElement>) => { if (!dragRef.current) return; const maxHeight = Math.max(260, Math.floor(window.innerHeight * 0.8)); setHeight(Math.max(190, Math.min(maxHeight, dragRef.current.startHeight + dragRef.current.startY - event.clientY))); };
  const endResize = (event: React.PointerEvent<HTMLDivElement>) => { dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); };

  return <section className="repo-pr-inspector repo-commit-inspector" style={embedded ? undefined : { flexBasis: height }} aria-label="Repository commit inspector">
    <div className="repo-pr-inspector-resize-handle" onPointerDown={startResize} onPointerMove={resize} onPointerUp={endResize} title="Drag to resize inspector" role="separator" />
    <div className="repo-pr-inspector-tabbar">
      <div className="repo-pr-inspector-tabs">{tabs.map((tab) => <button key={tab.id} type="button" className={tab.id === activeId ? 'is-active' : ''} onClick={() => onActivate(tab.id)} title={tab.repo.path}><span>⌘ {tab.repo.name} · Commits</span><b onClick={(event) => { event.stopPropagation(); onClose(tab.id); }} title="Close commit inspector">×</b></button>)}</div>
      <div className="repo-pr-inspector-actions"><label className="repo-pr-search"><span aria-hidden="true">⌕</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search commits…" aria-label="Search commits" />{searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear commit search">×</button>}</label></div>
    </div>
    {visibleCommits.length === 0 ? <div className="repo-pr-inspector-empty"><span>⌁</span><div>{query ? 'No commits match your search.' : 'No commits found for this repository.'}</div></div> : <div className="repo-pr-table-wrap">
      <div className="table-header"><div className="cell" style={{ width: 76, flexShrink: 0 }}>HASH</div><div className="cell" style={{ flex: 1, minWidth: 0 }}>MESSAGE</div><div className="cell" style={{ width: 116, flexShrink: 0 }}>AUTHOR</div><div className="cell" style={{ width: 66, flexShrink: 0 }}>AGE</div></div>
      {visibleCommits.map((commit) => { const index = commits.indexOf(commit); return <div key={`${commit.kind}-${commit.hash}`} className={`table-row ${index === active.selected ? 'selected' : ''}`} onClick={() => { onSelect(active.id, index); onOpenDetail(active.id, commit.hash); }}><div className="cell" style={{ width: 76, flexShrink: 0, color: 'var(--accent-yellow)', font: '11px var(--font-mono)' }}>{commit.hash.slice(0, 7)}</div><div className="cell" style={{ flex: 1, minWidth: 0, color: index === active.selected ? 'var(--accent-yellow)' : 'var(--text-primary)', fontSize: 12 }}>{commit.message}</div><div className="cell" style={{ width: 116, flexShrink: 0, color: 'var(--text-secondary)', fontSize: 11 }}>{commit.author}</div><div className="cell" style={{ width: 66, flexShrink: 0, color: 'var(--text-dim)', font: '11px var(--font-mono)' }}>{commit.age}</div></div>; })}
    </div>}
  </section>;
}
