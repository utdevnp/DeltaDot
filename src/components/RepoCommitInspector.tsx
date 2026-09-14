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
}

export function RepoCommitInspector({ tabs, activeId, onActivate, onClose, onSelect, onOpenDetail, embedded = false }: RepoCommitInspectorProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [height, setHeight] = React.useState(320);
  const dragRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
  const active = tabs.find((tab) => tab.id === activeId);
  if (!active) return null;
  const commits = [
    ...(active.repo.latestCommits ?? []).map((commit) => ({ hash: commit.hash, message: commit.subject, author: commit.author, age: commit.age, kind: 'latest' })),
    ...(active.repo.diffCommits ?? []).map((commit) => ({ hash: commit.hash, message: commit.message, author: '', age: '', kind: 'diff' })),
  ];
  const query = searchQuery.trim().toLowerCase();
  const visibleCommits = query ? commits.filter((commit) => [commit.hash, commit.message, commit.author, commit.kind].some((value) => value.toLowerCase().includes(query))) : commits;
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => { event.preventDefault(); dragRef.current = { startY: event.clientY, startHeight: height }; event.currentTarget.setPointerCapture(event.pointerId); };
  const resize = (event: React.PointerEvent<HTMLDivElement>) => { if (!dragRef.current) return; const maxHeight = Math.max(260, Math.floor(window.innerHeight * 0.8)); setHeight(Math.max(190, Math.min(maxHeight, dragRef.current.startHeight + dragRef.current.startY - event.clientY))); };
  const endResize = (event: React.PointerEvent<HTMLDivElement>) => { dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); };

  return <section className={`repo-pr-inspector repo-commit-inspector${embedded ? ' repo-inspector-embedded' : ''}`} style={embedded ? undefined : { flexBasis: height }} aria-label="Repository commit inspector">
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
