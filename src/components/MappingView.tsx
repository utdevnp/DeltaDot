import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DeploymentMapping, DeploymentMappingTab, KubeContext, KubeDeploymentSummary, RepoState } from '../../core/types.js';
import { timeAgo } from '../../core/utils.js';

type DeploymentOption = KubeDeploymentSummary & { context: string };
type SelectOption = { value: string; label: string };
type MappingMenu = { x: number; y: number; id: string };

function SearchableSelect({ label, value, options, placeholder, onChange }: { label: string; value: string; options: SelectOption[]; placeholder: string; onChange: (value: string) => void }) {
  const listId = useId();
  const selectedLabel = options.find((option) => option.value === value)?.label ?? '';
  const [query, setQuery] = useState(selectedLabel);
  useEffect(() => { setQuery(selectedLabel); }, [selectedLabel]);
  return <>
    <input aria-label={label} list={listId} value={query} placeholder={placeholder}
      onChange={(event) => {
        const next = event.target.value;
        setQuery(next);
        const match = options.find((option) => option.label.toLowerCase() === next.trim().toLowerCase());
        if (match) onChange(match.value);
      }}
      onBlur={() => {
        const match = options.find((option) => option.label.toLowerCase() === query.trim().toLowerCase());
        if (!match) setQuery(selectedLabel);
      }}
    />
    <datalist id={listId}>{options.map((option) => <option key={option.value} value={option.label} />)}</datalist>
  </>;
}

interface Props {
  repos: RepoState[];
  mappingTabs: DeploymentMappingTab[];
  legacyMappings: DeploymentMapping[];
  preferredContext?: string;
  preferredTabId?: string;
  editing: boolean;
  syncing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onRefresh: () => void;
  onPersist: (tabs: DeploymentMappingTab[], activeTabId: string) => void;
}

function buildLegacyTab(mappings: DeploymentMapping[], context?: string): DeploymentMappingTab {
  const migrated = mappings.map((mapping) => ({ ...mapping, namespace: 'default' }));
  return {
    id: 'mapping-default',
    name: 'Mapping 1',
    context: context || migrated[0]?.context || '',
    mappings: migrated,
  };
}

function tagOf(image: string): string {
  const withoutDigest = image.split('@')[0] ?? '';
  const tail = withoutDigest.split('/').at(-1) ?? '';
  const colon = tail.lastIndexOf(':');
  return colon < 0 ? '' : tail.slice(colon + 1);
}

function normalizedVersion(value: string): string {
  return value.trim().replace(/^v/i, '').toLowerCase();
}

function initialRepo(deployment: KubeDeploymentSummary, repos: RepoState[]): string {
  const tail = deployment.image.split('@')[0]?.split('/').at(-1)?.replace(/:[^:]*$/, '') ?? '';
  return repos.find((repo) => repo.name.toLowerCase() === deployment.name.toLowerCase())?.path
    ?? repos.find((repo) => repo.name.toLowerCase() === tail.toLowerCase())?.path ?? '';
}

function deploymentAge(deployment?: DeploymentOption): string {
  const timestamp = deployment?.lastUpdated || deployment?.createdAt;
  return timestamp ? timeAgo(timestamp).replace(/^(\d+)(mo|[smhdwy])$/, '$1 $2') : '';
}

export function MappingView({ repos, mappingTabs, legacyMappings, preferredContext, preferredTabId, editing, syncing, onEdit, onCancel, onRefresh, onPersist }: Props) {
  const [contexts, setContexts] = useState<KubeContext[]>([]);
  const [tabs, setTabs] = useState<DeploymentMappingTab[]>(() => mappingTabs.length ? mappingTabs : [buildLegacyTab(legacyMappings, preferredContext)]);
  const [activeTabId, setActiveTabId] = useState(() => mappingTabs.find((tab) => tab.id === preferredTabId)?.id ?? mappingTabs[0]?.id ?? 'mapping-default');
  const [deployments, setDeployments] = useState<DeploymentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<DeploymentMapping[]>([]);
  const [loadedMappings, setLoadedMappings] = useState<DeploymentMapping[]>([]);
  const [draggedId, setDraggedId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [mappingFilter, setMappingFilter] = useState<'all' | 'mapped' | 'unmapped' | 'synced' | 'not-synced'>('all');
  const [contextMenu, setContextMenu] = useState<MappingMenu | null>(null);
  const [drawerDraft, setDrawerDraft] = useState<DeploymentMapping | null>(null);
  const [detailMappingId, setDetailMappingId] = useState('');
  const [selectedMappingId, setSelectedMappingId] = useState('');
  const [detailDrawerWidth, setDetailDrawerWidth] = useState(420);
  const detailResize = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const [tabEditor, setTabEditor] = useState<{ id: string; name: string; context: string } | null>(null);
  const tabsRef = useRef(tabs);
  const reposRef = useRef(repos);
  tabsRef.current = tabs;
  reposRef.current = repos;

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const selectedContext = activeTab?.context ?? '';
  const previousContextForLoad = useRef(selectedContext);
  const deploymentKey = (deployment: DeploymentOption) => `${deployment.context}/${deployment.namespace}/${deployment.name}`;

  const persistTabs = (nextTabs: DeploymentMappingTab[], nextActiveId = activeTabId) => {
    setTabs(nextTabs);
    setActiveTabId(nextActiveId);
    onPersist(nextTabs, nextActiveId);
  };

  const saveActiveMappings = (rows: DeploymentMapping[]) => {
    if (!activeTab) return;
    const otherContextRows = activeTab.mappings.filter((mapping) => mapping.context !== selectedContext);
    const merged = [...otherContextRows, ...rows];
    const nextTabs = tabs.map((tab) => tab.id === activeTab.id ? { ...tab, mappings: merged } : tab);
    setDraft(rows);
    setLoadedMappings(rows);
    persistTabs(nextTabs);
  };

  useEffect(() => {
    let live = true;
    window.api.k8sContexts().then((available) => {
      if (!live) return;
      setContexts(available);
      const tab = tabsRef.current.find((item) => item.id === activeTabId) ?? tabsRef.current[0];
      const contextExists = available.some((item) => item.name === tab?.context);
      const fallback = available.find((item) => item.name === preferredContext)?.name
        ?? available.find((item) => item.current)?.name ?? available[0]?.name ?? '';
      if (tab && !contextExists && fallback) {
        const next = tabsRef.current.map((item) => item.id === tab.id ? { ...item, context: fallback } : item);
        setTabs(next);
        onPersist(next, tab.id);
      }
    }).catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!selectedContext) { setLoading(false); setDeployments([]); setDraft(activeTab?.mappings ?? []); setLoadedMappings(activeTab?.mappings ?? []); return; }
    let live = true;
    async function loadSelectedTab() {
      setLoading(true); setError('');
      try {
        const items = await window.api.k8sDeployments(selectedContext, 'default');
        if (!live) return;
        const tab = tabsRef.current.find((item) => item.id === activeTabId);
        const tabMappings = tab?.mappings ?? [];
        const existing = tabMappings.filter((mapping) => mapping.context === selectedContext && mapping.namespace === 'default');
        const rows = items.map((deployment) => {
          const saved = existing.find((mapping) => mapping.deployment === deployment.name);
          if (saved) return saved;
          // Context switches should preserve the manually selected Git repo
          // for deployments that keep the same name across environments.
          const previousContextMapping = tabMappings.find((mapping) => mapping.context === previousContextForLoad.current
            && mapping.namespace === 'default' && mapping.deployment === deployment.name && mapping.repoPath);
          const anyContextMapping = tabMappings.find((mapping) => mapping.namespace === 'default'
            && mapping.deployment === deployment.name && mapping.repoPath);
          return {
            id: crypto.randomUUID(), context: selectedContext, namespace: 'default', deployment: deployment.name,
            repoPath: previousContextMapping?.repoPath ?? anyContextMapping?.repoPath ?? initialRepo(deployment, reposRef.current),
            noRepo: previousContextMapping?.noRepo ?? anyContextMapping?.noRepo ?? false,
            imageVersionOverride: '',
          };
        });
        setDeployments(items.map((deployment) => ({ ...deployment, context: selectedContext })));
        setDraft(rows);
        setLoadedMappings(rows);
        if (tab) {
          const otherContextRows = tab.mappings.filter((mapping) => mapping.context !== selectedContext);
          const nextTabs = tabsRef.current.map((item) => item.id === tab.id ? { ...item, mappings: [...otherContextRows, ...rows] } : item);
          setTabs(nextTabs);
          onPersist(nextTabs, activeTabId);
        }
      } catch (reason) {
        if (live) { setDeployments([]); setError(reason instanceof Error ? reason.message : String(reason)); }
      } finally { if (live) setLoading(false); }
    }
    void loadSelectedTab();
    return () => { live = false; };
  }, [selectedContext, activeTabId, refreshKey]);

  const isSynced = (mapping: DeploymentMapping) => {
    if (mapping.noRepo) return false;
    const deployment = deployments.find((item) => item.context === mapping.context && item.namespace === mapping.namespace && item.name === mapping.deployment);
    const repo = repos.find((item) => item.path === mapping.repoPath);
    const deployed = mapping.imageVersionOverride?.trim() || (deployment ? tagOf(deployment.image) : '');
    const latest = repo?.latestVersion ?? '';
    return !!deployed && !!latest && normalizedVersion(deployed) === normalizedVersion(latest);
  };

  const visibleMappings = useMemo(() => draft
    .filter((mapping) => mapping.context === selectedContext && mapping.namespace === 'default')
    .filter((mapping) => {
      if (mappingFilter === 'mapped') return !!mapping.repoPath || !!mapping.noRepo;
      if (mappingFilter === 'unmapped') return !mapping.repoPath && !mapping.noRepo;
      if (mappingFilter === 'synced') return isSynced(mapping);
      if (mappingFilter === 'not-synced') {
        const deployment = deployments.find((item) => item.context === mapping.context && item.namespace === mapping.namespace && item.name === mapping.deployment);
        const repo = repos.find((item) => item.path === mapping.repoPath);
        const deployed = mapping.imageVersionOverride?.trim() || (deployment ? tagOf(deployment.image) : '');
        return !mapping.noRepo && !!deployed && !!repo?.latestVersion && !isSynced(mapping);
      }
      return true;
    })
    .filter((mapping) => {
      const deployment = deployments.find((item) => item.context === mapping.context && item.name === mapping.deployment);
      const repo = repos.find((item) => item.path === mapping.repoPath);
      const query = search.trim().toLowerCase();
      return !query || [mapping.deployment, repo?.name, repo?.path, deployment?.image, mapping.imageVersionOverride]
        .some((value) => value?.toLowerCase().includes(query));
    }), [draft, selectedContext, mappingFilter, deployments, repos, search]);

  const patch = (id: string, values: Partial<DeploymentMapping>) => setDraft((previous) => previous.map((item) => item.id === id ? { ...item, ...values } : item));
  const addMapping = () => {
    const deployment = deployments.find((item) => !draft.some((mapping) => mapping.deployment === item.name && mapping.context === selectedContext));
    setDraft((previous) => [...previous, { id: crypto.randomUUID(), context: selectedContext, namespace: 'default', deployment: deployment?.name ?? '', repoPath: deployment ? initialRepo(deployment, repos) : '', imageVersionOverride: '' }]);
  };
  const move = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    setDraft((previous) => { const next = [...previous]; const from = next.findIndex((row) => row.id === draggedId); const to = next.findIndex((row) => row.id === targetId); if (from < 0 || to < 0) return previous; const [row] = next.splice(from, 1); next.splice(to, 0, row!); return next; });
    setDraggedId('');
  };
  const activateTab = (id: string) => {
    previousContextForLoad.current = tabs.find((tab) => tab.id === id)?.context ?? '';
    setActiveTabId(id);
    onPersist(tabs, id);
    setSearch('');
    setContextMenu(null);
  };
  const createTab = () => {
    const tab: DeploymentMappingTab = { id: crypto.randomUUID(), name: `Mapping ${tabs.length + 1}`, context: selectedContext, mappings: [] };
    persistTabs([...tabs, tab], tab.id);
  };
  const duplicateTab = () => {
    if (!activeTab) return;
    // `draft` contains the most recently loaded/saved view of the active
    // context. Merge it into the tab snapshot so every selected repoPath is
    // copied even if the persisted tab snapshot has not caught up yet.
    const currentRows = new Map(draft.map((mapping) => [`${mapping.context}/${mapping.namespace}/${mapping.deployment}`, mapping]));
    const mappings = activeTab.mappings.map((mapping) => {
      const current = currentRows.get(`${mapping.context}/${mapping.namespace}/${mapping.deployment}`);
      return { ...structuredClone(mapping), ...(current ? structuredClone(current) : {}), id: crypto.randomUUID() };
    });
    const copy: DeploymentMappingTab = {
      ...structuredClone(activeTab),
      id: crypto.randomUUID(),
      name: `${activeTab.name} copy`,
      mappings,
    };
    persistTabs([...tabs, copy], copy.id);
  };
  const closeTab = (id: string) => {
    if (tabs.length <= 1 || editing || drawerDraft) return;
    const index = tabs.findIndex((tab) => tab.id === id);
    const nextTabs = tabs.filter((tab) => tab.id !== id);
    const nextActiveId = activeTabId === id
      ? nextTabs[Math.min(index, nextTabs.length - 1)]?.id ?? nextTabs[0]?.id ?? activeTabId
      : activeTabId;
    persistTabs(nextTabs, nextActiveId);
  };
  const saveTabDetails = () => {
    if (!tabEditor) return;
    const name = tabEditor.name.trim();
    if (!name) return;
    persistTabs(tabs.map((tab) => tab.id === tabEditor.id ? { ...tab, name, context: tabEditor.context } : tab));
    setTabEditor(null);
    setRefreshKey((key) => key + 1);
    setSearch('');
  };
  const changeContext = (context: string) => {
    if (!activeTab) return;
    previousContextForLoad.current = activeTab.context;
    persistTabs(tabs.map((tab) => tab.id === activeTab.id ? { ...tab, context } : tab));
    setRefreshKey((key) => key + 1);
    setSearch('');
  };
  const openEditDrawer = (mapping: DeploymentMapping) => { setContextMenu(null); setDrawerDraft({ ...mapping }); };
  const openDetailDrawer = (mapping: DeploymentMapping) => { setContextMenu(null); setDetailMappingId(mapping.id); setDetailDrawerWidth(Math.min(420, window.innerWidth * 0.92)); };
  const closeEditDrawer = () => setDrawerDraft(null);
  const saveEditDrawer = () => {
    if (!drawerDraft) return;
    const next = draft.some((mapping) => mapping.id === drawerDraft.id)
      ? draft.map((mapping) => mapping.id === drawerDraft.id ? drawerDraft : mapping)
      : [...draft, drawerDraft];
    saveActiveMappings(next);
    closeEditDrawer();
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'v' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (editing || drawerDraft || tabEditor || detailMappingId || contextMenu) return;
      const mapping = draft.find((row) => row.id === selectedMappingId);
      if (!mapping) return;
      event.preventDefault();
      openDetailDrawer(mapping);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [draft, selectedMappingId, editing, drawerDraft, tabEditor, detailMappingId, contextMenu]);

  return <section className="mapping-view">
    <header className="repo-view-toolbar mapping-header">
      <div><strong>Deployment mapping</strong><span className="repo-view-scope">Default namespace · compare deployed image tags with latest Git tags</span></div>
      <div className="mapping-actions">
        <input className="repo-search-input mapping-search" type="search" aria-label="Search mappings" placeholder="Search deployment or repository…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="mapping-filter-group" aria-label="Filter mappings">{(['all', 'mapped', 'unmapped', 'synced', 'not-synced'] as const).map((filter) => <button key={filter} type="button" className={`mapping-filter ${mappingFilter === filter ? 'active' : ''}`} onClick={() => setMappingFilter(filter)}>{filter === 'all' ? 'All' : filter === 'mapped' ? 'Mapped' : filter === 'unmapped' ? 'Unmapped' : filter === 'synced' ? 'Synced' : 'Not synced'}</button>)}</div>
        <select className="mapping-context-select" aria-label="Kubernetes context" value={selectedContext} disabled={editing || !contexts.length} onChange={(event) => changeContext(event.target.value)}>{contexts.map((context) => <option key={context.name} value={context.name}>{context.name}{context.current ? ' · current' : ''}</option>)}</select>
        <span className="mapping-count">{visibleMappings.length}</span>
        <button className="mapping-button secondary" disabled={loading || syncing || editing || !selectedContext} onClick={() => { setRefreshKey((key) => key + 1); onRefresh(); }}>{loading || syncing ? 'Refreshing…' : '↻ Refresh'}</button>
        {editing ? <><button className="mapping-button secondary" onClick={() => { setDraft(loadedMappings); onCancel(); }}>Cancel</button><button className="mapping-button primary" onClick={() => { saveActiveMappings(draft); onCancel(); }}>Save changes</button></> : <button className="mapping-button primary" onClick={onEdit}>Edit mappings</button>}
      </div>
    </header>
    <div className="mapping-tabbar" role="tablist" aria-label="Mapping tabs">
      <div className="mapping-tabs">{tabs.map((tab) => <div key={tab.id} className={`mapping-tab-shell ${tab.id === activeTab?.id ? 'active' : ''}`}>
        <button type="button" role="tab" aria-selected={tab.id === activeTab?.id} className="mapping-tab" disabled={editing || !!drawerDraft || !!tabEditor} onClick={() => activateTab(tab.id)}><span>{tab.name}</span></button>
        <button type="button" className="mapping-tab-close" aria-label={`Close ${tab.name}`} title={tabs.length === 1 ? 'Keep at least one mapping tab' : `Close ${tab.name}`} disabled={tabs.length <= 1 || editing || !!drawerDraft || !!tabEditor} onClick={() => closeTab(tab.id)}>×</button>
      </div>)}</div>
      <div className="mapping-tab-actions"><button type="button" onClick={createTab} disabled={editing || !!drawerDraft || !!tabEditor}>＋ New</button><button type="button" onClick={duplicateTab} disabled={editing || !!drawerDraft || !!tabEditor || !activeTab}>Duplicate</button><button type="button" onClick={() => activeTab && setTabEditor({ id: activeTab.id, name: activeTab.name, context: activeTab.context })} disabled={editing || !!drawerDraft || !!tabEditor || !activeTab}>Edit tab</button></div>
    </div>
    {loading && <div className="mapping-state">Loading deployments from kubeconfig…</div>}
    {!loading && error && <div className="mapping-state mapping-error">{error}</div>}
    {!loading && !error && contexts.length === 0 && <div className="mapping-state">No Kubernetes contexts found. Configure a context in your kubeconfig to map deployments.</div>}
    <div className="table-container mapping-table-wrap"><div className="table-header mapping-table-head">
      <div className="cell mapping-column-number">#</div><div className="cell mapping-column-deployment">DEPLOYMENT</div><div className="cell mapping-column-repo">GIT REPOSITORY</div><div className="cell mapping-column-image">DEPLOYED IMAGE</div><div className="cell mapping-column-latest">LATEST GIT TAG</div><div className="cell mapping-column-status">STATUS</div>{editing && <div className="cell mapping-column-actions" />}
    </div>
      {visibleMappings.map((mapping, index) => {
        const deployment = deployments.find((item) => item.context === mapping.context && item.namespace === mapping.namespace && item.name === mapping.deployment);
        const repo = repos.find((item) => item.path === mapping.repoPath);
        const deployed = mapping.imageVersionOverride?.trim() || (deployment ? tagOf(deployment.image) : '');
        const latest = repo?.latestVersion ?? '';
        const matched = !mapping.noRepo && !!deployed && !!latest && normalizedVersion(deployed) === normalizedVersion(latest);
        const age = deploymentAge(deployment);
        return <div key={mapping.id} className={`table-row mapping-row ${selectedMappingId === mapping.id ? 'mapping-row-selected' : ''} ${draggedId === mapping.id ? 'dragging' : ''}`} draggable={editing} onClick={() => setSelectedMappingId(mapping.id)} onDragStart={() => setDraggedId(mapping.id)} onDragOver={(event) => { if (editing) event.preventDefault(); }} onDrop={() => move(mapping.id)} onDragEnd={() => setDraggedId('')} onContextMenu={(event) => { event.preventDefault(); setSelectedMappingId(mapping.id); setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 180), y: Math.min(event.clientY, window.innerHeight - 50), id: mapping.id }); }}>
          <div className="cell mapping-column-number mapping-serial">{index + 1}</div>
          {editing ? <div className="cell mapping-column-deployment"><SearchableSelect label="Kubernetes deployment" value={deployment ? deploymentKey(deployment) : ''} placeholder="Search deployment…" options={deployments.map((item) => ({ value: deploymentKey(item), label: item.name }))} onChange={(value) => { const selected = deployments.find((item) => deploymentKey(item) === value); if (selected) patch(mapping.id, { context: selected.context, namespace: 'default', deployment: selected.name, repoPath: mapping.repoPath || initialRepo(selected, repos), imageVersionOverride: '' }); }} /></div> : <div className="cell mapping-column-deployment mapping-deployment"><strong>{mapping.deployment || 'Select deployment'}</strong></div>}
          {editing ? <div className="cell mapping-column-repo mapping-repo-edit"><SearchableSelect label="Git repository" value={mapping.repoPath} placeholder={mapping.noRepo ? 'No repository required' : 'Search repository…'} options={repos.map((item) => ({ value: item.path, label: `${item.name} — ${item.path}` }))} onChange={(value) => patch(mapping.id, { repoPath: value, noRepo: false })} /><label className="mapping-no-repo"><input type="checkbox" checked={!!mapping.noRepo} onChange={(event) => patch(mapping.id, { noRepo: event.target.checked })} /><span>No repo</span></label></div> : <div className="cell mapping-column-repo">{mapping.noRepo ? <span className="mapping-no-repo-note">No repo for this</span> : repo?.name ?? <span className="mapping-muted">Not mapped</span>}</div>}
          <div className={`cell mapping-column-image ${matched ? 'mapping-version' : 'mapping-version mismatch'}`}>{editing ? <><input aria-label="Deployed image version override" placeholder={deployed || 'Image version override'} value={mapping.imageVersionOverride ?? ''} onChange={(event) => patch(mapping.id, { imageVersionOverride: event.target.value })} />{age && <small className="mapping-image-age">{age}</small>}</> : <><span>{deployed || '—'}</span>{age && <small className="mapping-image-age" title={deployment?.lastUpdated || deployment?.createdAt}>· {age}</small>}</>}</div>
          <div className="cell mapping-column-latest mapping-latest"><strong>{latest || '—'}</strong><small title={repo?.latestVersionDate ? new Date(repo.latestVersionDate).toLocaleString() : undefined}>{repo?.latestVersionDate ? `Tagged ${new Date(repo.latestVersionDate).toLocaleString()} · ${timeAgo(repo.latestVersionDate)} ago` : 'Tag time unavailable'}</small></div>
          <div className="cell mapping-column-status">{mapping.noRepo ? <span className="mapping-status synced">✓ Mapped</span> : matched ? <span className="mapping-status synced">✓ Deployed</span> : <span className="mapping-status out-of-sync">{deployed && latest ? 'Not in sync' : 'Unmapped'}</span>}</div>
          {editing && <div className="cell mapping-column-actions mapping-row-actions"><button type="button" className="mapping-drag" aria-label="Drag to reorder" title="Drag to reorder">⠿</button><button type="button" className="mapping-remove" aria-label="Remove mapping" onClick={() => setDraft((previous) => previous.filter((item) => item.id !== mapping.id))}>×</button></div>}
        </div>;
      })}
      {!loading && visibleMappings.length === 0 && <div className="mapping-empty">{search || mappingFilter !== 'all' ? 'No mappings match the current search and filter.' : 'No deployments found in this context’s default namespace.'}</div>}
    </div>
    {editing && <button className="mapping-add" type="button" onClick={addMapping}>＋ Add deployment mapping</button>}
    {contextMenu && <><button type="button" className="repo-context-backdrop mapping-menu-backdrop" aria-label="Close row menu" onClick={() => setContextMenu(null)} /><div className="repo-context-menu mapping-row-menu" style={{ left: contextMenu.x, top: contextMenu.y }}><div className="repo-context-heading">Mapping row</div><button type="button" onClick={() => { const mapping = draft.find((item) => item.id === contextMenu.id); if (mapping) openDetailDrawer(mapping); }}><span>View details</span><kbd>V</kbd></button><button type="button" onClick={() => { const mapping = draft.find((item) => item.id === contextMenu.id); if (mapping) openEditDrawer(mapping); }}><span>Edit mapping</span></button></div></>}
    {drawerDraft && <><button type="button" className="dashboard-drawer-backdrop" aria-label="Close mapping editor" onClick={closeEditDrawer} /><aside className="dashboard-detail-drawer mapping-edit-drawer" role="dialog" aria-modal="true" aria-label="Edit deployment mapping">
      <header className="dashboard-drawer-header"><div><span className="about-drawer-eyebrow">Mapping editor</span><h2>{drawerDraft.deployment || 'Deployment mapping'}</h2></div><button type="button" className="dashboard-drawer-close" aria-label="Close editor" onClick={closeEditDrawer}>×</button></header>
      <div className="dashboard-drawer-body mapping-edit-body"><div className="mapping-edit-context"><span>Context</span><strong>{drawerDraft.context} · default</strong></div>
        <label className="mapping-edit-field"><span>Deployment</span><SearchableSelect label="Deployment" value={`${drawerDraft.context}/default/${drawerDraft.deployment}`} placeholder="Search deployment…" options={deployments.map((item) => ({ value: deploymentKey(item), label: item.name }))} onChange={(value) => { const selected = deployments.find((item) => deploymentKey(item) === value); if (selected) setDrawerDraft((current) => current ? { ...current, context: selected.context, namespace: 'default', deployment: selected.name, repoPath: current.repoPath || initialRepo(selected, repos), imageVersionOverride: '' } : current); }} /></label>
        <label className="mapping-edit-field"><span>Git repository</span><SearchableSelect label="Git repository" value={drawerDraft.repoPath} placeholder={drawerDraft.noRepo ? 'No repository required' : 'Search repository…'} options={repos.map((item) => ({ value: item.path, label: `${item.name} — ${item.path}` }))} onChange={(value) => setDrawerDraft((current) => current ? { ...current, repoPath: value, noRepo: false } : current)} /></label>
        <label className="mapping-no-repo-option"><input type="checkbox" checked={!!drawerDraft.noRepo} onChange={(event) => setDrawerDraft((current) => current ? { ...current, noRepo: event.target.checked } : current)} /><span><strong>No repository for this deployment</strong><small>Count this deployment as mapped without comparing a Git image tag.</small></span></label>
        <label className="mapping-edit-field"><span>Deployed image version override</span><input value={drawerDraft.imageVersionOverride ?? ''} placeholder="Use the deployment image tag" onChange={(event) => setDrawerDraft((current) => current ? { ...current, imageVersionOverride: event.target.value } : current)} /></label>
        <p className="mapping-edit-help">Leave the override empty to use the image tag currently set on the Kubernetes deployment.</p>
      </div>
      <footer className="dashboard-drawer-footer"><button type="button" className="mapping-button secondary" onClick={closeEditDrawer}>Cancel</button><button type="button" className="mapping-button primary" onClick={saveEditDrawer}>Save mapping</button></footer>
    </aside></>}
    {tabEditor && <><button type="button" className="dashboard-drawer-backdrop" aria-label="Close tab editor" onClick={() => setTabEditor(null)} /><aside className="dashboard-detail-drawer mapping-edit-drawer" role="dialog" aria-modal="true" aria-label="Edit mapping tab">
      <header className="dashboard-drawer-header"><div><span className="about-drawer-eyebrow">Mapping tab</span><h2>Edit tab</h2></div><button type="button" className="dashboard-drawer-close" aria-label="Close tab editor" onClick={() => setTabEditor(null)}>×</button></header>
      <div className="dashboard-drawer-body mapping-edit-body">
        <label className="mapping-edit-field"><span>Tab name</span><input autoFocus value={tabEditor.name} placeholder="Mapping name" onChange={(event) => setTabEditor((current) => current ? { ...current, name: event.target.value } : current)} /></label>
        <label className="mapping-edit-field"><span>Kubernetes context</span><select value={tabEditor.context} onChange={(event) => setTabEditor((current) => current ? { ...current, context: event.target.value } : current)}>{contexts.map((context) => <option key={context.name} value={context.name}>{context.name}</option>)}</select></label>
        <div className="mapping-edit-context"><span>Context details</span><strong>Cluster · {contexts.find((context) => context.name === tabEditor.context)?.cluster || 'Unavailable'}</strong><strong>Namespace · default</strong><strong>{contexts.find((context) => context.name === tabEditor.context)?.current ? 'Current kubeconfig context' : 'Configured kubeconfig context'}</strong></div>
        <p className="mapping-edit-help">This tab loads and saves deployment mappings from the selected context’s default namespace.</p>
      </div>
      <footer className="dashboard-drawer-footer"><button type="button" className="mapping-button secondary" onClick={() => setTabEditor(null)}>Cancel</button><button type="button" className="mapping-button primary" onClick={saveTabDetails} disabled={!tabEditor.name.trim()}>Save tab</button></footer>
    </aside></>}
    {detailMappingId && (() => {
      const mapping = draft.find((item) => item.id === detailMappingId) ?? activeTab?.mappings.find((item) => item.id === detailMappingId);
      if (!mapping) return null;
      const deployment = deployments.find((item) => item.context === mapping.context && item.namespace === mapping.namespace && item.name === mapping.deployment);
      const repo = repos.find((item) => item.path === mapping.repoPath);
      const deployed = mapping.imageVersionOverride?.trim() || (deployment ? tagOf(deployment.image) : '');
      const latest = repo?.latestVersion ?? '';
      const matched = !mapping.noRepo && !!deployed && !!latest && normalizedVersion(deployed) === normalizedVersion(latest);
      const tagDate = repo?.latestVersionDate ? new Date(repo.latestVersionDate) : null;
      return <><button type="button" className="dashboard-drawer-backdrop" aria-label="Close mapping details" onClick={() => setDetailMappingId('')} /><aside className="dashboard-detail-drawer mapping-detail-drawer" role="dialog" aria-modal="true" aria-label="Mapping details" style={{ width: `${detailDrawerWidth}px` }}>
        <div className="mapping-detail-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize mapping details drawer" title="Drag to resize" onPointerDown={(event) => { detailResize.current = { pointerId: event.pointerId, x: event.clientX, width: detailDrawerWidth }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const resize = detailResize.current; if (!resize || resize.pointerId !== event.pointerId) return; const maxWidth = Math.min(900, window.innerWidth - 80); setDetailDrawerWidth(Math.max(320, Math.min(maxWidth, resize.width + resize.x - event.clientX))); }} onPointerUp={(event) => { if (detailResize.current?.pointerId === event.pointerId) detailResize.current = null; }} onPointerCancel={() => { detailResize.current = null; }} />
        <header className="dashboard-drawer-header">
          <div><span className="about-drawer-eyebrow">Mapping details · drag left edge to resize</span><h2>{mapping.deployment}</h2></div><button type="button" className="dashboard-drawer-close" aria-label="Close mapping details" onClick={() => setDetailMappingId('')}>×</button>
        </header>
        <div className="dashboard-drawer-body mapping-detail-body">
          <span className={`dashboard-drawer-badge ${mapping.noRepo || matched ? 'is-good' : deployed && latest ? 'is-bad' : 'is-warning'}`}><span />{mapping.noRepo ? 'Mapped' : matched ? 'Synced' : deployed && latest ? 'Not synced' : 'Unmapped'}</span>
          <section className="dashboard-drawer-section"><h3>Deployment</h3><div className="dashboard-drawer-facts"><div className="dashboard-drawer-fact"><span>Context</span><strong>{mapping.context}</strong></div><div className="dashboard-drawer-fact"><span>Namespace</span><strong>{mapping.namespace}</strong></div><div className="dashboard-drawer-fact"><span>Image</span><strong>{deployment?.image ?? 'Unavailable'}</strong></div><div className="dashboard-drawer-fact"><span>Image age</span><strong>{deploymentAge(deployment) || 'Unavailable'}</strong></div></div></section>
          <section className="dashboard-drawer-section"><h3>Git mapping</h3><div className="dashboard-drawer-facts"><div className="dashboard-drawer-fact"><span>Repository</span><strong>{mapping.noRepo ? 'No repo for this' : repo?.name ?? 'Not mapped'}</strong></div>{repo && <div className="dashboard-drawer-fact"><span>Repository path</span><strong>{repo.path}</strong></div>}<div className="dashboard-drawer-fact"><span>Deployed version</span><strong>{deployed || '—'}</strong></div><div className="dashboard-drawer-fact"><span>Latest Git tag</span><strong>{latest || '—'}</strong></div><div className="dashboard-drawer-fact"><span>Latest tag created</span><strong>{tagDate ? `${tagDate.toLocaleString()} · ${timeAgo(tagDate.toISOString())} ago` : 'Unavailable'}</strong></div></div></section>
        </div>
      </aside></>;
    })()}
  </section>;
}
