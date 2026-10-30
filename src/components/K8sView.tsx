import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  KubeContext, KubeContextSetting, KubeContextSettings, KubeContextTab, KubeWorkloadTab, KubeCompareTab, KubeContainer, KubeDeploymentDetail,
  KubeResourceColumn, KubeResourceItem,
  KubePodStatusSummary,
} from '../../core/types.js';
import { KUBE_RESOURCE_OPTIONS } from '../../core/types.js';
import { timeAgo } from '../../core/utils.js';
import { SPINNER } from '../../core/utils.js';
import { compareContextImages, extractImageVersion, summarizeKubePods, type KubeImageCompareRow } from '../../core/k8s-compare.js';
import { K8sInspectorErrorBoundary, K8sResourceInspector, type K8sInspectorEntry } from './k8s/K8sResourceInspector.js';
import { PodLogsView } from './k8s/PodLogsView.js';

interface K8sViewProps {
  contexts: KubeContext[];
  enabledContexts: KubeContext[];
  contextSettings: KubeContextSettings;
  contextTabs: KubeContextTab[];
  activeTab: string; // '' | 'compare' | context/workload tab id
  workloadTabs: KubeWorkloadTab[];
  compareTab: KubeCompareTab | null;
  error: string; // global init error (no contexts found)
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onOpenContextTab: (ctx: string) => void;
  onRefreshContexts: () => Promise<void>;
  onSaveContextSetting: (contextName: string, setting: KubeContextSetting) => Promise<void>;
  onTabNamespaceChange: (tabId: string, ns: string) => void;
  onTabKindChange: (tabId: string, kind: string) => void;
  onTabPodFilterToggle: (tabId: string, category: string) => void;
  onTabPodAgeFilterChange: (tabId: string, ageFilter: string) => void;
  onTabPodStatusFilterChange: (tabId: string, statusFilter: string) => void;
  onTabWatchToggle: (tabId: string, enabled: boolean) => void;
  onTabWatchInterval: (tabId: string, seconds: number) => void;
  onRefreshTab: (tabId: string) => void;
  onSilentRefreshTab: (tabId: string) => void;
  onDescribeResource: (index: number) => void;
  onDeleteResource: (index: number) => void;
  onCopyResource: (index: number, qualified: boolean) => void;
  onViewResource: (index: number) => Promise<KubeDeploymentDetail | string | null>;
  onRestartDeployment: (index: number, all: boolean) => void;
  onSelect: (i: number) => void;
  onToggleSelectionMode: (tabId: string) => void;
  onToggleResourceSelection: (tabId: string, key: string) => void;
  onSelectVisibleResources: (tabId: string, keys: string[], checked: boolean) => void;
  onRequestBulkAction: (tabId: string, action: 'delete' | 'restart') => void;
  onOpenWorkload: (i: number) => void;
  onOpenPod: (i: number) => void;
  onSelectContextContainer: (i: number) => void;
  onOpenContextContainerLogs: (i: number) => void;
  onClosePodDrilldown: () => void;
  onToggleLogWatch: (enabled: boolean) => void;
  onRefreshLogs: () => void;
  onDownloadLogs: (mode: 'visible' | 'entire', logContent: string) => void;
  onClearLogs: () => void;
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

function Tab({ label, active, color, onClose, onClick, onContextMenu, onRename }: {
  label: string; active: boolean; onClose?: () => void; onClick: () => void;
  color?: KubeContextSetting['color'];
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
      className={`k8s-tab${active ? ' is-active' : ''}${color ? ` is-context-color-${color}` : ''}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 8px 4px 12px', fontSize: 12, cursor: 'pointer',
        borderTopLeftRadius: 6, borderTopRightRadius: 6,
        border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
        borderBottom: active ? '1px solid var(--bg-primary)' : '1px solid var(--border)',
        background: color ? undefined : active ? 'var(--bg-secondary)' : 'transparent',
        color: color ? undefined : active ? 'var(--text-primary)' : 'var(--text-dim)',
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

type KubeMenuIconName = 'open' | 'logs' | 'restart' | 'restart-all' | 'describe' | 'delete' | 'refresh' | 'copy';

function KubeMenuIcon({ name }: { name: KubeMenuIconName }) {
  const paths: Record<KubeMenuIconName, React.ReactNode> = {
    open: <><path d="M5 4h14v16H5z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    logs: <><path d="M4 5h16v14H4z" /><path d="m7 9 2 2-2 2M11 13h5" /></>,
    restart: <><path d="M20 11a8 8 0 0 0-14.5-4L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.5 4L20 15" /><path d="M20 20v-5h-5" /></>,
    'restart-all': <><path d="M7 7h10v10H7z" /><path d="M4 4h5M4 4v5M20 20h-5M20 20v-5" /></>,
    describe: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    delete: <><path d="M4 7h16M10 11v5M14 11v5M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.5-4L4 9" /><path d="M4 4v5h5M4 13a8 8 0 0 0 14.5 4L20 15M20 20v-5h-5" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" /></>,
  };
  return <svg className="repo-context-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function ResourceMenuItem({ label, icon, onClick, danger = false, disabled = false, title }: { label: string; icon: KubeMenuIconName; onClick: () => void; danger?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      className={`${danger ? 'k8s-danger-menu-item ' : ''}${disabled ? 'is-disabled' : ''}`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      <KubeMenuIcon name={icon} /><span>{label}</span>
    </button>
  );
}

const POD_AGE_FILTERS = [
  { value: 'all', label: 'All ages' },
  { value: '10m', label: '10 min' },
  { value: '30m', label: '30 min' },
  { value: '1h', label: '1 hr' },
  { value: '6h', label: '6 hr' },
  { value: 'today', label: 'Today' },
  { value: '3d', label: '3 days' },
  { value: '5d', label: '5 days' },
  { value: '15d', label: '15 days' },
  { value: '1mo', label: '1 month' },
  { value: 'older', label: 'Older than 1 month' },
] as const;

function ContextTabControls({ tab, searchQuery, onSearchQueryChange, onPodFilterToggle, onPodAgeFilterChange, onWatchToggle, onWatchInterval, onRefresh }: {
  tab: KubeContextTab;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onPodFilterToggle: (tabId: string, category: string) => void;
  onPodAgeFilterChange: (tabId: string, ageFilter: string) => void;
  onWatchToggle: (tabId: string, enabled: boolean) => void;
  onWatchInterval: (tabId: string, seconds: number) => void;
  onRefresh: (tabId: string) => void;
}) {
  const showPodFilter = tab.kind === 'pods';
  const filters = tab.podFilters ?? ['ReplicaSet'];
  const ownerKinds = [...new Set(tab.resources.items.map((i) => i.cells.owner ?? 'None'))].sort();

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap', flexShrink: 0, padding: '4px 0' }}>
      <div className="k8s-search-box">
        <span className="k8s-search-icon" aria-hidden="true">⌕</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search resources"
          aria-label="Search Kubernetes resources"
        />
        {searchQuery && <button type="button" onClick={() => onSearchQueryChange('')} aria-label="Clear resource search" title="Clear search">×</button>}
      </div>
      {showPodFilter && <div className="k8s-age-filter" title="Filter pods by age">
        <span className="k8s-age-filter-icon" aria-hidden="true">◷</span>
        <span className="k8s-age-filter-label">Age</span>
        <span className="k8s-age-filter-select-wrap">
          <select
            className="k8s-age-filter-select"
            value={tab.podAgeFilter ?? 'all'}
            onChange={(e) => onPodAgeFilterChange(tab.id, e.target.value)}
            aria-label="Filter pods by age"
          >
            {POD_AGE_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <span className="k8s-age-filter-chevron" aria-hidden="true">⌄</span>
        </span>
      </div>}
      {showPodFilter && ownerKinds.map((kind) => {
        const active = filters.includes(kind);
        return (
          <button
            key={kind}
            onClick={() => onPodFilterToggle(tab.id, kind)}
            style={{
              padding: '2px 8px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
              background: active ? 'var(--tint-blue)' : 'transparent',
              border: `1px solid ${active ? 'var(--border-blue)' : 'var(--border)'}`,
              color: active ? 'var(--accent-blue)' : 'var(--text-dim)', fontWeight: active ? 600 : 400,
            }}
            title={`Show/hide ${kind}-owned pods`}
          >{kind}</button>
        );
      })}
      <button
        onClick={() => onWatchToggle(tab.id, !tab.watch)}
        style={{
          padding: '2px 9px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
          background: tab.watch ? 'var(--tint-green)' : 'var(--bg-tertiary)',
          border: `1px solid ${tab.watch ? 'var(--border-green)' : 'var(--border)'}`,
          color: tab.watch ? 'var(--accent-green)' : 'var(--text-secondary)', fontWeight: tab.watch ? 600 : 400,
        }}
        title={tab.watch ? 'Stop watching — click to pause live refresh' : 'Watch mode: live-refresh this table'}
      >{tab.watch ? '● watching' : '▶ watch'}</button>
      {tab.watch && <>
        <input
          type="number" min={1} step={1} value={tab.watchInterval ?? 2}
          onChange={(e) => onWatchInterval(tab.id, parseInt(e.target.value, 10) || 1)}
          style={{ width: 44, padding: '2px 4px', fontFamily: 'inherit', fontSize: 11, textAlign: 'center', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, outline: 'none' }}
          title="Watch interval in seconds (default 2)"
        />
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>sec</span>
      </>}
      <button onClick={() => onRefresh(tab.id)} style={{ ...SELECT_STYLE, padding: '2px 8px', cursor: 'pointer' }} title="Refresh">↻</button>
    </div>
  );
}

function podMatchesAgeFilter(item: KubeResourceItem, filter: string): boolean {
  if (filter === 'all' || !item.cells.age) return true;
  const createdAt = new Date(item.cells.age).getTime();
  if (!Number.isFinite(createdAt)) return true;
  const now = Date.now();
  if (filter === 'today') {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return createdAt >= startOfToday.getTime();
  }
  const month = 30 * 24 * 60 * 60 * 1000;
  if (filter === 'older') return now - createdAt > month;
  const durations: Record<string, number> = {
    '10m': 10 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '5d': 5 * 24 * 60 * 60 * 1000,
    '15d': 15 * 24 * 60 * 60 * 1000,
    '1mo': month,
  };
  return durations[filter] == null || now - createdAt <= durations[filter];
}

function TabBar({ activeTab, contextTabs, workloadTabs, compareTab, activeContextTab, contextSettings, searchQuery, onSearchQueryChange, onPodFilterToggle, onPodAgeFilterChange, onWatchToggle, onWatchInterval, onRefresh, onActivate, onClose, onRenameTab, onContextMenu, fallbackCtx }: {
  activeTab: string; contextTabs: KubeContextTab[]; workloadTabs: KubeWorkloadTab[]; compareTab: KubeCompareTab | null;
  contextSettings: KubeContextSettings;
  activeContextTab?: KubeContextTab; searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onPodFilterToggle: (tabId: string, category: string) => void;
  onPodAgeFilterChange: (tabId: string, ageFilter: string) => void;
  onWatchToggle: (tabId: string, enabled: boolean) => void;
  onWatchInterval: (tabId: string, seconds: number) => void;
  onRefresh: (tabId: string) => void;
  onActivate: (id: string) => void; onClose: (id: string) => void; onRenameTab: (id: string, label: string) => void;
  onContextMenu: (e: React.MouseEvent, ctx: string) => void; fallbackCtx: string;
}) {
  return (
    <div style={{
      display: 'flex', gap: 3, padding: '6px 12px 0', flexShrink: 0,
      borderBottom: '1px solid var(--border)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', flex: 1, gap: 3, minWidth: 0, overflowX: 'auto', alignItems: 'flex-end' }}>
      {contextTabs.map((t) => (
        <Tab
          key={t.id}
          label={t.label ?? t.context}
          active={activeTab === t.id}
          color={contextSettings[t.context]?.color}
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
          color={contextSettings[t.context]?.color}
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
      <div style={{ flex: 1, minWidth: 8 }} />
      {activeContextTab && (
        <ContextTabControls
          tab={activeContextTab}
          searchQuery={searchQuery}
          onSearchQueryChange={onSearchQueryChange}
          onPodFilterToggle={onPodFilterToggle}
          onPodAgeFilterChange={onPodAgeFilterChange}
          onWatchToggle={onWatchToggle}
          onWatchInterval={onWatchInterval}
          onRefresh={onRefresh}
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
      <div className="k8s-view-header" style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
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
                              title={`${r.images[i] ?? v}${age ? `\nlast updated: ${humanDate(age)}` : ''}`}
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

function humanDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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
    return value ? <span title={humanDate(value)}>{timeAgo(value)}</span> : <span>—</span>;
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

function PodResourceCell({ value, metricsAvailable }: { value: string; metricsAvailable: boolean }) {
  const used = usageResource(value);
  const allocated = allocatedFromUsage(value);
  const title = metricsAvailable
    ? (allocated ? `${used || '0'} used / ${allocated} allocated` : `${used || '0'} used / allocation unavailable`)
    : 'Live metrics unavailable · showing configured requests/limits';
  return <span title={title}>{value || '—'}</span>;
}

function podRowStyle(status: string, owner: string, selected: boolean): React.CSSProperties {
  return {
    color: podStatusColor(status),
    // Job-owned pods get a subtle tint; ReplicaSet-owned pods remain unchanged.
    ...(owner === 'Job' && !selected ? { background: 'var(--tint-purple)' } : {}),
  };
}

function PodStatusSummary({ summary, loading, filter = 'all', onFilterChange }: { summary?: KubePodStatusSummary; loading?: boolean; filter?: string; onFilterChange?: (filter: string) => void }) {
  if (!summary) return null;
  const statuses = [
    { key: 'all', label: 'All pods', value: summary.total, color: 'var(--text-secondary)' },
    { key: 'running', label: 'Running', value: summary.running, color: 'var(--accent-green)' },
    { key: 'succeeded', label: 'Succeeded', value: summary.succeeded, color: 'var(--accent-cyan)' },
    { key: 'error', label: 'Error', value: summary.error, color: 'var(--accent-red)' },
    { key: 'terminating', label: 'Terminating', value: summary.terminating, color: 'var(--accent-blue)' },
    { key: 'notReady', label: 'Not ready', value: summary.notReady, color: 'var(--accent-yellow)' },
  ];
  return (
    <div className={`k8s-pod-status-summary${loading ? ' is-loading' : ''}`} aria-label="Pod status summary">
      {statuses.map((status) => (
        <button type="button" className={`k8s-pod-status-item${filter === status.key ? ' is-active' : ''}`} key={status.key} title={`Show ${status.label.toLowerCase()} pods`} aria-pressed={filter === status.key} onClick={() => onFilterChange?.(status.key)}>
          {status.key === 'all' ? <span className="k8s-pod-status-label">All</span> : <span className="k8s-pod-status-count" style={{ color: status.color }}>{status.value}</span>}
        </button>
      ))}
    </div>
  );
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

function InspectorValue({ label, value, mono = false, copy = false }: { label: string; value: string; mono?: boolean; copy?: boolean }) {
  const copyValue = () => { if (value) void navigator.clipboard.writeText(value); };
  return <div style={{ padding: '7px 9px', borderBottom: '1px solid var(--border)' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, color: 'var(--text-dim)', fontSize: 10, marginBottom: 3 }}><span>{label}</span>{copy && value && <button type="button" className="k8s-copy-button" onClick={(e) => { e.stopPropagation(); copyValue(); }} title={`Copy ${label}`} aria-label={`Copy ${label}`}><KubeMenuIcon name="copy" /></button>}</div><div style={{ color: 'var(--text-primary)', font: mono ? '12px var(--font-mono)' : '12px var(--font-sans)', wordBreak: 'break-word', lineHeight: 1.35 }}>{value || '—'}</div></div>;
}

function InspectorStatus({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const positive = ['running', 'ready', 'active', 'succeeded', 'completed'].some((word) => normalized.includes(word));
  return <span className={`k8s-inspector-status${positive ? ' is-positive' : ''}`}>{value || 'Unknown'}</span>;
}

function resourceAmount(value: string): number {
  const match = value.trim().match(/^([\d.]+)\s*(n|u|m|B|k|M|G|T|P|E|Ki|Mi|Gi|Ti|Pi|Ei)?$/i);
  if (!match) return Number.NaN;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  if (unit === 'n') return amount / 1e9;
  if (unit === 'u') return amount / 1e6;
  if (unit === 'm') return amount / 1000;
  if (unit === 'b') return amount;
  if (unit === 'k') return amount * 1000;
  if (unit === 'p') return amount * 1000 ** 5;
  if (unit === 'e') return amount * 1000 ** 6;
  if (unit === 'ki') return amount * 1024;
  if (unit === 'mi') return amount * 1024 ** 2;
  if (unit === 'gi') return amount * 1024 ** 3;
  if (unit === 'ti') return amount * 1024 ** 4;
  return amount;
}

function remainingResource(used: string, limit?: string): string {
  if (!limit) return '';
  const usedAmount = resourceAmount(used);
  const limitAmount = resourceAmount(limit);
  if (!Number.isFinite(usedAmount) || !Number.isFinite(limitAmount)) return '';
  const difference = Math.max(0, limitAmount - usedAmount);
  if (/m$/i.test(limit)) return `${Math.round(difference * 1000)}m`;
  if (/Ki$/i.test(limit)) return `${Math.round(difference / 1024)}Ki`;
  if (/Mi$/i.test(limit)) return `${Math.round(difference / 1024 ** 2)}Mi`;
  if (/Gi$/i.test(limit)) return `${(difference / 1024 ** 3).toFixed(2)}Gi`;
  return difference.toFixed(2);
}

function allocatedResource(containers: any[], key: string): string {
  const values = containers.map((container) => container?.resources?.limits?.[key]).filter(Boolean);
  if (!values.length) return '';
  const total = values.reduce((sum, value) => sum + resourceAmount(value), 0);
  const template = values[0] as string;
  if (/m$/i.test(template)) return `${Math.round(total * 1000)}m`;
  if (/Ki$/i.test(template)) return `${Math.round(total / 1024)}Ki`;
  if (/Mi$/i.test(template)) return `${(total / 1024 ** 2).toFixed(0)}Mi`;
  if (/Gi$/i.test(template)) return `${(total / 1024 ** 3).toFixed(2)}Gi`;
  return total.toFixed(2);
}

function usageResource(value: string): string {
  return value.split('/')[0]?.trim() ?? value;
}

function allocatedFromUsage(value: string): string {
  const allocated = value.split('/')[1]?.trim() ?? '';
  return allocated === '—' || allocated === '-' ? '' : allocated;
}

function InspectorMetric({ label, value, limit, free, available = true }: { label: string; value: string; limit?: string; free?: string; available?: boolean }) {
  const usedValue = usageResource(value);
  const effectiveLimit = limit || allocatedFromUsage(value);
  const usedAmount = resourceAmount(usedValue);
  const limitAmount = effectiveLimit ? resourceAmount(effectiveLimit) : Number.NaN;
  const percent = effectiveLimit && Number.isFinite(usedAmount) && Number.isFinite(limitAmount) ? Math.min(100, Math.max(0, usedAmount / Math.max(limitAmount, 0.0001) * 100)) : 0;
  // Keep the visual comparison visible even when the cluster has no live
  // metrics-server: in that case the value is the configured resource data.
  const visualPercent = percent || (!effectiveLimit && Number.isFinite(usedAmount) && usedAmount > 0 ? 18 : 0);
  const title = available
    ? (effectiveLimit ? `${usedValue || '0'} used · ${free || '—'} free · ${effectiveLimit} allocated` : `${usedValue || '0'} used · allocation unavailable`)
    : 'Live metrics unavailable · showing configured requests/limits';
  return <div className="k8s-inspector-metric"><div><span>{label}</span><strong>{`${usedValue || '—'} / ${effectiveLimit || '—'}`}</strong></div><div className="k8s-inspector-metric-track" title={title}><span style={{ width: `${visualPercent}%`, background: 'var(--accent-green)' }} /></div></div>;
}

function inspectorNodeText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(inspectorNodeText).join(' ');
  if (React.isValidElement(node)) {
    const props = node.props as Record<string, any>;
    return [props.label, props.value, props.title, inspectorNodeText(props.children)].filter(Boolean).join(' ');
  }
  return '';
}

function InspectorCard({ icon, title, summary, children, searchQuery = '' }: { icon: React.ReactNode; title: string; summary: string; children: React.ReactNode; searchQuery?: string }) {
  const [expanded, setExpanded] = useState(false);
  const values = React.Children.toArray(children);
  const query = searchQuery.trim().toLowerCase();
  const matchingValues = query ? values.filter((value) => inspectorNodeText(value).toLowerCase().includes(query)) : values;
  if (query && !`${title} ${summary}`.toLowerCase().includes(query) && matchingValues.length === 0) return null;
  const visibleValues = query && !`${title} ${summary}`.toLowerCase().includes(query) ? matchingValues : values;
  const hasMore = visibleValues.length > 4;
  return <div className={`k8s-inspector-card${hasMore ? ' has-more' : ''}${expanded ? ' is-active' : ''}`} onClick={() => setExpanded((open) => !open)} title="Click to toggle card details"><div className="k8s-inspector-card-title"><span className="k8s-inspector-card-icon">{icon}</span><span>{title}</span></div><div className="k8s-inspector-card-summary">{summary}</div><div className="k8s-inspector-card-detail" onClick={(e) => e.stopPropagation()}>{visibleValues.slice(0, expanded ? visibleValues.length : 4)}{hasMore && !expanded && <div className="k8s-card-more">+{visibleValues.length - 4} more</div>}</div></div>;
}

function ResourceInspector({ item, kind, detail, description, loading, error, searchQuery }: {
  item: KubeResourceItem;
  kind: string;
  detail: KubeDeploymentDetail | null;
  description: string;
  loading: boolean;
  error: string;
  searchQuery: string;
}) {
  const containers = detail?.containers ?? [];
  const parsedDescription = useMemo(() => {
    if (!description) return null;
    try { return JSON.parse(description) as any; } catch { return null; }
  }, [description]);
  const rawContainers = parsedDescription?.spec?.containers ?? parsedDescription?.spec?.template?.spec?.containers ?? [];
  const card = (icon: string, title: string, summary: string, children: React.ReactNode) => <InspectorCard key={title} icon={icon} title={title} summary={summary} searchQuery={searchQuery}>{children}</InspectorCard>;
  const genericCards = (() => {
    const raw = parsedDescription;
    const podSpec = raw?.spec?.template?.spec ?? raw?.spec ?? {};
    const podIngresses = Array.isArray(raw?.__deltadot?.ingresses) ? raw.__deltadot.ingresses : [];
    const envCount = rawContainers.reduce((total: number, c: any) => total + (c?.env?.length ?? 0), 0);
    const resources = rawContainers.flatMap((c: any) => [<InspectorValue key={`${c.name}-requests`} label={`${c.name} · Requests`} value={Object.entries(c?.resources?.requests ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ')} copy />, <InspectorValue key={`${c.name}-limits`} label={`${c.name} · Limits`} value={Object.entries(c?.resources?.limits ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ')} copy />]);
    const common = [
      card('ⓘ', 'Overview', `${item.cells.status ?? item.cells.type ?? 'Resource'} · ${item.cells.age ? timeAgo(item.cells.age) : 'age unavailable'}`, <><InspectorValue label="Namespace" value={item.namespace} copy /><InspectorValue label="Created" value={humanDate(raw?.metadata?.creationTimestamp)} /><div className="k8s-inspector-inline-field"><span>Status</span><InspectorStatus value={item.cells.status ?? item.cells.type ?? 'Unknown'} /></div></>),
      card('▣', 'Containers', `${rawContainers.length} configured`, rawContainers.map((c: any) => <InspectorValue key={c.name} label={c.name} value={c.image ?? ''} mono copy />)),
      card('🐳', 'Images', `${rawContainers.length} image${rawContainers.length === 1 ? '' : 's'}`, rawContainers.map((c: any) => <InspectorValue key={c.name} label={c.name} value={c.image ?? ''} mono copy />)),
      card('⌘', 'Environments', `${envCount} variables`, rawContainers.flatMap((c: any) => (c.env ?? []).map((env: any) => <InspectorValue key={`${c.name}-${env.name}`} label={`${c.name} · ${env.name}`} value={env.value ?? (env.valueFrom ? JSON.stringify(env.valueFrom) : '—')} mono copy />))),
      card('◈', 'Resources', item.cells.cpu || item.cells.memory ? 'Used vs allocated' : 'Requests and limits', <>{item.cells.cpu && <InspectorMetric label="CPU" value={item.cells.cpu} limit={allocatedResource(rawContainers, 'cpu')} available={item.cells.cpuMetricsAvailable === 'true'} free={remainingResource(usageResource(item.cells.cpu), allocatedResource(rawContainers, 'cpu') || allocatedFromUsage(item.cells.cpu))} />} {item.cells.memory && <InspectorMetric label="Memory" value={item.cells.memory} limit={allocatedResource(rawContainers, 'memory')} available={item.cells.memoryMetricsAvailable === 'true'} free={remainingResource(usageResource(item.cells.memory), allocatedResource(rawContainers, 'memory') || allocatedFromUsage(item.cells.memory))} />} {resources}</>),
      card('⌁', 'Networking', item.cells.ip ?? item.cells.clusterIp ?? item.cells.hosts ?? 'Network details', <><InspectorValue label="IP / Hosts" value={item.cells.ip ?? item.cells.clusterIp ?? item.cells.hosts ?? ''} copy /><InspectorValue label="Ports" value={item.cells.ports ?? ''} copy /></>),
      card('♡', 'Probes', 'Health checks', rawContainers.flatMap((c: any) => ['livenessProbe', 'readinessProbe', 'startupProbe'].map((key) => <InspectorValue key={`${c.name}-${key}`} label={`${c.name} · ${key.replace('Probe', '')}`} value={c[key]?.httpGet ? JSON.stringify(c[key].httpGet) : c[key] ? 'Configured' : 'Not configured'} />))),
      card('◇', 'Volumes', `${podSpec.volumes?.length ?? 0} volumes`, (podSpec.volumes ?? []).map((volume: any) => <InspectorValue key={volume.name} label={volume.name} value={Object.keys(volume).filter((key) => key !== 'name').join(', ')} />)),
      card('↗', 'Owner', item.cells.owner ?? raw?.metadata?.ownerReferences?.[0]?.kind ?? 'None', <InspectorValue label="Owner references" value={(raw?.metadata?.ownerReferences ?? []).map((owner: any) => `${owner.kind}/${owner.name}`).join(', ')} copy />),
      card('✓', 'Conditions', `${raw?.status?.conditions?.length ?? 0} conditions`, (raw?.status?.conditions ?? []).map((condition: any) => <InspectorValue key={condition.type} label={condition.type} value={`${condition.status}${condition.reason ? ` · ${condition.reason}` : ''}`} />)),
      card('⌑', 'Metadata', `${Object.keys(raw?.metadata?.labels ?? {}).length} labels`, <><InspectorValue label="Labels" value={Object.entries(raw?.metadata?.labels ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')} copy /><InspectorValue label="Annotations" value={Object.entries(raw?.metadata?.annotations ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')} copy /></>),
    ];
    if (kind === 'pods') {
      common.push(card('↗', 'Ingress', `${podIngresses.length} route${podIngresses.length === 1 ? '' : 's'}`, podIngresses.length
        ? podIngresses.map((route: any, index: number) => <InspectorValue key={`${route.ingress}-${index}`} label={`${route.host}${route.path}`} value={`${route.service}:${route.port} · ${route.address}`} copy />)
        : <InspectorValue label="Routes" value="No Ingress route found" />));
    }
    if (kind === 'services') return [common[0], card('⇄', 'Service', item.cells.type ?? 'ClusterIP', <><InspectorValue label="Cluster IP" value={item.cells.clusterIp ?? ''} copy /><InspectorValue label="External IP" value={item.cells.externalIp ?? ''} copy /><InspectorValue label="Selector" value={Object.entries(raw?.spec?.selector ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')} copy /></>), common[5], common[10]];
    if (kind === 'configmaps') return [common[0], card('▤', 'Data Keys', `${Object.keys(raw?.data ?? {}).length} keys`, Object.keys(raw?.data ?? {}).map((key) => <InspectorValue key={key} label={key} value="Configured" copy />)), card('◈', 'Binary Data', `${Object.keys(raw?.binaryData ?? {}).length} keys`, Object.keys(raw?.binaryData ?? {}).map((key) => <InspectorValue key={key} label={key} value="Configured" copy />)), common[10]];
    if (kind === 'secrets') return [common[0], card('◆', 'Secret Type', raw?.type ?? 'Opaque', <InspectorValue label="Type" value={raw?.type ?? 'Opaque'} copy />), card('▤', 'Data Keys', `${Object.keys(raw?.data ?? {}).length} keys`, Object.keys(raw?.data ?? {}).map((key) => <InspectorValue key={key} label={key} value="Value hidden" />)), common[10]];
    if (kind === 'ingresses') return [
      common[0],
      card('⌁', 'Hosts', item.cells.hosts || 'No hosts configured', <>
        <InspectorValue label="Hosts" value={item.cells.hosts ?? ''} copy />
        <InspectorValue label="Address" value={item.cells.address ?? ''} copy />
      </>),
      card('⇥', 'Rules & Paths', `${raw?.spec?.rules?.length ?? 0} rule${(raw?.spec?.rules?.length ?? 0) === 1 ? '' : 's'}`, (raw?.spec?.rules ?? []).flatMap((rule: any, i: number) => (rule.http?.paths ?? []).map((path: any, pathIndex: number) => {
        const backend = path.backend?.service?.name ?? path.backend?.resource?.name ?? 'backend unavailable';
        const port = path.backend?.service?.port?.number ?? path.backend?.service?.port?.name;
        return <InspectorValue key={`${i}-${pathIndex}`} label={rule.host ? `${rule.host}${path.path ?? '/'}` : (path.path ?? '/')} value={`${backend}${port ? `:${port}` : ''}`} copy />;
      }))),
      common[10],
    ];
    return common;
  })();
  const imageSummary = detail ? (containers.length ? `${containers.length} container${containers.length === 1 ? '' : 's'}` : 'No images configured') : 'View resource description';
  const cards = detail ? [
    <InspectorCard key="image" icon="◉" title="Image Version" summary={imageSummary} searchQuery={searchQuery}>{containers.map((c) => <InspectorValue key={c.name} label={c.name} value={c.image} mono />)}</InspectorCard>,
    <InspectorCard key="containers" icon="▣" title="Containers" summary={`${containers.length} configured`} searchQuery={searchQuery}>{containers.map((c) => <InspectorValue key={c.name} label={c.name} value={`${c.image}${c.ports.length ? ` · ports: ${c.ports.map((p) => `${p.containerPort}/${p.protocol ?? 'TCP'}`).join(', ')}` : ''}`} mono />)}</InspectorCard>,
    <InspectorCard key="environment" icon="⌘" title="Environments" summary={`${containers.reduce((total, c) => total + c.env.length, 0)} variables`} searchQuery={searchQuery}>{containers.flatMap((c) => c.env.map((env) => <InspectorValue key={`${c.name}-${env.name}`} label={`${c.name} · ${env.name}`} value={env.value ?? env.valueFrom ?? '—'} mono />))}</InspectorCard>,
    <InspectorCard key="resources" icon="◈" title="Resources" summary="Requests and limits" searchQuery={searchQuery}>{containers.flatMap((c) => [<InspectorValue key={`${c.name}-requests`} label={`${c.name} · Requests`} value={Object.entries(c.resources?.requests ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ')} />, <InspectorValue key={`${c.name}-limits`} label={`${c.name} · Limits`} value={Object.entries(c.resources?.limits ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ')} />])}</InspectorCard>,
    <InspectorCard key="probes" icon="♡" title="Probes" summary={`${containers.filter((c) => c.livenessProbe || c.readinessProbe || c.startupProbe).length} container(s) configured`} searchQuery={searchQuery}>{containers.flatMap((c) => ['livenessProbe', 'readinessProbe', 'startupProbe'].map((key) => { const probe = c[key as 'livenessProbe' | 'readinessProbe' | 'startupProbe']; return <InspectorValue key={`${c.name}-${key}`} label={`${c.name} · ${key.replace('Probe', '')}`} value={probe?.detail ?? 'Not configured'} />; }))}</InspectorCard>,
    <InspectorCard key="overview" icon="ⓘ" title="Overview" summary={`${detail.ready}/${detail.replicas} replicas ready`} searchQuery={searchQuery}><InspectorValue label="Strategy" value={detail.strategyType} /><InspectorValue label="Selector" value={Object.entries(detail.selector).map(([k, v]) => `${k}=${v}`).join(', ')} /><InspectorValue label="Created" value={humanDate(detail.createdAt)} /></InspectorCard>,
  ] : genericCards;
  return (
    <div className="k8s-inspector">
      {error ? <div className="state-message error">{error}</div> : <>
        {loading && <div className="k8s-inspector-loading">Loading extended details…</div>}
        <div className="k8s-inspector-cards" onWheel={(e) => {
          if ((e.target as HTMLElement).closest('.k8s-inspector-card.is-active')) return;
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}>{searchQuery.trim() && cards.filter(Boolean).length === 0 ? <div className="k8s-inspector-empty">No card details match “{searchQuery}”.</div> : cards}</div>
      </>}
    </div>
  );
}

function ContextTabView({ tab, searchQuery, isProd, onNamespaceChange, onKindChange, onSilentRefresh, onStatusFilterChange, onSelect, onToggleSelectionMode, onToggleResourceSelection, onSelectVisibleResources, onRequestBulkAction, onOpenWorkload, onOpenPod, onSelectContainer, onOpenContainerLogs, onClosePodDrilldown, onRowContextMenu, onViewResource }: {
  tab: KubeContextTab;
  searchQuery: string;
  isProd: boolean;
  onNamespaceChange: (tabId: string, ns: string) => void;
  onKindChange: (tabId: string, kind: string) => void;
  onSilentRefresh: (tabId: string) => void;
  onStatusFilterChange: (tabId: string, filter: string) => void;
  onSelect: (i: number) => void;
  onToggleSelectionMode: (tabId: string) => void;
  onToggleResourceSelection: (tabId: string, key: string) => void;
  onSelectVisibleResources: (tabId: string, keys: string[], checked: boolean) => void;
  onRequestBulkAction: (tabId: string, action: 'delete' | 'restart') => void;
  onOpenWorkload: (i: number) => void;
  onOpenPod: (i: number) => void;
  onSelectContainer: (i: number) => void;
  onOpenContainerLogs: (i: number) => void;
  onClosePodDrilldown: () => void;
  onRowContextMenu: (e: React.MouseEvent, index: number) => void;
  onViewResource: (index: number) => Promise<KubeDeploymentDetail | string | null>;
}) {
  const [loadingFrame, setLoadingFrame] = useState(0);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const bulkMenuRef = useRef<HTMLDivElement>(null);
  const [inspectors, setInspectors] = useState<Array<{ id: string; index: number; detail: KubeDeploymentDetail | null; description: string; loading: boolean; error: string }>>([]);
  const [activeInspectorId, setActiveInspectorId] = useState('');
  const [cardSearch, setCardSearch] = useState('');
  const kindLabel = KUBE_RESOURCE_OPTIONS.find((o) => o.id === tab.kind)?.label ?? tab.kind;

  // An inspector belongs to the resource list it was opened from. Do not
  // carry a Pod/Deployment inspector into another kind or namespace, or the
  // next resource view can show stale cards and stale JSON-backed fields.
  useEffect(() => {
    setInspectors([]);
    setActiveInspectorId('');
    setCardSearch('');
  }, [tab.id, tab.kind, tab.namespace]);
  useEffect(() => {
    setCardSearch('');
  }, [activeInspectorId]);
  const isNamespaced = tab.kind !== 'nodes';
  const canOpenWorkload = tab.kind === 'deployments';
  const canOpenPod = tab.kind === 'pods';
  const showPodFilter = tab.kind === 'pods';
  const filters = tab.podFilters ?? ['ReplicaSet'];
  const ageFilter = tab.podAgeFilter ?? 'all';
  const statusFilter = tab.podStatusFilter ?? 'all';
  const matchesStatus = (item: KubeResourceItem) => {
    if (statusFilter === 'all') return true;
    const summary = summarizeKubePods([item]);
    return statusFilter === 'running' ? summary.running > 0
      : statusFilter === 'succeeded' ? summary.succeeded > 0
        : statusFilter === 'error' ? summary.error > 0
          : statusFilter === 'terminating' ? summary.terminating > 0 : summary.notReady > 0;
  };
  const visiblePods = (item: KubeResourceItem) => filters.includes(item.cells.owner ?? 'None') && podMatchesAgeFilter(item, ageFilter);
  const visiblePodStatus = tab.kind === 'pods'
    ? summarizeKubePods(tab.resources.items.filter(visiblePods))
    : tab.podStatus;
  // Owner-kind filter chips are built from the kinds actually present (Job,
  // ReplicaSet, DaemonSet, StatefulSet, 'None', …) — no name-based logic.
  const ownerKinds = [...new Set(tab.resources.items.map((i) => i.cells.owner ?? 'None'))].sort();
  const query = searchQuery.trim().toLowerCase();
  const items = tab.resources.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !showPodFilter || (visiblePods(item) && matchesStatus(item)))
    .filter(({ item }) => !query || [item.name, ...Object.values(item.cells)].some((value) => value.toLowerCase().includes(query)));
  const canBulkSelect = tab.kind === 'pods' || tab.kind === 'deployments';
  const selectionMode = canBulkSelect && Boolean(tab.selectionMode);
  const selectedResourceKeys = tab.selectedResourceKeys ?? [];
  const selectedKeySet = new Set(selectedResourceKeys);
  const visibleKeys = items.map(({ item }) => item.key);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeySet.has(key));
  useEffect(() => {
    if (!selectionMode || selectedResourceKeys.length === 0) setBulkMenuOpen(false);
  }, [selectionMode, selectedResourceKeys.length]);
  useEffect(() => {
    if (!bulkMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!bulkMenuRef.current?.contains(event.target as Node)) setBulkMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [bulkMenuOpen]);
  const viewResource = async (index: number) => {
    const item = tab.resources.items[index];
    if (!item) return;
    const id = item.key;
    const existing = inspectors.find((entry) => entry.id === id);
    if (existing) { setActiveInspectorId(id); return; }
    setInspectors((previous) => [...previous, { id, index, detail: null, description: '', loading: true, error: '' }]);
    setActiveInspectorId(id);
    try {
      const result = await onViewResource(index);
      setInspectors((previous) => previous.map((entry) => entry.id === id ? (typeof result === 'string' ? { ...entry, description: result, loading: false } : { ...entry, detail: result, loading: false }) : entry));
    } catch (err) {
      setInspectors((previous) => previous.map((entry) => entry.id === id ? { ...entry, loading: false, error: err instanceof Error ? err.message : String(err) } : entry));
    }
  };
  const activeInspector = inspectors.find((entry) => entry.id === activeInspectorId);
  const inspectorEntries: K8sInspectorEntry[] = inspectors.flatMap((entry) => {
    const resource = tab.resources.items[entry.index];
    return resource ? [{ id: entry.id, name: resource.name }] : [];
  });
  const closeInspector = (id: string) => {
    setInspectors((previous) => previous.filter((entry) => entry.id !== id));
    if (id === activeInspectorId) {
      const next = inspectors.find((entry) => entry.id !== id);
      setActiveInspectorId(next?.id ?? '');
    }
  };
  // Watch mode: poll the current resource table every watchInterval seconds —
  // silently (no loading state, no page flicker).
  const intervalMs = Math.max(1, tab.watchInterval ?? 2) * 1000;
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
      <div style={{ display: 'flex', minHeight: 50, maxHeight: 112, borderBottom: '1px solid var(--border)', flexShrink: 0, overflow: 'visible' }}>
        {isNamespaced && (
          <div style={{ width: 180, flexShrink: 0, padding: '7px 8px 7px 16px', borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
            <select
              value={tab.namespace}
              onChange={(e) => onNamespaceChange(tab.id, e.target.value)}
              className="k8s-namespace-select"
              style={{ ...SELECT_STYLE, width: '100%', maxWidth: 'none' }}
              title="Namespace"
            >
              <option value="*">All namespaces</option>
              {tab.namespaces.map((namespace) => <option key={namespace} value={namespace}>{namespace}</option>)}
            </select>
          </div>
        )}
        {tab.kind === 'pods' && <PodStatusSummary summary={visiblePodStatus} loading={tab.loading || tab.refreshing} filter={statusFilter} onFilterChange={(filter) => onStatusFilterChange(tab.id, filter)} />}
        <div style={{ flex: 1, minWidth: 0, padding: '7px 16px', overflow: 'visible', position: 'relative', zIndex: 5 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 5, minHeight: 36 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignContent: 'center', gap: 4 }}>
            {KUBE_RESOURCE_OPTIONS.map((option) => {
              const active = tab.kind === option.id;
              return (
                <button
                  key={option.id}
                  className={`k8s-resource-tab${active ? ' is-active' : ''}`}
                  onClick={() => onKindChange(tab.id, option.id)}
                  style={{
                    padding: '5px 10px', borderRadius: 5, border: `1px solid ${active ? 'var(--border-blue)' : 'var(--border)'}`,
                    background: active ? 'var(--tint-blue)' : 'var(--bg-tertiary)',
                    color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    cursor: 'pointer', font: `${active ? 600 : 400} 11px var(--font-sans)`,
                  }}
                  title={`Show ${option.label}`}
                >
                  {option.label}
                </button>
              );
            })}
            {canBulkSelect && selectionMode && selectedResourceKeys.length > 0 && <>
              <span className="k8s-bulk-menu-separator" aria-hidden="true" />
              <div className="k8s-bulk-menu-wrap" ref={bulkMenuRef}>
              <button type="button" className={`k8s-bulk-menu-trigger${bulkMenuOpen ? ' is-open' : ''}`} aria-label="More resource actions" title="More resource actions" aria-haspopup="menu" aria-expanded={bulkMenuOpen} onClick={() => setBulkMenuOpen((open) => !open)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
              </button>
              {bulkMenuOpen && <div className="k8s-bulk-menu" role="menu" aria-label="Selected resource actions">
                <div className="k8s-bulk-menu-caption">{selectionMode ? `${selectedResourceKeys.length} selected` : 'Press Shift+B to select resources'}</div>
                <button type="button" role="menuitem" disabled={tab.kind !== 'deployments' || isProd} title={isProd ? 'Bulk actions are disabled for prod contexts.' : tab.kind !== 'deployments' ? 'Restart is available for deployment selections only.' : undefined} onClick={() => { setBulkMenuOpen(false); onRequestBulkAction(tab.id, 'restart'); }}>Restart</button>
                <button type="button" role="menuitem" disabled={isProd} title={isProd ? 'Bulk actions are disabled for prod contexts.' : undefined} onClick={() => { setBulkMenuOpen(false); onRequestBulkAction(tab.id, 'delete'); }}>Delete</button>
                {isProd && <div className="k8s-bulk-menu-note">Bulk actions are disabled for prod.</div>}
                <div className="k8s-bulk-menu-divider" role="separator" />
                <button type="button" role="menuitem" onClick={() => { setBulkMenuOpen(false); onToggleSelectionMode(tab.id); }}>Exit selection</button>
              </div>}
              </div>
            </>}
          </div>
        </div>
        </div>
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
        <div className="k8s-resource-table-wrap" aria-busy={tab.loading || tab.refreshing ? 'true' : 'false'}>
        <div className="table-container">
          <div className="table-header">
            {selectionMode && <div className="cell k8s-resource-select-cell"><input type="checkbox" aria-label="Select all visible resources" checked={allVisibleSelected} onChange={(event) => onSelectVisibleResources(tab.id, visibleKeys, event.target.checked)} /></div>}
            <div className="cell" style={{ width: 36, flexShrink: 0 }}>#</div>
            {tab.resources.columns.map((c) => (
              <div className="cell" key={c.key} style={colStyle(c)}>{c.label}</div>
            ))}
            <div className="cell" style={{ width: 42, flexShrink: 0 }} />
          </div>
          {items.map(({ item, index }, i) => {
            const selected = index === tab.selected;
            const multiSelected = selectedKeySet.has(item.key);
            return (
              <div
                key={item.key}
                className={`table-row ${selected ? 'selected' : ''}${multiSelected ? ' is-multi-selected' : ''}`}
                style={tab.kind === 'pods' ? podRowStyle(item.cells.status ?? '', item.cells.owner ?? '', selected) : undefined}
                onClick={() => onSelect(index)}
                onContextMenu={(e) => { e.preventDefault(); onSelect(index); onRowContextMenu(e, index); }}
                onDoubleClick={() => { if (selectionMode) return; if (canOpenWorkload) onOpenWorkload(index); else if (canOpenPod) onOpenPod(index); }}
                title={canOpenWorkload ? 'Open workload in a new tab' : undefined}
              >
                {selectionMode && <div className="cell k8s-resource-select-cell"><input type="checkbox" aria-label={`Select ${item.name}`} checked={multiSelected} onClick={(event) => event.stopPropagation()} onChange={() => onToggleResourceSelection(tab.id, item.key)} /></div>}
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
                    {tab.kind === 'pods' && (c.key === 'cpu' || c.key === 'memory')
                      ? <PodResourceCell value={item.cells[c.key] ?? ''} metricsAvailable={item.cells[`${c.key}MetricsAvailable`] === 'true'} />
                      : <ResourceCell column={c} value={item.cells[c.key] ?? ''} warning={c.key === 'cpu' ? item.cells.highCpu === 'true' : c.key === 'memory' ? item.cells.highMemory === 'true' : false} />}
                  </div>
                ))}
                <div className="cell" style={{ width: 42, flexShrink: 0, justifyContent: 'center' }}>
                  <button type="button" className="k8s-row-view-button" onClick={(e) => { e.stopPropagation(); void viewResource(index); }} title={`View ${item.name} details`} aria-label={`View ${item.name} details`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}
      {activeInspector && tab.resources.items[activeInspector.index] && <K8sResourceInspector
        entries={inspectorEntries}
        activeId={activeInspectorId}
        searchQuery={cardSearch}
        onActivate={setActiveInspectorId}
        onSearchChange={setCardSearch}
        onClose={closeInspector}
      >
        <K8sInspectorErrorBoundary>
          <ResourceInspector
          key={activeInspector.id}
          item={tab.resources.items[activeInspector.index]}
          kind={tab.kind}
          detail={activeInspector.detail}
          description={activeInspector.description}
          loading={activeInspector.loading}
          error={activeInspector.error}
          searchQuery={cardSearch}
          />
        </K8sInspectorErrorBoundary>
      </K8sResourceInspector>}
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

function LegacyPodLogsView({ tab, onClose, onToggleWatch, onWatchInterval, onRefresh, onDownload, onToggleWrap }: {
  tab: KubeWorkloadTab;
  onClose: () => void;
  onToggleWatch: (enabled: boolean) => void;
  onWatchInterval: (seconds: number) => void;
  onRefresh: () => void;
  onDownload: (mode: 'visible' | 'screen' | 'entire', logContent: string) => void;
  onToggleWrap: (enabled: boolean) => void;
}) {
  const intervalMs = Math.max(1, tab.watchInterval ?? 2) * 1000;
  const logRef = React.useRef<HTMLPreElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const query = searchQuery.trim().toLowerCase();
  const visibleLogs = useMemo(() => {
    if (!query) return tab.logs ?? '';
    return (tab.logs ?? '').split('\n').filter((line) => line.toLowerCase().includes(query)).join('\n');
  }, [tab.logs, query]);
  const getScreenLogs = () => {
    const element = logRef.current;
    if (!element) return visibleLogs;
    const styles = window.getComputedStyle(element);
    const lineHeight = parseFloat(styles.lineHeight) || 18.6;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    const firstLine = Math.max(0, Math.floor(Math.max(0, element.scrollTop - paddingTop) / lineHeight));
    const lineCount = Math.max(1, Math.ceil(element.clientHeight / lineHeight));
    return visibleLogs.split('\n').slice(firstLine, firstLine + lineCount).join('\n');
  };

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
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 180, maxWidth: 280, marginLeft: 4 }}>
          <span aria-hidden="true" style={{ color: 'var(--text-dim)' }}>⌕</span>
          <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search logs…" aria-label="Search pod logs" style={{ width: '100%', padding: '4px 7px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 11 }} />
          {query && <span style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{visibleLogs ? `${visibleLogs.split('\n').length} lines` : '0 lines'}</span>}
        </label>
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
              value={tab.watchInterval ?? 2}
              onChange={(e) => onWatchInterval(parseInt(e.target.value, 10) || 1)}
              style={{ width: 52, padding: '3px 6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 11, textAlign: 'center' }}
              title="Log refresh interval in seconds"
            />
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>sec</span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setDownloadMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={downloadMenuOpen}
            title="Download pod logs"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', background: downloadMenuOpen ? 'var(--tint-blue)' : 'var(--bg-tertiary)', border: `1px solid ${downloadMenuOpen ? 'var(--border-blue)' : 'var(--border)'}`, borderRadius: 5, color: downloadMenuOpen ? 'var(--accent-blue)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 500 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
            </svg>
            Download <span aria-hidden="true" style={{ fontSize: 10 }}>{downloadMenuOpen ? '▴' : '▾'}</span>
          </button>
          {downloadMenuOpen && (
            <div className="repo-context-menu k8s-download-menu" role="menu" aria-label="Download pod logs" style={{ position: 'absolute', right: 0, top: 'calc(100% + 5px)', minWidth: 210, zIndex: 100 }}>
              <button type="button" role="menuitem" onClick={() => { setDownloadMenuOpen(false); onDownload('visible', visibleLogs); }}>
                <span aria-hidden="true">◉</span><span>Visible log</span><kbd>loaded</kbd>
              </button>
              <button type="button" role="menuitem" onClick={() => { setDownloadMenuOpen(false); onDownload('screen', getScreenLogs()); }}>
                <span aria-hidden="true">▣</span><span>Screen log</span><kbd>viewport</kbd>
              </button>
              <button type="button" role="menuitem" onClick={() => { setDownloadMenuOpen(false); onDownload('entire', visibleLogs); }}>
                <span aria-hidden="true">◎</span><span>Entire log from pod</span><kbd>all</kbd>
              </button>
            </div>
          )}
        </div>
        <button className="back-btn" onClick={onClose} title="Close tab">✕</button>
      </div>
      {tab.loading ? <div className="state-message">Loading pod logs...</div> : !tab.logs && tab.error ? <div className="state-message error">{tab.error}</div> : (
        <>
          {tab.error && <div className="k8s-inline-warning">{tab.error}</div>}
          <pre ref={logRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', margin: 0, padding: 16, color: 'var(--text-primary)', background: 'var(--bg-primary)', font: '12px/1.55 var(--font-mono)', whiteSpace: tab.wrap ? 'pre-wrap' : 'pre', wordBreak: tab.wrap ? 'break-word' : 'normal', userSelect: 'text' }}>
            {query ? (visibleLogs || 'No matching logs.') : (tab.logs || 'No logs available.')}
          </pre>
        </>
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
                {pods.columns.map((c) => <div className="cell" key={c.key} style={{ ...colStyle(c), ...(c.key === 'status' ? { color: podStatusColor(item.cells.status ?? '') } : {}) }}>{c.key === 'cpu' || c.key === 'memory' ? <PodResourceCell value={item.cells[c.key] ?? ''} metricsAvailable={item.cells[`${c.key}MetricsAvailable`] === 'true'} /> : <ResourceCell column={c} value={item.cells[c.key] ?? ''} warning={c.key === 'cpu' ? item.cells.highCpu === 'true' : c.key === 'memory' ? item.cells.highMemory === 'true' : false} />}</div>)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WorkloadDetail({ tab, onClose, onSelectPod, onOpenPodLogs, onSelectContainer, onOpenContainerLogs, onToggleLogWatch, onLogWatchInterval, onRefreshLogs, onDownloadLogs, onClearLogs, onToggleLogWrap }: {
  tab: KubeWorkloadTab; onClose: () => void; onSelectPod: (i: number) => void; onOpenPodLogs: (i: number) => void;
  onSelectContainer: (i: number) => void; onOpenContainerLogs: (i: number) => void;
  onToggleLogWatch: (enabled: boolean) => void; onRefreshLogs: () => void;
  onDownloadLogs: (mode: 'visible' | 'entire', logContent: string) => void;
  onClearLogs: () => void;
  onToggleLogWrap: (enabled: boolean) => void;
}) {
  if (tab.mode === 'pod-logs') return <PodLogsView tab={tab} onClose={onClose} onToggleWatch={onToggleLogWatch} onRefresh={onRefreshLogs} onDownload={onDownloadLogs} onClearLogs={onClearLogs} onToggleWrap={onToggleLogWrap} />;
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
              <DetailRow label="Created" value={humanDate(d.createdAt)} />
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

export function KubeBulkConfirmDialog({ action, context, kindLabel, targets, onConfirm, onCancel }: {
  action: 'delete' | 'restart';
  context: string;
  kindLabel: string;
  targets: Array<{ name: string; namespace: string }>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);
  const verb = action === 'delete' ? 'Delete' : 'Restart';
  return <div className="command-overlay" style={{ alignItems: 'center', paddingTop: 0 }} onClick={onCancel}>
    <div className="k8s-bulk-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="k8s-bulk-confirm-title" onClick={(event) => event.stopPropagation()}>
      <h2 id="k8s-bulk-confirm-title">{verb} {targets.length} {kindLabel.toLowerCase()}?</h2>
      <p>Context: <strong>{context}</strong>. Review the resources before continuing.</p>
      <div className="k8s-bulk-confirm-list">{targets.map((target) => <div key={`${target.namespace}/${target.name}`}><span>{target.namespace}/</span><strong>{target.name}</strong></div>)}</div>
      <p className="k8s-bulk-confirm-note">Each resource is handled separately. If some requests fail, the successful operations will remain completed.</p>
      <div className="k8s-bulk-confirm-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" className={action === 'delete' ? 'is-danger' : 'is-primary'} onClick={onConfirm}>{verb} {targets.length}</button>
      </div>
    </div>
  </div>;
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

export function KubeProdConfirmDrawer({ context, namespace, name, kindLabel, actionLabel, warning, onConfirm, onCancel }: {
  context: string;
  namespace: string;
  name: string;
  kindLabel: string;
  actionLabel: 'Delete' | 'Restart';
  warning: string;
  onConfirm: (typedName: string) => void;
  onCancel: () => void;
}) {
  const [typedName, setTypedName] = useState('');
  const matches = typedName === name;
  return (
    <div className="k8s-prod-confirm-backdrop" onClick={onCancel}>
      <aside className="k8s-prod-confirm-drawer" role="dialog" aria-modal="true" aria-labelledby="k8s-prod-confirm-title" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
      }}>
        <header className="k8s-prod-confirm-heading">
          <span className="k8s-prod-confirm-icon" aria-hidden="true">!</span>
          <div><span className="k8s-prod-confirm-kicker">Production safeguard</span><h2 id="k8s-prod-confirm-title">{actionLabel} in production?</h2></div>
          <button type="button" className="k8s-prod-confirm-close" aria-label="Close confirmation" onClick={onCancel}>×</button>
        </header>
        <div className="k8s-prod-confirm-body">
          <p className="k8s-prod-confirm-warning">{warning}</p>
          <dl className="k8s-prod-confirm-details">
            <div><dt>Context</dt><dd>{context}</dd></div>
            <div><dt>Environment</dt><dd><span className="k8s-prod-badge">PROD</span></dd></div>
            <div><dt>Action</dt><dd>{actionLabel} {kindLabel.toLowerCase()}</dd></div>
            <div><dt>Namespace</dt><dd>{namespace || '—'}</dd></div>
            <div><dt>Resource</dt><dd>{name}</dd></div>
          </dl>
          <label className="k8s-prod-confirm-input-label" htmlFor="k8s-prod-confirm-name">Type the exact resource name to continue</label>
          <input id="k8s-prod-confirm-name" autoFocus autoComplete="off" spellCheck={false} value={typedName} onChange={(event) => setTypedName(event.target.value)} placeholder={name} />
          {typedName && !matches && <small className="k8s-prod-confirm-mismatch">Name does not match.</small>}
        </div>
        <footer className="k8s-prod-confirm-actions">
          <button type="button" className="k8s-prod-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="k8s-prod-continue" disabled={!matches} onClick={() => onConfirm(typedName)}>{actionLabel} resource</button>
        </footer>
      </aside>
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
  contexts, enabledContexts, contextSettings, contextTabs, activeTab, workloadTabs, compareTab, error, searchQuery, onSearchQueryChange,
  onOpenContextTab, onRefreshContexts, onSaveContextSetting, onTabNamespaceChange, onTabKindChange, onTabPodFilterToggle,
  onTabPodAgeFilterChange, onTabPodStatusFilterChange,
  onTabWatchToggle, onTabWatchInterval, onRefreshTab, onSilentRefreshTab, onDescribeResource, onDeleteResource, onCopyResource, onViewResource, onRestartDeployment,
  onSelect, onToggleSelectionMode, onToggleResourceSelection, onSelectVisibleResources, onRequestBulkAction, onOpenWorkload, onOpenPod, onSelectContextContainer, onOpenContextContainerLogs, onClosePodDrilldown, onToggleLogWatch, onRefreshLogs, onDownloadLogs, onClearLogs, onToggleLogWrap, onSelectWorkloadPod, onOpenPodLogs, onSelectWorkloadContainer, onOpenContainerLogs, onCompareContext, onAddCompareContext, onRemoveCompareSide,
  onActivateTab, onCloseTab, onRenameTab, onBack,
}: K8sViewProps) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; ctx: string } | null>(null);
  const [resourceMenu, setResourceMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuBusy, setContextMenuBusy] = useState(false);
  const [contextMenuError, setContextMenuError] = useState('');
  const [colorPickerContext, setColorPickerContext] = useState<string | null>(null);
  const closeMenu = () => setCtxMenu(null);
  const closeResourceMenu = () => setResourceMenu(null);

  const selectedContextTab = contextTabs.find((t) => t.id === activeTab);
  const activeContextTab = selectedContextTab ?? contextTabs[0];
  const activeContextIsProd = activeContextTab ? contextSettings[activeContextTab.context]?.environment === 'prod' : false;
  const activeWorkloadTab = activeTab !== 'compare' && activeTab !== ''
    ? workloadTabs.find((t) => t.id === activeTab) ?? null
    : null;

  // Right-click menu: open context tabs first (tab labels), then the rest.
  const menuCtx = ctxMenu?.ctx ?? activeContextTab?.context ?? '';
  const enabledNames = new Set(enabledContexts.map((context) => context.name));
  const openOthers = contextTabs.filter((t) => t.context !== menuCtx && enabledNames.has(t.context));
  const openSet = new Set(openOthers.map((t) => t.context));
  const menuItems = [
    ...openOthers.map((t) => ({ name: t.context, label: t.label ?? t.context, open: true })),
    ...enabledContexts.filter((c) => c.name !== menuCtx && !openSet.has(c.name)).map((c) => ({ name: c.name, label: c.name, open: false })),
  ];

  const showCompareMenuFor = (e: React.MouseEvent, ctx: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, ctx });
  };

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Title bar — open a context in its own tab; namespace lives inside the tab */}
      <div className="k8s-view-header" style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Kubernetes</span>
        <select
          value={menuCtx}
          onChange={(e) => { if (e.target.value) onOpenContextTab(e.target.value); }}
          onContextMenu={(e) => showCompareMenuFor(e, menuCtx)}
          style={{ ...SELECT_STYLE, maxWidth: 260 }}
          title="Context (select to open in a tab; right-click to compare)"
        >
          <option value="">— open context —</option>
          {enabledContexts.map((c) => <option key={c.name} value={c.name}>{contextSettings[c.name]?.displayName || c.name}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>right-click tab to compare</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="k8s-context-menu-button" aria-label="Open Kubernetes contexts" title="Manage Kubernetes contexts" aria-expanded={contextMenuOpen} onClick={() => { setContextMenuOpen((open) => !open); setContextMenuError(''); }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <button className="back-btn" onClick={onBack} title="Back to repos">←</button>
        {contextMenuOpen && <>
          <button className="k8s-context-menu-dismiss" aria-label="Close contexts menu" onClick={() => setContextMenuOpen(false)} />
          <section className="k8s-context-menu" aria-label="Kubernetes contexts" role="dialog" aria-modal="true">
            <div className="k8s-context-menu-heading"><div><strong>Contexts</strong><small>Enable or disable context use in DeltaDot. Kubeconfig is unchanged.</small></div><button type="button" disabled={contextMenuBusy} onClick={async () => { setContextMenuBusy(true); setContextMenuError(''); try { await onRefreshContexts(); } catch (err) { setContextMenuError(err instanceof Error ? err.message : String(err)); } finally { setContextMenuBusy(false); } }}>{contextMenuBusy ? 'Refreshing…' : '↻ Refresh'}</button><button type="button" className="k8s-context-menu-close" aria-label="Close contexts drawer" onClick={() => setContextMenuOpen(false)}>×</button></div>
            {contextMenuError && <div className="k8s-context-menu-error">{contextMenuError}</div>}
            {contexts.length === 0 ? <div className="k8s-context-menu-empty">No contexts found in kubeconfig.</div> : <div className="k8s-context-menu-list">{contexts.map((context) => {
              const setting = contextSettings[context.name] ?? { environment: 'non-prod' as const, enabled: true };
              const isEnabled = setting.enabled !== false;
              const displayName = setting.displayName || context.name;
              const update = (next: KubeContextSetting) => { void onSaveContextSetting(context.name, next).catch((err) => setContextMenuError(err instanceof Error ? err.message : String(err))); };
              return <div className={`k8s-context-menu-row${setting.color ? ` is-color-${setting.color}` : ''}`} key={context.name}>
                <div className="k8s-context-menu-main">
                  <button type="button" className={`k8s-context-menu-open${isEnabled ? '' : ' is-disabled'}`} title={context.name} disabled={!isEnabled} onClick={() => { onOpenContextTab(context.name); setContextMenuOpen(false); }}>
                    <strong>{displayName}</strong><small>{context.current ? 'Current kubeconfig context' : context.name}{isEnabled ? '' : ' · Disabled in DeltaDot'}</small>
                  </button>
                  <div className="k8s-context-menu-controls">
                    <select aria-label={`${displayName} environment`} value={setting.environment} onChange={(event) => update({ ...setting, environment: event.target.value as KubeContextSetting['environment'] })}>
                      <option value="prod">Prod</option><option value="non-prod">Non-prod</option>
                    </select>
                    <button type="button" className={`k8s-context-color-button${setting.color ? ` has-color-${setting.color}` : ''}`} title="Choose row color" aria-label={`Choose row color for ${context.name}`} aria-expanded={colorPickerContext === context.name} onClick={() => setColorPickerContext((current) => current === context.name ? null : context.name)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6H18a3 3 0 0 0 3-3c0-5-4-9-9-9Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/></svg>
                      <span className={`k8s-context-color-indicator${setting.color ? ` is-${setting.color}` : ''}`} />
                    </button>
                    <button type="button" className="k8s-context-rename-button" title="Set optional display name" aria-label={`Rename ${context.name}`} onClick={(event) => {
                      const input = event.currentTarget.closest('.k8s-context-menu-row')?.querySelector<HTMLInputElement>('.k8s-context-rename-input');
                      if (input) { input.hidden = false; input.focus(); input.select(); }
                    }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button>
                    <button type="button" className={`k8s-context-toggle${isEnabled ? ' is-enabled' : ''}`} role="switch" aria-checked={isEnabled} aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${context.name} in DeltaDot`} title={`${isEnabled ? 'Disable' : 'Enable'} for DeltaDot only`} onClick={() => update({ ...setting, enabled: !isEnabled })}><span /></button>
                  </div>
                </div>
                {colorPickerContext === context.name && <div className="k8s-context-color-options" role="radiogroup" aria-label={`Row color for ${displayName}`}>
                  <button type="button" className={`k8s-context-color-swatch is-none${setting.color ? '' : ' is-selected'}`} role="radio" aria-checked={!setting.color} aria-label="No row color" title="None" onClick={() => { update({ ...setting, color: undefined }); setColorPickerContext(null); }}><span>None</span></button>
                  {(['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const).map((color) => <button key={color} type="button" className={`k8s-context-color-swatch is-${color}${setting.color === color ? ' is-selected' : ''}`} role="radio" aria-checked={setting.color === color} aria-label={`${color[0]!.toUpperCase()}${color.slice(1)} row color`} title={color[0]!.toUpperCase() + color.slice(1)} onClick={() => { update({ ...setting, color }); setColorPickerContext(null); }} />)}
                </div>}
                <input className="k8s-context-rename-input" hidden aria-label={`Display name for ${context.name}`} defaultValue={setting.displayName ?? ''} placeholder={context.name} onKeyDown={(event) => { if (event.key === 'Enter') { update({ ...setting, displayName: event.currentTarget.value }); event.currentTarget.hidden = true; } else if (event.key === 'Escape') event.currentTarget.hidden = true; }} onBlur={(event) => { if (!event.currentTarget.hidden) { update({ ...setting, displayName: event.currentTarget.value }); event.currentTarget.hidden = true; } }} />
              </div>;
            })}</div>}
          </section>
        </>}
      </div>


      <TabBar
        activeTab={activeTab}
        contextTabs={contextTabs}
        workloadTabs={workloadTabs}
        compareTab={compareTab}
        contextSettings={contextSettings}
        activeContextTab={selectedContextTab}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        onPodFilterToggle={onTabPodFilterToggle}
        onPodAgeFilterChange={onTabPodAgeFilterChange}
        onWatchToggle={onTabWatchToggle}
        onWatchInterval={onTabWatchInterval}
        onRefresh={onRefreshTab}
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

      {resourceMenu && activeContextTab && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={closeResourceMenu} onContextMenu={(e) => { e.preventDefault(); closeResourceMenu(); }} />
          <div className="repo-context-menu" style={{ left: resourceMenu.x, top: resourceMenu.y, zIndex: 100 }}>
            <div className="repo-context-heading" style={{ borderBottom: '1px solid var(--border)' }}>
              {activeContextTab.kind.replace(/s$/, '')} actions
            </div>
            {activeContextTab.kind === 'deployments' && <>
              <ResourceMenuItem icon="open" label="Open deployment details" onClick={() => { closeResourceMenu(); onOpenWorkload(resourceMenu.index); }} />
              <ResourceMenuItem icon="restart" label="Restart deployment" onClick={() => { closeResourceMenu(); onRestartDeployment(resourceMenu.index, false); }} />
              <ResourceMenuItem icon="restart-all" label={activeContextIsProd ? 'Restart all deployments · disabled for prod' : 'Restart all deployments'} disabled={activeContextIsProd} title={activeContextIsProd ? 'Bulk restart is unavailable for production contexts.' : undefined} onClick={() => { closeResourceMenu(); onRestartDeployment(resourceMenu.index, true); }} />
            </>}
            {activeContextTab.kind === 'pods' && <ResourceMenuItem icon="logs" label="Open pod containers" onClick={() => { closeResourceMenu(); onOpenPod(resourceMenu.index); }} />}
            <ResourceMenuItem icon="describe" label="Describe JSON" onClick={() => { closeResourceMenu(); onDescribeResource(resourceMenu.index); }} />
            <ResourceMenuItem icon="copy" label="Copy resource name" onClick={() => { closeResourceMenu(); onCopyResource(resourceMenu.index, false); }} />
            <ResourceMenuItem icon="copy" label="Copy namespace/name" onClick={() => { closeResourceMenu(); onCopyResource(resourceMenu.index, true); }} />
            <ResourceMenuItem icon="delete" label={`Delete ${activeContextTab.kind.replace(/s$/, '')}`} danger onClick={() => { closeResourceMenu(); onDeleteResource(resourceMenu.index); }} />
            <div className="repo-context-separator" />
            <ResourceMenuItem icon="refresh" label="Refresh" onClick={() => { closeResourceMenu(); onRefreshTab(activeContextTab.id); }} />
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
          contexts={enabledContexts}
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
          onRefreshLogs={onRefreshLogs}
          onDownloadLogs={onDownloadLogs}
          onClearLogs={onClearLogs}
          onToggleLogWrap={onToggleLogWrap}
        />
      ) : activeContextTab ? (
        <ContextTabView
          key={`${activeContextTab.id}:${activeContextTab.kind}:${activeContextTab.namespace}`}
          tab={activeContextTab}
          searchQuery={searchQuery}
          isProd={contextSettings[activeContextTab.context]?.environment === 'prod'}
          onNamespaceChange={onTabNamespaceChange}
          onKindChange={onTabKindChange}
          onSilentRefresh={onSilentRefreshTab}
          onStatusFilterChange={onTabPodStatusFilterChange}
          onViewResource={onViewResource}
          onRowContextMenu={(e, index) => setResourceMenu({ x: e.clientX, y: e.clientY, index })}
          onSelect={onSelect}
          onToggleSelectionMode={onToggleSelectionMode}
          onToggleResourceSelection={onToggleResourceSelection}
          onSelectVisibleResources={onSelectVisibleResources}
          onRequestBulkAction={onRequestBulkAction}
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
