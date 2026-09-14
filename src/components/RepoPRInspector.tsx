import React from 'react';
import type { PR, RepoState } from '../../core/types.js';
import { timeAgo } from '../../core/utils.js';

export interface RepoPRInspectorTab {
  id: string;
  repo: RepoState;
  prs: PR[];
  loading: boolean;
  error: string;
  filter: 'open' | 'closed' | 'all';
  selected: number;
  page: number;
  hasMore: boolean;
}

interface RepoPRInspectorProps {
  tabs: RepoPRInspectorTab[];
  activeId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onRefresh: (id: string) => void;
  onFilterChange: (id: string, filter: 'open' | 'closed' | 'all') => void;
  onSelect: (id: string, index: number) => void;
  onOpenPR: (id: string, index: number) => void;
  onLoadMore: (id: string) => void;
  onOpenConfig: () => void;
  embedded?: boolean;
}

function Filter({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" className={`repo-pr-filter${active ? ' is-active' : ''}`} onClick={onClick}>{label}</button>;
}

export function RepoPRInspector({ tabs, activeId, onActivate, onClose, onRefresh, onFilterChange, onSelect, onOpenPR, onLoadMore, onOpenConfig, embedded = false }: RepoPRInspectorProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [height, setHeight] = React.useState(320);
  const dragRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
  const active = tabs.find((tab) => tab.id === activeId);
  if (!active) return null;
  const filterLabel = active.filter === 'open' ? 'open' : active.filter === 'closed' ? 'closed' : 'all';
  const query = searchQuery.trim().toLowerCase();
  const visiblePRs = query
    ? active.prs.filter((pr) => [String(pr.number), pr.title, pr.author, pr.sourceBranch, pr.targetBranch, pr.state].some((value) => value.toLowerCase().includes(query)))
    : active.prs;

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragRef.current = { startY: event.clientY, startHeight: height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const maxHeight = Math.max(260, Math.floor(window.innerHeight * 0.8));
    setHeight(Math.max(190, Math.min(maxHeight, dragRef.current.startHeight + dragRef.current.startY - event.clientY)));
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <section className={`repo-pr-inspector${embedded ? ' repo-inspector-embedded' : ''}`} style={embedded ? undefined : { flexBasis: height }} aria-label="Repository pull request inspector">
      <div className="repo-pr-inspector-resize-handle" onPointerDown={startResize} onPointerMove={resize} onPointerUp={endResize} title="Drag to resize inspector" aria-label="Resize pull request inspector" role="separator" />
      <div className="repo-pr-inspector-tabbar">
        <div className="repo-pr-inspector-tabs">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" className={tab.id === activeId ? 'is-active' : ''} onClick={() => onActivate(tab.id)} title={tab.repo.path}>
              <span>⌘ {tab.repo.name} · PRs</span>
              <b onClick={(event) => { event.stopPropagation(); onClose(tab.id); }} title="Close PR inspector">×</b>
            </button>
          ))}
        </div>
        <div className="repo-pr-inspector-actions">
          <Filter label="Open" active={active.filter === 'open'} onClick={() => onFilterChange(active.id, 'open')} />
          <Filter label="Closed" active={active.filter === 'closed'} onClick={() => onFilterChange(active.id, 'closed')} />
          <Filter label="All" active={active.filter === 'all'} onClick={() => onFilterChange(active.id, 'all')} />
          <button type="button" className="repo-pr-refresh" onClick={() => onRefresh(active.id)} disabled={active.loading} title="Refresh pull requests">↻</button>
        </div>
        <label className="repo-pr-search"><span aria-hidden="true">⌕</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search PRs…" aria-label="Search pull requests" />{searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear PR search">×</button>}</label>
      </div>
      {active.loading && <div className="repo-pr-inspector-status">Loading pull requests…</div>}
      {active.error ? (
        <div className="repo-pr-inspector-empty"><div>{active.error}</div>{active.error.toLowerCase().includes('token') && <button type="button" onClick={onOpenConfig}>Open Settings</button>}</div>
      ) : visiblePRs.length === 0 && !active.loading ? (
        <div className="repo-pr-inspector-empty"><span>⌁</span><div>No {filterLabel} pull requests{query ? ' match your search' : ' for this repository'}.</div></div>
      ) : (
        <div className="repo-pr-table-wrap">
          <div className="table-header"><div className="cell" style={{ width: 54, flexShrink: 0 }}>#</div><div className="cell" style={{ flex: 1, minWidth: 0 }}>TITLE</div><div className="cell" style={{ width: 74, flexShrink: 0 }}>STATE</div><div className="cell" style={{ width: 70, flexShrink: 0 }}>AGE</div><div className="cell" style={{ width: 120, flexShrink: 0 }}>AUTHOR</div></div>
          {visiblePRs.map((pr, index) => <div key={pr.number} className={`table-row ${index === active.selected ? 'selected' : ''}`} onClick={() => { const originalIndex = active.prs.indexOf(pr); onSelect(active.id, originalIndex); onOpenPR(active.id, originalIndex); }}>
            <div className="cell pr-number" style={{ width: 54, flexShrink: 0 }}>#{pr.number}</div>
            <div className="cell pr-title" style={{ flex: 1, minWidth: 0, fontWeight: index === active.selected ? 600 : 400 }}>{pr.title}</div>
            <div className="cell" style={{ width: 74, flexShrink: 0 }}><span className={`pr-state ${pr.state.toLowerCase()}`}>{pr.state}</span></div>
            <div className="cell pr-age" style={{ width: 70, flexShrink: 0 }}>{timeAgo(pr.createdAt)}</div>
            <div className="cell" style={{ width: 120, flexShrink: 0, color: 'var(--text-secondary)', fontSize: 12 }}>{pr.author}</div>
          </div>)}
          {active.hasMore && <div className="repo-pr-load-more"><button type="button" onClick={() => onLoadMore(active.id)} disabled={active.loading}>{active.loading ? 'Loading…' : 'Load more'}</button></div>}
        </div>
      )}
    </section>
  );
}
