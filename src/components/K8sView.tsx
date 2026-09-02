import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  KubeContext, KubeContextTab, KubeWorkloadTab, KubeCompareTab, KubeContainer,
  KubeResourceColumn, KubeResourceItem,
} from '../../core/types.js';
import { KUBE_RESOURCE_OPTIONS } from '../../core/types.js';
import { timeAgo } from '../../core/utils.js';
import { SPINNER } from '../../core/utils.js';
import { compareContextImages, extractImageVersion, type KubeImageCompareRow } from '../../core/k8s-compare.js';

interface K8sViewProps {
  contexts: KubeContext[];
  contextTabs: KubeContextTab[];
  activeTab: string; // '' | 'compare' | context/workload tab id
  workloadTabs: KubeWorkloadTab[];
  compareTab: KubeCompareTab | null;
  error: string; // global init error (no contexts found)
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onOpenContextTab: (ctx: string) => void;
  onTabNamespaceChange: (tabId: string, ns: string) => void;
  onTabKindChange: (tabId: string, kind: string) => void;
  onTabPodFilterToggle: (tabId: string, category: string) => void;
  onTabWatchToggle: (tabId: string, enabled: boolean) => void;
  onTabWatchInterval: (tabId: string, seconds: number) => void;
  onRefreshTab: (tabId: string) => void;
  onSilentRefreshTab: (tabId: string) => void;
  onSelect: (i: number) => void;
  onOpenWorkload: (i: number) => void;
  onOpenPod: (i: number) => void;
  onSelectContextContainer: (i: number) => void;
  onOpenContextContainerLogs: (i: number) => void;
  onClosePodDrilldown: () => void;
  onToggleLogWatch: (enabled: boolean) => void;
  onLogWatchInterval: (seconds: number) => void;
  onRefreshLogs: () => void;
  onToggleLogWrap: (enabled: boolean) => void;
  onSelectWorkloadPod: (workloadId: string, i: number) => void;
  onOpenPodLogs: (workloadId: string, i?: number) => void;
  onSelectWorkloadContainer: (workloadId: string, i: number) => void;
  onOpenContainerLogs: (workloadId: string, i?: number) => void;
  onCompareContext: (sourceCtx: string, otherCtx: string) => void;
  onAddCompareContext: (ctx: string) => void;
  onRemoveCompareSide: (index: number) => void;
  onActivateTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onRenameTab: (id: string, label: string) => void;
  onBack: () => void;
}

const SELECT_STYLE: React.CSSProperties = {
  padding: '2px 6px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  color: 'var(--text-primary)',
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
  outline: 'none',
  maxWidth: 220,
};

// ─── Tab bar ────────────────────────────────────────────────────────────────

function Tab({ label, active, onClose, onClick, onContextMenu, onRename }: {
  label: string; active: boolean; onClose?: () => void; onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void; onRename?: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== label && onRename) onRename(next);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.stopPropagation(); commit(); }
          else if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); }
        }}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        style={{
          padding: '3px 8px', fontSize: 12, fontFamily: 'inherit', width: 220,
          background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
          border: '1px solid var(--accent-blue)', borderRadius: 6,
          outline: 'none',
        }}
        title="Rename tab — Enter to save, Esc to cancel"
      />
    );
  }

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onRename ? () => { setDraft(label); setEditing(true); } : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 8px 4px 12px', fontSize: 12, cursor: 'pointer',
        borderTopLeftRadius: 6, borderTopRightRadius: 6,
        border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
        borderBottom: active ? '1px solid var(--bg-primary)' : '1px solid var(--border)',
        background: active ? 'var(--bg-secondary)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-dim)',
        fontWeight: active ? 600 : 400,
        whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden',
        userSelect: 'none',
      }}
      title={onRename ? `${label} — double-click to rename` : label}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {onClose && (
        <span
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          onDoubleClick={(e) => e.stopPropagation()}
          style={{ color: 'var(--text-dim)', padding: '0 2px', borderRadius: 3, lineHeight: 1 }}
          title="Close tab"
        >
          ✕
        </span>
      )}
    </div>
  );
}

function TabBar({ activeTab, contextTabs, workloadTabs, compareTab, onActivate, onClose, onRenameTab, onContextMenu, fallbackCtx }: {
  activeTab: string; contextTabs: KubeContextTab[]; workloadTabs: KubeWorkloadTab[]; compareTab: KubeCompareTab | null;
  onActivate: (id: string) => void; onClose: (id: string) => void; onRenameTab: (id: string, label: string) => void;
  onContextMenu: (e: React.MouseEvent, ctx: string) => void; fallbackCtx: string;
}) {
  return (
    <div style={{
      display: 'flex', gap: 3, padding: '6px 12px 0', flexShrink: 0,
      borderBottom: '1px solid var(--border)', overflowX: 'auto',
    }}>
      {contextTabs.map((t) => (
        <Tab
          key={t.id}
          label={t.label ?? t.context}
          active={activeTab === t.id}
          onClose={() => onClose(t.id)}
          onClick={() => onActivate(t.id)}
          onRename={(l) => onRenameTab(t.id, l)}
          onContextMenu={(e) => onContextMenu(e, t.context)}
        />
      ))}
      {workloadTabs.map((t) => (
        <Tab
          key={t.id}
          label={t.label ?? `${t.namespace}/${t.name}`}
          active={activeTab === t.id}
          onClose={() => onClose(t.id)}
          onClick={() => onActivate(t.id)}
          onRename={(l) => onRenameTab(t.id, l)}
          onContextMenu={(e) => onContextMenu(e, fallbackCtx)}
        />
      ))}
      {compareTab && (
        <Tab
          label={compareTab.label ?? compareTab.sides.map((s) => s.label ?? s.context).join(' vs ')}
          active={activeTab === 'compare'}
          onClose={() => onClose('compare')}
          onClick={() => onActivate('compare')}
          onRename={(l) => onRenameTab('compare', l)}
          onContextMenu={(e) => onContextMenu(e, fallbackCtx)}
        />
      )}
    </div>
  );
}

// ─── Compare tab — context image-version table ──────────────────────────────

function CompareView({ compareTab, contexts, onAddCompareContext, onRemoveCompareSide, onClose }: {
  compareTab: KubeCompareTab; contexts: KubeContext[];
  onAddCompareContext: (ctx: string) => void; onRemoveCompareSide: (index: number) => void;
  onClose: () => void;
}) {
  const { sides, namespace } = compareTab;

  const rows = useMemo<KubeImageCompareRow[]>(() => {
    if (sides.length === 0 || sides.some((s) => !s.loaded)) return [];
    return compareContextImages(sides);
  }, [sides]);

  const added = new Set(sides.map((s) => s.context));
  const addable = contexts.filter((c) => !added.has(c.name));

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Compare</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>namespace: {namespace}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          <span style={{ color: 'var(--accent-yellow)' }}>■</span> differs from first context
        </span>
        <button className="back-btn" onClick={onClose} title="Close compare tab">✕</button>
      </div>

      {compareTab.loading ? (
        <div className="state-message">Loading deployments from contexts...</div>
      ) : compareTab.error ? (
        <div className="state-message error">{compareTab.error}</div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
          <div style={{ marginTop: 14 }}>
            <div className="table-container">
              <div className="table-header">
                <div className="cell" style={{ width: 36, flexShrink: 0 }}>#</div>
                <div className="cell" style={{ flex: 1.5, minWidth: 0 }}>Deployment Name</div>
                {sides.map((s, i) => (
                  <div className="cell" key={`h-${i}`} style={{ width: 170, flexShrink: 0, position: 'relative', paddingRight: i >= 2 ? 22 : 8 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.context}>
                      {s.label ?? s.context}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-dim)' }}>{s.deployments.length} deployments</div>
                    {i >= 2 && (
                      <span
                        onClick={(e) => { e.stopPropagation(); onRemoveCompareSide(i); }}
                        style={{ position: 'absolute', right: 4, top: 4, color: 'var(--text-dim)', cursor: 'pointer', fontSize: 10 }}
                        title={`Remove ${s.label ?? s.context}`}
                      >✕</span>
                    )}
                  </div>
                ))}
                <div className="cell" style={{ width: 170, flexShrink: 0 }}>
                  <select
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) { onAddCompareContext(v); e.target.value = ''; }
                    }}
                    style={{ ...SELECT_STYLE, width: '100%' }}
                    title="Add another context to compare"
                  >
                    <option value="">+ Add context</option>
                    {addable.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              {rows.map((r, ri) => {
                const baseline = r.versions.find((v) => v !== null) ?? null;
                return (
                  <div key={r.container} className="table-row" style={{ cursor: 'default' }}>
                    <div className="cell" style={{ width: 36, flexShrink: 0, color: 'var(--text-dim)' }}>{ri + 1}</div>
                    <div className="cell" style={{ flex: 1.5, minWidth: 0, fontWeight: 600 }}>{r.container}</div>
                    {r.versions.map((v, i) => {
                      const missing = v === null;
                      const drift = !missing && baseline !== null && v !== baseline;
                      const age = r.lastUpdated[i];
                      return (
                        <div className="cell" key={`c-${i}`} style={{ width: 170, flexShrink: 0 }}>
                          {missing ? (
                            <span style={{ color: 'var(--text-dim)' }}>—</span>
                          ) : (
                            <span
                              title={`${r.images[i] ?? v}${age ? `\nlast updated: ${new Date(age).toLocaleString()}` : ''}`}
                              style={{
                                display: 'inline-block', padding: '1px 6px', borderRadius: 4,
                                background: drift ? 'var(--tint-yellow)' : 'transparent',
                                border: drift ? '1px solid var(--border-yellow)' : '1px solid transparent',
                                color: drift ? 'var(--accent-yellow)' : 'var(--text-primary)',
                                fontWeight: drift ? 600 : 400,
                                fontFamily: 'SF Mono, Menlo, Consolas, monospace', fontSize: 12,
                              }}
                            >
                              {v}
                              {age && (
                                <span style={{ color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>
                                  - {timeAgo(age)}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <div className="cell" style={{ width: 170, flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Context tab — resource table with namespace + kind selectors ───────────

const POD_ERROR_STATUSES = new Set([
  'CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'CreateContainerError',
  'RunContainerError', 'InvalidImageName', 'OOMKilled', 'Evicted', 'Error', 'Failed', 'Unknown',
  'ContainerStatusUnknown', 'DeadlineExceeded',
]);

function podStatusColor(status: string): string {
  // Support both the current raw Kubernetes status and older cached labels.
  const rawStatus = status.replace(/^Init:/, '');
  if (rawStatus === 'Terminating') return 'var(--accent-blue)';
  if (POD_ERROR_STATUSES.has(rawStatus) || status.startsWith('Error')) return 'var(--accent-red)';
  if (status === 'Running' || status === 'Succeeded' || status.startsWith('Healthy')) return 'var(--text-primary)';
  if (status.startsWith('Unhealthy') || status.length > 0) return 'var(--accent-orange)';
  return 'var(--text-primary)';
}

function podStatusText(status: string): string {
  return status.replace(/^(Healthy|Unhealthy|Error)\s*[·:-]\s*/i, '');
}

function ResourceCell({ column, value, warning }: { column: KubeResourceColumn; value: string; warning?: boolean }) {
  if (column.format === 'usage') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }} title={warning ? 'High resource usage: at least 80% of the configured limit' : 'Current usage / configured limit'}>
        {warning && (
          <svg aria-label="High usage" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m10.3 3.3-8 14A2 2 0 0 0 4 20.3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        )}
        <span>{value || '—'}</span>
      </span>
    );
  }
  if (column.format === 'age') {
    return value ? <span title={value}>{timeAgo(value)}</span> : <span>—</span>;
  }
  if (column.format === 'ready') {
    const [ready, total] = value.split('/').map(Number);
    const ok = total > 0 && ready === total;
    return <span style={{ color: ok ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>{value || '—'}</span>;
  }
  if (column.format === 'image') {
    const fullImagePath = value.split(',')[0]?.trim() ?? '';
    const mainImage = fullImagePath;
    const version = mainImage ? extractImageVersion(mainImage) : '';
    return (
      <span style={{
        color: 'var(--text-primary)', fontSize: 12, wordBreak: 'break-all',
        fontFamily: 'SF Mono, Menlo, Consolas, monospace',
      }} title={fullImagePath || 'Image path unavailable'} aria-label={fullImagePath || 'Image path unavailable'}>
        {version || '—'}
      </span>
    );
  }
  if (column.format === 'pod-status') {
    const displayStatus = podStatusText(value);
    const statusColor = podStatusColor(value);
    return (
      <span style={{
        display: 'inline-block', color: statusColor, fontWeight: 600,
        whiteSpace: 'nowrap', overflow: 'visible', textOverflow: 'clip',
      }} title={displayStatus}>
        {displayStatus || 'Unknown'}
      </span>
    );
  }
  return <span>{value || '—'}</span>;
}

function podRowStyle(status: string, owner: string, selected: boolean): React.CSSProperties {
  return {
    color: podStatusColor(status),
    // Job-owned pods get a subtle tint; ReplicaSet-owned pods remain unchanged.
    ...(owner === 'Job' && !selected ? { background: 'var(--tint-purple)' } : {}),
  };
}

function colStyle(c: KubeResourceColumn): React.CSSProperties {
  const base: React.CSSProperties = { boxSizing: 'border-box' };
  if (c.key === 'name') {
    return { ...base, flex: 1, minWidth: 140 };
  }
  const widths: Record<string, number> = {
    image: 130,
    status: 150,
    namespace: 110,
    ready: 58,
    restarts: 72,
    ip: 105,
    cpu: 105,
    memory: 115,
    owner: 90,
    age: 72,
  };
  return { ...base, width: widths[c.key] ?? 100, flexShrink: 0 };
}

function ContextTabView({ tab, searchQuery, onSearchQueryChange, onNamespaceChange, onKindChange, onPodFilterToggle, onWatchToggle, onWatchInterval, onRefresh, onSilentRefresh, onSelect, onOpenWorkload, onOpenPod, onSelectContainer, onOpenContainerLogs, onClosePodDrilldown }: {
  tab: KubeContextTab;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onNamespaceChange: (tabId: string, ns: string) => void;
  onKindChange: (tabId: string, kind: string) => void;
  onPodFilterToggle: (tabId: string, category: string) => void;
  onWatchToggle: (tabId: string, enabled: boolean) => void;
  onWatchInterval: (tabId: string, seconds: number) => void;
  onRefresh: (tabId: string) => void;
  onSilentRefresh: (tabId: string) => void;
  onSelect: (i: number) => void;
  onOpenWorkload: (i: number) => void;
  onOpenPod: (i: number) => void;
  onSelectContainer: (i: number) => void;
  onOpenContainerLogs: (i: number) => void;
  onClosePodDrilldown: () => void;
}) {
  const [loadingFrame, setLoadingFrame] = useState(0);
  const kindLabel = KUBE_RESOURCE_OPTIONS.find((o) => o.id === tab.kind)?.label ?? tab.kind;
  const isNamespaced = tab.kind !== 'nodes';
  const canOpenWorkload = tab.kind === 'deployments';
  const canOpenPod = tab.kind === 'pods';
  const showPodFilter = tab.kind === 'pods';
  const filters = tab.podFilters ?? ['ReplicaSet'];
  // Owner-kind filter chips are built from the kinds actually present (Job,
  // ReplicaSet, DaemonSet, StatefulSet, 'None', …) — no name-based logic.
  const ownerKinds = [...new Set(tab.resources.items.map((i) => i.cells.owner ?? 'None'))].sort();
  const query = searchQuery.trim().toLowerCase();
  const items = tab.resources.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !showPodFilter || filters.includes(item.cells.owner ?? 'None'))
    .filter(({ item }) => !query || [item.name, ...Object.values(item.cells)].some((value) => value.toLowerCase().includes(query)));
  const itemLabel = `${items.length} ${kindLabel.toLowerCase()}`;

  // Watch mode: poll the current resource table every watchInterval seconds —
  // silently (no loading state, no page flicker).
  const intervalMs = Math.max(1, tab.watchInterval ?? 1) * 1000;
  React.useEffect(() => {
    if (!tab.watch) return;
    const id = setInterval(() => onSilentRefresh(tab.id), intervalMs);
    return () => clearInterval(id);
  }, [tab.watch, intervalMs, tab.id, onSilentRefresh]);

  useEffect(() => {
    const id = setInterval(() => setLoadingFrame((frame) => frame + 1), 120);
    return () => clearInterval(id);
  }, []);

  if (tab.podDrilldown) {
    return (
      <PodContainersView
        name={tab.podDrilldown.podName}
        namespace={tab.podDrilldown.namespace}
        containers={tab.podDrilldown.containers}
        containerStatuses={tab.podDrilldown.containerStatuses}
        selectedContainer={tab.podDrilldown.selectedContainer}
        onClose={onClosePodDrilldown}
        onSelect={onSelectContainer}
        onOpenLogs={onOpenContainerLogs}
      />
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        {isNamespaced && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>namespace</span>
          <select
            value={tab.namespace}
            onChange={(e) => onNamespaceChange(tab.id, e.target.value)}
            style={SELECT_STYLE}
            title="Namespace"
          >
            <option value="*">All namespaces</option>
            {tab.namespaces.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </>}
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>resource</span>
        <select
          value={tab.kind}
          onChange={(e) => onKindChange(tab.id, e.target.value)}
          style={SELECT_STYLE}
          title="Resource kind"
        >
          {KUBE_RESOURCE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search..."
          aria-label="Search Kubernetes resources"
          style={{
            width: 170, padding: '3px 8px', background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)',
            fontFamily: 'inherit', fontSize: 11, outline: 'none',
          }}
        />
        {showPodFilter && (
          <>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>filter</span>
            {ownerKinds.map((kind) => {
              const active = filters.includes(kind);
              return (
                <button
                  key={kind}
                  onClick={() => onPodFilterToggle(tab.id, kind)}
                  style={{
                    padding: '2px 10px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
                    background: active ? 'var(--tint-blue)' : 'transparent',
                    border: `1px solid ${active ? 'var(--border-blue)' : 'var(--border)'}`,
                    color: active ? 'var(--accent-blue)' : 'var(--text-dim)',
                    fontWeight: active ? 600 : 400,
                  }}
                  title={`Show/hide ${kind}-owned pods`}
                >
                  {kind}
                </button>
              );
            })}
          </>
        )}
        <button
          onClick={() => onWatchToggle(tab.id, !tab.watch)}
          style={{
            padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
            background: tab.watch ? 'var(--tint-green)' : 'var(--bg-tertiary)',
            border: `1px solid ${tab.watch ? 'var(--border-green)' : 'var(--border)'}`,
            color: tab.watch ? 'var(--accent-green)' : 'var(--text-secondary)',
            fontWeight: tab.watch ? 600 : 400,
          }}
          title={tab.watch ? 'Stop watching — click to pause live refresh' : 'Watch mode: live-refresh this table'}
        >
          {tab.watch ? '● watching' : '▶ watch'}
        </button>
        {tab.watch && (
          <>
            <input
              type="number"
              min={1}
              step={1}
              value={tab.watchInterval ?? 1}
              onChange={(e) => onWatchInterval(tab.id, parseInt(e.target.value, 10) || 1)}
              style={{
                width: 52, padding: '2px 6px', fontFamily: 'inherit', fontSize: 11, textAlign: 'center',
                background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 4, outline: 'none',
              }}
              title="Watch interval in seconds (default 1)"
            />
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>sec</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--accent-green)' }} title="Watch mode active — press w to toggle">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)', animation: 'kube-pulse 1.2s ease-in-out infinite' }} />
              watch mode active
            </span>
          </>
        )}
        <button onClick={() => onRefresh(tab.id)} style={{ ...SELECT_STYLE, cursor: 'pointer' }} title="Refresh">↻</button>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{itemLabel}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>right-click tab to compare</span>
      </div>

      {tab.loading ? (
        <div className="state-message">Loading {kindLabel.toLowerCase()}...</div>
      ) : tab.error ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div style={{ color: 'var(--accent-red)', fontSize: 14, textAlign: 'center', lineHeight: 1.6, maxWidth: 480 }}>{tab.error}</div>
          <button onClick={() => onRefresh(tab.id)} style={{
            padding: '10px 24px', borderRadius: 8, background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Retry</button>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="14" rx="2" ry="2"/>
            <line x1="2" y1="9" x2="22" y2="9"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
          </svg>
          <div className="text" style={{ marginTop: 8 }}>No {kindLabel.toLowerCase()} in {isNamespaced ? (tab.namespace === '*' ? 'any namespace' : `namespace '${tab.namespace}'`) : 'this cluster'}</div>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-header">
            <div className="cell" style={{ width: 36, flexShrink: 0 }}>#</div>
            {tab.resources.columns.map((c) => (
              <div className="cell" key={c.key} style={colStyle(c)}>{c.label}</div>
            ))}
          </div>
          {items.map(({ item, index }, i) => {
            const selected = index === tab.selected;
            return (
              <div
                key={item.key}
                className={`table-row ${selected ? 'selected' : ''}`}
                style={tab.kind === 'pods' ? podRowStyle(item.cells.status ?? '', item.cells.owner ?? '', selected) : undefined}
                onClick={() => onSelect(index)}
                onDoubleClick={() => { if (canOpenWorkload) onOpenWorkload(index); else if (canOpenPod) onOpenPod(index); }}
                title={canOpenWorkload ? 'Open workload in a new tab' : undefined}
              >
                <div className="cell" style={{ width: 36, flexShrink: 0, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {i + 1}
                  {item.loading && (
                    <span
                      title="Refreshing"
                      style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', width: 14, textAlign: 'center' }}
                    >
                      {SPINNER[(loadingFrame + i * 2) % SPINNER.length]}
                    </span>
                  )}
                </div>
                {tab.resources.columns.map((c) => (
                  <div className="cell" key={c.key} style={{ ...colStyle(c), fontWeight: c.key === 'name' && selected ? 600 : 400 }}>
                    <ResourceCell column={c} value={item.cells[c.key] ?? ''} warning={c.key === 'cpu' ? item.cells.highCpu === 'true' : c.key === 'memory' ? item.cells.highMemory === 'true' : false} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Workload detail tab ────────────────────────────────────────────────────

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <div style={{ width: 170, flexShrink: 0, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0, color: 'var(--text-primary)', wordBreak: 'break-all', whiteSpace: 'pre-wrap', fontFamily: mono ? 'SF Mono, Menlo, Consolas, monospace' : 'inherit' }}>{value || '—'}</div>
    </div>
  );
}

function PodLogsView({ tab, onClose, onToggleWatch, onWatchInterval, onRefresh, onToggleWrap }: {
  tab: KubeWorkloadTab;
  onClose: () => void;
  onToggleWatch: (enabled: boolean) => void;
  onWatchInterval: (seconds: number) => void;
  onRefresh: () => void;
  onToggleWrap: (enabled: boolean) => void;
}) {
  const intervalMs = Math.max(1, tab.watchInterval ?? 1) * 1000;
  const logRef = React.useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!tab.watch) return;
    const id = setInterval(onRefresh, intervalMs);
    return () => clearInterval(id);
  }, [tab.watch, intervalMs, onRefresh]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [tab.logs]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{tab.namespace}/{tab.name} logs</span>
        <button
          onClick={() => onToggleWatch(!tab.watch)}
          style={{
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
            background: tab.watch ? 'var(--tint-green)' : 'var(--bg-tertiary)',
            border: `1px solid ${tab.watch ? 'var(--border-green)' : 'var(--border)'}`,
            color: tab.watch ? 'var(--accent-green)' : 'var(--text-secondary)',
            fontWeight: tab.watch ? 600 : 400,
          }}
          title="Toggle log watch mode (w)"
        >
          {tab.watch ? '● watching' : '▶ watch'}
        </button>
        <button
          onClick={() => onToggleWrap(!tab.wrap)}
          style={{
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
            background: tab.wrap ? 'var(--tint-blue)' : 'var(--bg-tertiary)',
            border: `1px solid ${tab.wrap ? 'var(--border-blue)' : 'var(--border)'}`,
            color: tab.wrap ? 'var(--accent-blue)' : 'var(--text-secondary)',
            fontWeight: tab.wrap ? 600 : 400,
          }}
          title="Toggle log wrapping (z)"
        >
          {tab.wrap ? '↩ wrap' : '↔ no wrap'}
        </button>
        {tab.watch && (
          <>
            <input
              type="number"
              min={1}
              step={1}
              value={tab.watchInterval ?? 1}
              onChange={(e) => onWatchInterval(parseInt(e.target.value, 10) || 1)}
              style={{ width: 52, padding: '3px 6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 11, textAlign: 'center' }}
              title="Log refresh interval in seconds"
            />
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>sec</span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <button className="back-btn" onClick={onClose} title="Close tab">✕</button>
      </div>
      {tab.loading ? <div className="state-message">Loading pod logs...</div> : tab.error ? <div className="state-message error">{tab.error}</div> : (
        <pre ref={logRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', margin: 0, padding: 16, color: 'var(--text-primary)', background: 'var(--bg-primary)', font: '12px/1.55 var(--font-mono)', whiteSpace: tab.wrap ? 'pre-wrap' : 'pre', wordBreak: tab.wrap ? 'break-word' : 'normal', userSelect: 'text' }}>
          {tab.logs || 'No logs available.'}
        </pre>
      )}
    </div>
  );
}

function PodContainersView({ name, namespace, containers, containerStatuses, selectedContainer, onClose, onSelect, onOpenLogs }: {
  name: string; namespace: string; containers: string[]; containerStatuses?: Record<string, string>; selectedContainer: number;
  onClose: () => void; onSelect: (i: number) => void; onOpenLogs: (i: number) => void;
}) {
  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{namespace}/{name} containers</span>
        <div style={{ flex: 1 }} />
        <button className="back-btn" onClick={onClose} title="Close tab">✕</button>
      </div>
      {containers.length === 0 ? <div className="empty-state"><div className="text">No containers found.</div></div> : (
        <div className="table-container">
          <div className="table-header">
            <div className="cell" style={{ width: 36, flexShrink: 0 }}>#</div>
            <div className="cell" style={{ flex: 1 }}>CONTAINER</div>
            <div className="cell" style={{ width: 120, flexShrink: 0 }}>STATUS</div>
            <div className="cell" style={{ width: 120, flexShrink: 0 }}>ACTION</div>
          </div>
          {containers.map((container, i) => {
            const selected = i === selectedContainer;
            const status = containerStatuses?.[container] ?? '';
            return (
              <div key={container} className={`table-row ${selected ? 'selected' : ''}`} style={podRowStyle(status, '', selected)} onClick={() => { onSelect(i); onOpenLogs(i); }} onDoubleClick={() => onOpenLogs(i)} title="Open container logs">
                <div className="cell" style={{ width: 36, flexShrink: 0, color: 'var(--text-dim)' }}>{i + 1}</div>
                <div className="cell" style={{ flex: 1, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{container}</div>
                <div className="cell" style={{ width: 120, flexShrink: 0, color: podStatusColor(status), fontWeight: 600 }}>{status}</div>
                <div className="cell" style={{ width: 120, flexShrink: 0, color: 'var(--accent-blue)' }}>Enter for logs</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeploymentPods({ tab, onSelect, onOpen }: {
  tab: KubeWorkloadTab;
  onSelect: (i: number) => void;
  onOpen: (i: number) => void;
}) {
  const pods = tab.pods;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        Replicas {pods ? `(${pods.items.length})` : ''}
      </div>
      {tab.podsLoading && !pods ? <div className="state-message">Loading pods...</div> : !pods || pods.items.length === 0 ? (
        <div style={{ padding: 12, color: 'var(--text-dim)', fontSize: 12 }}>No pods found for this deployment.</div>
      ) : (
        <div className="table-container" style={{ maxHeight: 300, border: '1px solid var(--border)' }}>
          <div className="table-header">
            <div className="cell" style={{ width: 36, flexShrink: 0 }}>#</div>
            {pods.columns.map((c) => <div className="cell" key={c.key} style={colStyle(c)}>{c.label}</div>)}
          </div>
          {pods.items.map((item, i) => {
            const selected = i === (tab.selectedPod ?? 0);
            return (
              <div key={item.key} className={`table-row ${selected ? 'selected' : ''}`} style={podRowStyle(item.cells.status ?? '', item.cells.owner ?? '', selected)} onClick={() => onSelect(i)} onDoubleClick={() => onOpen(i)} title="Select replica; press Enter to open logs">
                <div className="cell" style={{ width: 36, flexShrink: 0, color: 'var(--text-dim)' }}>{i + 1}</div>
                {pods.columns.map((c) => <div className="cell" key={c.key} style={{ ...colStyle(c), ...(c.key === 'status' ? { color: podStatusColor(item.cells.status ?? '') } : {}) }}><ResourceCell column={c} value={item.cells[c.key] ?? ''} warning={c.key === 'cpu' ? item.cells.highCpu === 'true' : c.key === 'memory' ? item.cells.highMemory === 'true' : false} /></div>)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WorkloadDetail({ tab, onClose, onSelectPod, onOpenPodLogs, onSelectContainer, onOpenContainerLogs, onToggleLogWatch, onLogWatchInterval, onRefreshLogs, onToggleLogWrap }: {
  tab: KubeWorkloadTab; onClose: () => void; onSelectPod: (i: number) => void; onOpenPodLogs: (i: number) => void;
  onSelectContainer: (i: number) => void; onOpenContainerLogs: (i: number) => void;
  onToggleLogWatch: (enabled: boolean) => void; onLogWatchInterval: (seconds: number) => void; onRefreshLogs: () => void;
  onToggleLogWrap: (enabled: boolean) => void;
}) {
  if (tab.mode === 'pod-logs') return <PodLogsView tab={tab} onClose={onClose} onToggleWatch={onToggleLogWatch} onWatchInterval={onLogWatchInterval} onRefresh={onRefreshLogs} onToggleWrap={onToggleLogWrap} />;
  if (tab.mode === 'pod-containers') return <PodContainersView name={tab.name} namespace={tab.namespace} containers={tab.containers ?? []} selectedContainer={tab.selectedContainer ?? 0} onClose={onClose} onSelect={onSelectContainer} onOpenLogs={onOpenContainerLogs} />;
  const d = tab.detail;

  if (!tab.loading && !tab.error && d) {
    return (
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Replicas: {tab.namespace}/{tab.name}</span>
          <div style={{ flex: 1 }} />
          <button className="back-btn" onClick={onClose} title="Close tab">✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
          <DeploymentPods tab={tab} onSelect={onSelectPod} onOpen={onOpenPodLogs} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{tab.namespace}/{tab.name}</span>
        <div style={{ flex: 1 }} />
        <button className="back-btn" onClick={onClose} title="Close tab">✕</button>
      </div>

      {tab.loading ? (
        <div className="state-message">Loading workload details...</div>
      ) : tab.error || !d ? (
        <div className="state-message error">{tab.error || 'Failed to load workload details'}</div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
          {/* Image version — first level */}
          <div style={{ marginTop: 14 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: 0.4,
              padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--tint-blue)',
            }}>
              Image Version
            </div>
            {d.containers.map((c) => (
              <div key={c.name} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', background: 'var(--tint-blue)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{c.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'SF Mono, Menlo, Consolas, monospace', wordBreak: 'break-all' }}>{c.image}</div>
              </div>
            ))}
          </div>

          <DeploymentPods tab={tab} onSelect={onSelectPod} onOpen={onOpenPodLogs} />

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              Overview
            </div>
            <div style={{ padding: '2px 8px' }}>
              <DetailRow label="Replicas" value={`${d.ready}/${d.replicas} ready (${d.available} available, ${d.updated} updated)`} />
              <DetailRow label="Strategy" value={d.strategyType + (d.maxSurge ? ` — maxSurge ${d.maxSurge}, maxUnavailable ${d.maxUnavailable ?? '—'}` : '')} />
              <DetailRow label="Selector" value={Object.entries(d.selector).map(([k, v]) => `${k}=${v}`).join(', ')} />
              <DetailRow label="Created" value={new Date(d.createdAt).toLocaleString()} />
            </div>
          </div>

          {d.containers.map((c: KubeContainer) => (
            <div key={c.name} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                Container: {c.name}
              </div>
              <div style={{ padding: '2px 8px' }}>
                <DetailRow label="Image" value={c.image} mono />
                <DetailRow label="Image Pull Policy" value={c.imagePullPolicy ?? '—'} />
                <DetailRow label="Ports" value={c.ports.map((p) => `${p.containerPort}/${p.protocol ?? 'TCP'}${p.name ? ` (${p.name})` : ''}`).join(', ')} />
                {c.command?.length ? <DetailRow label="Command" value={c.command.join(' ')} mono /> : null}
                {c.args?.length ? <DetailRow label="Args" value={c.args.join(' ')} mono /> : null}
                {c.env.length > 0 && (
                  <DetailRow
                    label="Env"
                    value={c.env.map((e) => `${e.name}=${e.value ?? e.valueFrom ?? ''}`).join('\n')}
                    mono
                  />
                )}
                <DetailRow label="Resources requests" value={Object.entries(c.resources?.requests ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ')} />
                <DetailRow label="Resources limits" value={Object.entries(c.resources?.limits ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ')} />
                <DetailRow label="Liveness" value={c.livenessProbe?.detail ?? '—'} />
                <DetailRow label="Readiness" value={c.readinessProbe?.detail ?? '—'} />
                <DetailRow label="Startup" value={c.startupProbe?.detail ?? '—'} />
              </div>
            </div>
          ))}

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              Labels
            </div>
            <div style={{ padding: '2px 8px' }}>
              {Object.keys(d.labels).length === 0
                ? <DetailRow label="—" value="—" />
                : Object.entries(d.labels).map(([k, v]) => <DetailRow key={k} label={k} value={v} mono />)}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              Conditions
            </div>
            <div style={{ padding: '2px 8px' }}>
              {d.conditions.length === 0
                ? <DetailRow label="—" value="—" />
                : d.conditions.map((c, i) => (
                  <DetailRow key={i} label={c.type} value={`${c.status}${c.reason ? ` — ${c.reason}` : ''}`} />
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function KubeConfirmDialog({ message, title = 'Confirm deployment restart', warning = 'This updates the deployment pod template and triggers a rolling restart.', confirmLabel = 'Restart', onConfirm, onCancel }: {
  message: string;
  title?: string;
  warning?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="command-overlay" onClick={onCancel} style={{ alignItems: 'center', paddingTop: 0 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="kube-confirm-title" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          onConfirm();
        }
      }} tabIndex={-1} style={{ width: 'min(460px, 90vw)', background: 'var(--bg-secondary)', border: '1px solid var(--border-red)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-pop)', color: 'var(--text-primary)' }}>
        <div style={{ padding: '18px 20px', display: 'flex', gap: 13, alignItems: 'flex-start' }}>
          <div style={{ width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 8, background: 'var(--tint-red)', color: 'var(--accent-red)', border: '1px solid var(--border-red)', fontSize: 19, fontWeight: 700 }}>!</div>
          <div style={{ minWidth: 0 }}>
            <div id="kube-confirm-title" style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{title}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>{message}</div>
            <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 6, background: 'var(--tint-yellow)', border: '1px solid var(--border-yellow)', color: 'var(--accent-yellow)', fontSize: 11, lineHeight: 1.45 }}>{warning}</div>
          </div>
        </div>
        <div style={{ padding: '11px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-tertiary)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, color: 'var(--text-dim)', fontSize: 11 }}>Esc cancel · Enter confirm</span>
          <button onClick={onCancel} style={{ padding: '7px 12px', borderRadius: 5, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button autoFocus onClick={onConfirm} style={{ padding: '7px 13px', borderRadius: 5, background: 'linear-gradient(135deg, var(--accent-red), color-mix(in srgb, var(--accent-red) 72%, var(--bg-primary)))', border: '1px solid var(--accent-red)', color: '#fff', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

type JsonTreeValue = null | boolean | number | string | JsonTreeValue[] | { [key: string]: JsonTreeValue };

function isJsonTreeObject(value: JsonTreeValue): value is { [key: string]: JsonTreeValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonValueText(value: JsonTreeValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function matchingJsonPaths(value: JsonTreeValue, query: string, path = '$'): string[] {
  if (!query) return [];
  const matches: string[] = [];
  if (jsonValueText(value).toLowerCase().includes(query)) matches.push(path);
  if (Array.isArray(value)) {
    value.forEach((child, index) => matches.push(...matchingJsonPaths(child, query, `${path}[${index}]`)));
  } else if (isJsonTreeObject(value)) {
    Object.entries(value).forEach(([key, child]) => {
      const childPath = `${path}.${key}`;
      if (key.toLowerCase().includes(query)) matches.push(`${childPath}::key`);
      matches.push(...matchingJsonPaths(child, query, childPath));
    });
  }
  return matches;
}

function collapsedJsonPathsAtDepth(value: JsonTreeValue, path = '$', depth = 0): string[] {
  const expandable = Array.isArray(value) || isJsonTreeObject(value);
  if (!expandable) return [];
  const paths = depth >= 4 ? [path] : [];
  const entries = Array.isArray(value) ? value.map((child, index) => [`[${index}]`, child] as const) : Object.entries(value);
  entries.forEach(([key, child]) => {
    paths.push(...collapsedJsonPathsAtDepth(child, Array.isArray(value) ? `${path}${key}` : `${path}.${key}`, depth + 1));
  });
  return paths;
}

function JsonHighlightedText({ text, query, first, firstRef }: { text: string; query: string; first?: boolean; firstRef?: React.RefObject<HTMLSpanElement | null> }) {
  if (!query) return <>{text}</>;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedQuery})`, 'ig'));
  return <>{parts.map((part, index) => part.toLowerCase() === query ? <mark key={index} ref={first ? firstRef : undefined} style={{ background: 'var(--tint-yellow)', color: 'var(--accent-yellow)', borderRadius: 2, padding: '0 2px' }}>{part}</mark> : <React.Fragment key={index}>{part}</React.Fragment>)}</>;
}

function JsonTreeNode({ value, path, label, query, collapsed, onToggle, firstPath, firstRef, depth = 0 }: {
  value: JsonTreeValue;
  path: string;
  label?: string;
  query: string;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  firstPath?: string;
  firstRef: React.RefObject<HTMLSpanElement | null>;
  depth?: number;
}) {
  const expandable = Array.isArray(value) || isJsonTreeObject(value);
  const isCollapsed = collapsed.has(path);
  const entries = Array.isArray(value) ? value.map((child, index) => [`[${index}]`, child] as const) : isJsonTreeObject(value) ? Object.entries(value) : [];
  const bracket = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  const valueLabel = expandable ? `${bracket[0]}${entries.length ? ` ${entries.length} item${entries.length === 1 ? '' : 's'}` : ''} ${bracket[1]}` : jsonValueText(value);
  const primitiveColor = value === null ? 'var(--accent-purple)' : typeof value === 'string' ? 'var(--accent-green)' : typeof value === 'boolean' ? 'var(--accent-orange)' : 'var(--accent-cyan)';

  return (
    <div style={{ marginLeft: depth * 16, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minHeight: 22 }}>
        {expandable ? <button onClick={() => onToggle(path)} style={{ width: 18, padding: 0, border: 0, background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'inherit' }} aria-label={isCollapsed ? 'Expand' : 'Collapse'}>{isCollapsed ? '▸' : '▾'}</button> : <span style={{ width: 18 }} />}
        {label !== undefined && <><span style={{ color: 'var(--accent-blue)' }}><JsonHighlightedText text={JSON.stringify(label)} query={query} first={firstPath === `${path}::key`} firstRef={firstRef} /></span><span style={{ color: 'var(--text-dim)' }}>:</span></>}
        {expandable ? <span style={{ color: 'var(--text-secondary)' }}>{valueLabel}</span> : <span style={{ color: primitiveColor }}><JsonHighlightedText text={valueLabel} query={query} first={firstPath === path} firstRef={firstRef} /></span>}
      </div>
      {expandable && !isCollapsed && entries.map(([key, child]) => <JsonTreeNode key={key} value={child} path={Array.isArray(value) ? `${path}${key}` : `${path}.${key}`} label={Array.isArray(value) ? key : key} query={query} collapsed={collapsed} onToggle={onToggle} firstPath={firstPath} firstRef={firstRef} depth={depth + 1} />)}
    </div>
  );
}

export function KubeDescribeDialog({ title, json, query, error, onQueryChange, onClose }: {
  title: string;
  json: string;
  query: string;
  error?: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
}) {
  const normalized = query.trim().toLowerCase();
  const parsed = useMemo<JsonTreeValue | null>(() => {
    if (!json) return null;
    try { return JSON.parse(json) as JsonTreeValue; } catch { return null; }
  }, [json]);
  const matches = useMemo(() => parsed === null ? [] : matchingJsonPaths(parsed, normalized), [parsed, normalized]);
  const [matchIndex, setMatchIndex] = useState(0);
  const currentMatchIndex = matches.length ? Math.min(matchIndex, matches.length - 1) : 0;
  const firstPath = matches[currentMatchIndex];
  const firstRef = useRef<HTMLSpanElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (parsed !== null) setCollapsed(new Set(collapsedJsonPathsAtDepth(parsed)));
  }, [parsed]);

  useEffect(() => {
    setMatchIndex(0);
  }, [normalized]);

  useEffect(() => {
    if (normalized) setCollapsed((previous) => new Set([...previous].filter((path) => !matches.some((match) => match.startsWith(path)))));
  }, [normalized, matches]);

  useEffect(() => {
    if (firstPath) window.requestAnimationFrame(() => firstRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }, [firstPath]);

  return (
    <div className="command-overlay" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(900px, 90vw)', height: 'min(760px, 85vh)', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow-pop)' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{title}</span>
          <input autoFocus value={query} onChange={(e) => { onQueryChange(e.target.value); setMatchIndex(0); }} placeholder="Search keys and values..." style={{ flex: 1, minWidth: 0, padding: '6px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none' }} />
          {normalized && <>
            <span style={{ color: matches.length ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: 11, whiteSpace: 'nowrap' }}>{matches.length ? `${currentMatchIndex + 1}/${matches.length}` : 'No matches'}</span>
            <button disabled={!matches.length} onClick={() => setMatchIndex((currentMatchIndex - 1 + matches.length) % matches.length)} title="Previous match" style={{ padding: '3px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: matches.length ? 'pointer' : 'not-allowed', opacity: matches.length ? 1 : 0.5 }}>↑</button>
            <button disabled={!matches.length} onClick={() => setMatchIndex((currentMatchIndex + 1) % matches.length)} title="Next match" style={{ padding: '3px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: matches.length ? 'pointer' : 'not-allowed', opacity: matches.length ? 1 : 0.5 }}>↓</button>
          </>}
          <button className="back-btn" onClick={onClose} title="Close (Esc)">✕</button>
        </div>
        {error ? <div className="state-message error">{error}</div> : !json ? <div className="state-message">Loading description...</div> : (
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 16px 20px', color: 'var(--text-primary)' }}>
            {parsed === null ? <pre style={{ margin: 0, font: '12px/1.55 var(--font-mono)', userSelect: 'text' }}>{json}</pre> : <JsonTreeNode value={parsed} path="$" query={normalized} collapsed={collapsed} onToggle={(path) => setCollapsed((previous) => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next; })} firstPath={firstPath} firstRef={firstRef} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main view ──────────────────────────────────────────────────────────────

export function K8sView({
  contexts, contextTabs, activeTab, workloadTabs, compareTab, error, searchQuery, onSearchQueryChange,
  onOpenContextTab, onTabNamespaceChange, onTabKindChange, onTabPodFilterToggle,
  onTabWatchToggle, onTabWatchInterval, onRefreshTab, onSilentRefreshTab,
  onSelect, onOpenWorkload, onOpenPod, onSelectContextContainer, onOpenContextContainerLogs, onClosePodDrilldown, onToggleLogWatch, onLogWatchInterval, onRefreshLogs, onToggleLogWrap, onSelectWorkloadPod, onOpenPodLogs, onSelectWorkloadContainer, onOpenContainerLogs, onCompareContext, onAddCompareContext, onRemoveCompareSide,
  onActivateTab, onCloseTab, onRenameTab, onBack,
}: K8sViewProps) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; ctx: string } | null>(null);
  const closeMenu = () => setCtxMenu(null);

  const activeContextTab = contextTabs.find((t) => t.id === activeTab) ?? contextTabs[0];
  const activeWorkloadTab = activeTab !== 'compare' && activeTab !== ''
    ? workloadTabs.find((t) => t.id === activeTab) ?? null
    : null;

  // Right-click menu: open context tabs first (tab labels), then the rest.
  const menuCtx = ctxMenu?.ctx ?? activeContextTab?.context ?? '';
  const openOthers = contextTabs.filter((t) => t.context !== menuCtx);
  const openSet = new Set(openOthers.map((t) => t.context));
  const menuItems = [
    ...openOthers.map((t) => ({ name: t.context, label: t.label ?? t.context, open: true })),
    ...contexts.filter((c) => c.name !== menuCtx && !openSet.has(c.name)).map((c) => ({ name: c.name, label: c.name, open: false })),
  ];

  const showCompareMenuFor = (e: React.MouseEvent, ctx: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, ctx });
  };

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Title bar — open a context in its own tab; namespace lives inside the tab */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Kubernetes</span>
        <select
          value={menuCtx}
          onChange={(e) => { if (e.target.value) onOpenContextTab(e.target.value); }}
          onContextMenu={(e) => showCompareMenuFor(e, menuCtx)}
          style={{ ...SELECT_STYLE, maxWidth: 260 }}
          title="Context (select to open in a tab; right-click to compare)"
        >
          <option value="">— open context —</option>
          {contexts.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>right-click tab to compare</span>
        <div style={{ flex: 1 }} />
        <button className="back-btn" onClick={onBack} title="Back to repos">←</button>
      </div>

      <TabBar
        activeTab={activeTab}
        contextTabs={contextTabs}
        workloadTabs={workloadTabs}
        compareTab={compareTab}
        onActivate={onActivateTab}
        onClose={onCloseTab}
        onRenameTab={onRenameTab}
        onContextMenu={showCompareMenuFor}
        fallbackCtx={activeContextTab?.context ?? ''}
      />

      {ctxMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} />
          <div style={{
            position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 100, minWidth: 260,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)', borderRadius: 6,
            boxShadow: 'var(--shadow-pop)', padding: '4px 0', maxHeight: 360, overflow: 'auto',
          }}>
            <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Compare {menuCtx || 'context'} with…
            </div>
            {menuItems.length === 0 ? (
              <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-dim)' }}>No other contexts</div>
            ) : menuItems.map((m) => (
              <div
                key={m.name}
                onClick={() => { closeMenu(); onCompareContext(menuCtx, m.name); }}
                style={{
                  padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                title={m.name}
              >
                {m.label}
                {m.open && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--accent-blue)', border: '1px solid var(--border-blue)', borderRadius: 4, padding: '0 4px' }}>tab</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {error && contextTabs.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div style={{ color: 'var(--accent-red)', fontSize: 14, textAlign: 'center', lineHeight: 1.6, maxWidth: 480 }}>{error}</div>
        </div>
      ) : activeTab === 'compare' && compareTab ? (
        <CompareView
          compareTab={compareTab}
          contexts={contexts}
          onAddCompareContext={onAddCompareContext}
          onRemoveCompareSide={onRemoveCompareSide}
          onClose={() => onCloseTab('compare')}
        />
      ) : activeWorkloadTab ? (
        <WorkloadDetail
          tab={activeWorkloadTab}
          onClose={() => onCloseTab(activeWorkloadTab.id)}
          onSelectPod={(i) => onSelectWorkloadPod(activeWorkloadTab.id, i)}
          onOpenPodLogs={(i) => onOpenPodLogs(activeWorkloadTab.id, i)}
          onSelectContainer={(i) => onSelectWorkloadContainer(activeWorkloadTab.id, i)}
          onOpenContainerLogs={(i) => onOpenContainerLogs(activeWorkloadTab.id, i)}
          onToggleLogWatch={onToggleLogWatch}
          onLogWatchInterval={onLogWatchInterval}
          onRefreshLogs={onRefreshLogs}
          onToggleLogWrap={onToggleLogWrap}
        />
      ) : activeContextTab ? (
        <ContextTabView
          tab={activeContextTab}
          searchQuery={searchQuery}
          onSearchQueryChange={onSearchQueryChange}
          onNamespaceChange={onTabNamespaceChange}
          onKindChange={onTabKindChange}
          onPodFilterToggle={onTabPodFilterToggle}
          onWatchToggle={onTabWatchToggle}
          onWatchInterval={onTabWatchInterval}
          onRefresh={onRefreshTab}
          onSilentRefresh={onSilentRefreshTab}
          onSelect={onSelect}
          onOpenWorkload={onOpenWorkload}
          onOpenPod={onOpenPod}
          onSelectContainer={onSelectContextContainer}
          onOpenContainerLogs={onOpenContextContainerLogs}
          onClosePodDrilldown={onClosePodDrilldown}
        />
      ) : (
        <div className="state-message">Loading Kubernetes contexts...</div>
      )}
    </div>
  );
}
