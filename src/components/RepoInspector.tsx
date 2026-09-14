import React from 'react';

export interface RepoInspectorTab { id: string; label: string; kind: 'prs' | 'commits'; }

interface RepoInspectorProps { tabs: RepoInspectorTab[]; activeId: string; onActivate: (id: string) => void; onClose: (id: string) => void; children: React.ReactNode; }

export function RepoInspector({ tabs, activeId, onActivate, onClose, children }: RepoInspectorProps) {
  const [height, setHeight] = React.useState(320);
  const dragRef = React.useRef<{ y: number; height: number } | null>(null);
  const start = (event: React.PointerEvent<HTMLDivElement>) => { event.preventDefault(); dragRef.current = { y: event.clientY, height }; event.currentTarget.setPointerCapture(event.pointerId); };
  const move = (event: React.PointerEvent<HTMLDivElement>) => { if (!dragRef.current) return; const max = Math.max(260, Math.floor(window.innerHeight * 0.8)); setHeight(Math.max(190, Math.min(max, dragRef.current.height + dragRef.current.y - event.clientY))); };
  const end = (event: React.PointerEvent<HTMLDivElement>) => { dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); };
  return <section className="repo-pr-inspector repo-inspector-unified" style={{ flexBasis: height }} aria-label="Repository inspector">
    <div className="repo-pr-inspector-resize-handle" onPointerDown={start} onPointerMove={move} onPointerUp={end} title="Drag to resize inspector" role="separator" />
    <div className="repo-pr-inspector-tabbar"><div className="repo-pr-inspector-tabs">{tabs.map((tab) => <button key={tab.id} type="button" className={tab.id === activeId ? 'is-active' : ''} onClick={() => onActivate(tab.id)}><span>{tab.kind === 'prs' ? '⌘' : '⑂'} {tab.label}</span><b onClick={(event) => { event.stopPropagation(); onClose(tab.id); }}>×</b></button>)}</div></div>
    <div className="repo-inspector-content">{children}</div>
  </section>;
}
