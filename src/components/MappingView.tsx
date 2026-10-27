import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DeploymentMapping, DeploymentMappingTab, KubeContext, KubeDeploymentSummary, PR, Provider, RepoState } from '../../core/types.js';
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
  baseBranch: string;
  releaseBranch: string;
  provider: Provider;
  token: string;
  mappingTabs: DeploymentMappingTab[];
  legacyMappings: DeploymentMapping[];
  preferredContext?: string;
  preferredTabId?: string;
  editing: boolean;
  syncing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onPersist: (tabs: DeploymentMappingTab[], activeTabId: string) => void;
  onOpenPR: (pr: PR) => void;
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

export function MappingView({ repos, baseBranch, releaseBranch, provider, token, mappingTabs, legacyMappings, preferredContext, preferredTabId, editing, syncing, onEdit, onCancel, onPersist, onOpenPR }: Props) {
  const [contexts, setContexts] = useState<KubeContext[]>([]);
  const [tabs, setTabs] = useState<DeploymentMappingTab[]>(() => mappingTabs.length ? mappingTabs : [buildLegacyTab(legacyMappings, preferredContext)]);
  const [activeTabId, setActiveTabId] = useState(() => mappingTabs.find((tab) => tab.id === preferredTabId)?.id ?? mappingTabs[0]?.id ?? 'mapping-default');
  const [deployments, setDeployments] = useState<DeploymentOption[]>(() => {
    const tab = mappingTabs.find((item) => item.id === preferredTabId) ?? mappingTabs[0];
    return (tab?.deploymentSnapshot ?? []).map((deployment) => ({ ...deployment, context: tab.context }));
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<DeploymentMapping[]>([]);
  const [loadedMappings, setLoadedMappings] = useState<DeploymentMapping[]>([]);
  const [draggedId, setDraggedId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const completedRefreshKey = useRef(0);
  const preloadAttempted = useRef(new Set<string>());
  const [search, setSearch] = useState('');
  const [deploymentAgeFilter, setDeploymentAgeFilter] = useState('all');
  const [mappingFilter, setMappingFilter] = useState<'all' | 'mapped' | 'unmapped' | 'synced' | 'not-synced'>('all');
  const [releaseFilter, setReleaseFilter] = useState<'all' | 'released' | 'not-released'>('all');
  const [contextMenu, setContextMenu] = useState<MappingMenu | null>(null);
  const [tabMenu, setTabMenu] = useState<MappingMenu | null>(null);
  const [deleteTabTarget, setDeleteTabTarget] = useState<DeploymentMappingTab | null>(null);
  const [drawerDraft, setDrawerDraft] = useState<DeploymentMapping | null>(null);
  const [detailMappingId, setDetailMappingId] = useState('');
  const [detailPRs, setDetailPRs] = useState<PR[]>([]);
  const [detailPRLoading, setDetailPRLoading] = useState(false);
  const [detailPRError, setDetailPRError] = useState('');
  const [detailPRHasMore, setDetailPRHasMore] = useState(false);
  const [changeCounts, setChangeCounts] = useState<Record<string, { tag: string; count: number } | null>>({});
  const [selectedMappingId, setSelectedMappingId] = useState('');
  const [detailDrawerWidth, setDetailDrawerWidth] = useState(630);
  const detailResize = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const [tabEditor, setTabEditor] = useState<{ id: string; name: string; context: string } | null>(null);
  const tabsRef = useRef(tabs);
  const reposRef = useRef(repos);
  tabsRef.current = tabs;
  reposRef.current = repos;
  const mappingForDetails = draft.find((item) => item.id === detailMappingId)
    ?? tabs.flatMap((tab) => tab.mappings).find((item) => item.id === detailMappingId);
  const repoForDetails = repos.find((item) => item.path === mappingForDetails?.repoPath);

  useEffect(() => {
    if (!detailMappingId || !repoForDetails || mappingForDetails?.noRepo || !token.trim()) {
      setDetailPRs([]); setDetailPRLoading(false); setDetailPRError(''); setDetailPRHasMore(false);
      return;
    }
    let live = true;
    setDetailPRLoading(true); setDetailPRError(''); setDetailPRs([]);
    void (async () => {
      try {
        const remote = await window.api.getRemoteOwnerRepo(repoForDetails.path);
        if (!remote) throw new Error('Could not read the repository remote.');
        const normalize = (branch: string) => branch.trim().replace(/^refs\/heads\//, '').toLowerCase();
        const source = normalize(releaseBranch);
        const target = normalize(baseBranch);
        const page = await window.api.fetchPRs(remote.owner, remote.repo, provider, token, repoForDetails.name, 'mapping-all', 1, 100, releaseBranch, baseBranch);
        if (!live) return;
        setDetailPRHasMore(page.hasMore);
        setDetailPRs(page.prs.filter((pr) => normalize(pr.sourceBranch) === source && normalize(pr.targetBranch) === target));
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        const networkFailure = /fetch failed|EHOSTUNREACH|ENETUNREACH|ECONNREFUSED/i.test(message);
        if (live) setDetailPRError(networkFailure
          ? 'Could not reach GitHub. Check your internet connection, VPN, or proxy settings.'
          : message);
      } finally { if (live) setDetailPRLoading(false); }
    })();
    return () => { live = false; };
  }, [detailMappingId, mappingForDetails?.repoPath, mappingForDetails?.noRepo, repoForDetails?.path, repoForDetails?.name, provider, token, baseBranch, releaseBranch]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const selectedContext = activeTab?.context ?? '';
  const previousContextForLoad = useRef(selectedContext);
  const deploymentKey = (deployment: DeploymentOption) => `${deployment.context}/${deployment.namespace}/${deployment.name}`;

  useEffect(() => {
    const snapshot = activeTab?.deploymentSnapshot ?? [];
    setDeployments(snapshot.map((deployment) => ({ ...deployment, context: selectedContext })));
    const savedRows = (activeTab?.mappings ?? []).filter((mapping) => mapping.context === selectedContext && mapping.namespace === 'default');
    setDraft(savedRows);
    setLoadedMappings(savedRows);
  }, [activeTabId, selectedContext]);

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

  const refreshMappings = () => setRefreshKey((key) => key + 1);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'r' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (editing || drawerDraft || tabEditor || detailMappingId || contextMenu || tabMenu || deleteTabTarget || loading) return;
      event.preventDefault();
      refreshMappings();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editing, drawerDraft, tabEditor, detailMappingId, contextMenu, tabMenu, deleteTabTarget, loading]);

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
    if (refreshKey === 0 || refreshKey === completedRefreshKey.current) return;
    completedRefreshKey.current = refreshKey;
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
        // Keep saved mappings for deployments that are temporarily absent from
        // the latest Kubernetes response so a refresh never loses user data.
        const returnedDeployments = new Set(items.map((deployment) => deployment.name));
        rows.push(...existing.filter((mapping) => !returnedDeployments.has(mapping.deployment)));
        setDeployments(items.map((deployment) => ({ ...deployment, context: selectedContext })));
        setDraft(rows);
        setLoadedMappings(rows);
        if (tab) {
          const otherContextRows = tab.mappings.filter((mapping) => mapping.context !== selectedContext);
          const nextTabs = tabsRef.current.map((item) => item.id === tab.id ? { ...item, mappings: [...otherContextRows, ...rows], deploymentSnapshot: items } : item);
          setTabs(nextTabs);
          onPersist(nextTabs, activeTabId);
        }
      } catch (reason) {
        if (live) setError(reason instanceof Error ? reason.message : String(reason));
      } finally { if (live) setLoading(false); }
    }
    void loadSelectedTab();
    return () => { live = false; };
  }, [selectedContext, activeTabId, refreshKey]);

  const isSynced = (mapping: DeploymentMapping) => {
    if (mapping.noRepo) return false;
    return changeCounts[mapping.id]?.count === 0;
  };

  const contextMappings = draft.filter((mapping) => mapping.context === selectedContext && mapping.namespace === 'default');
  useEffect(() => {
    let live = true;
    const checks = contextMappings.map(async (mapping) => {
      const repo = repos.find((item) => item.path === mapping.repoPath);
      if (!repo || mapping.noRepo) return [mapping.id, null] as const;
      return [mapping.id, await window.api.countCommitsSinceTag(repo.path, mapping.baseBranch?.trim() || baseBranch)] as const;
    });
    void Promise.all(checks).then((results) => { if (live) setChangeCounts(Object.fromEntries(results)); });
    return () => { live = false; };
  }, [draft, deployments, repos, baseBranch, refreshKey]);
  const releasedCount = contextMappings.filter((mapping) => {
    const repo = repos.find((item) => item.path === mapping.repoPath);
    return !!mapping.repoPath && !!repo && !repo.missingRelease;
  }).length;
  const notReleasedCount = contextMappings.filter((mapping) => repos.some((repo) => repo.path === mapping.repoPath && repo.missingRelease)).length;

  const visibleMappings = useMemo(() => draft
    .filter((mapping) => mapping.context === selectedContext && mapping.namespace === 'default')
    .filter((mapping) => {
      if (releaseFilter === 'all') return true;
      const repo = repos.find((item) => item.path === mapping.repoPath);
      return releaseFilter === 'released' ? !!mapping.repoPath && !!repo && !repo.missingRelease : !!repo?.missingRelease;
    })
    .filter((mapping) => {
      if (mappingFilter === 'mapped') return !!mapping.repoPath || !!mapping.noRepo;
      if (mappingFilter === 'unmapped') return !mapping.repoPath && !mapping.noRepo;
      if (mappingFilter === 'synced') return isSynced(mapping);
      if (mappingFilter === 'not-synced') {
        const deployment = deployments.find((item) => item.context === mapping.context && item.namespace === mapping.namespace && item.name === mapping.deployment);
        const repo = repos.find((item) => item.path === mapping.repoPath);
        const deployed = mapping.imageVersionOverride?.trim() || (deployment ? tagOf(deployment.image) : '');
        return !mapping.noRepo && (changeCounts[mapping.id]?.count ?? 0) > 0;
      }
      return true;
    })
    .filter((mapping) => {
      if (deploymentAgeFilter === 'all') return true;
      const deployment = deployments.find((item) => item.context === mapping.context && item.namespace === mapping.namespace && item.name === mapping.deployment);
      const timestamp = deployment?.lastUpdated || deployment?.createdAt;
      if (!timestamp) return true;
      const deployedAt = new Date(timestamp).getTime();
      if (!Number.isFinite(deployedAt)) return true;
      const now = Date.now();
      if (deploymentAgeFilter === 'today') {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        return deployedAt >= startOfToday.getTime();
      }
      const month = 30 * 24 * 60 * 60 * 1000;
      if (deploymentAgeFilter === 'older') return now - deployedAt > month;
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
      const duration = durations[deploymentAgeFilter];
      return duration == null || now - deployedAt <= duration;
    })
    .filter((mapping) => {
      const deployment = deployments.find((item) => item.context === mapping.context && item.name === mapping.deployment);
      const repo = repos.find((item) => item.path === mapping.repoPath);
      const query = search.trim().toLowerCase();
      return !query || [mapping.deployment, repo?.name, repo?.path, deployment?.image, mapping.imageVersionOverride]
        .some((value) => value?.toLowerCase().includes(query));
    }), [draft, selectedContext, mappingFilter, releaseFilter, deploymentAgeFilter, deployments, repos, search, changeCounts]);

  const patch = (id: string, values: Partial<DeploymentMapping>) => setDraft((previous) => previous.map((item) => item.id === id ? { ...item, ...values } : item));
  const openGitDiff = async (mapping: DeploymentMapping) => {
    const repo = repos.find((item) => item.path === mapping.repoPath);
    const comparison = changeCounts[mapping.id];
    if (!repo || !comparison) return;
    try {
      const remote = await window.api.getRemoteUrl(repo.path);
      const branch = mapping.baseBranch?.trim() || baseBranch;
      const url = await window.api.getCompareUrl(remote, comparison.tag, branch);
      if (url) await window.api.openUrl(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'o' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (editing || drawerDraft || tabEditor || detailMappingId || contextMenu || tabMenu || deleteTabTarget) return;
      const mapping = draft.find((row) => row.id === selectedMappingId);
      if (!mapping || !changeCounts[mapping.id]?.count) return;
      event.preventDefault();
      void openGitDiff(mapping);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [draft, selectedMappingId, changeCounts, repos, baseBranch, editing, drawerDraft, tabEditor, detailMappingId, contextMenu, tabMenu, deleteTabTarget]);
  const addMapping = () => {
    const deployment = deployments.find((item) => !draft.some((mapping) => mapping.deployment === item.name && mapping.context === selectedContext));
    setDraft((previous) => [...previous, { id: crypto.randomUUID(), context: selectedContext, namespace: 'default', deployment: deployment?.name ?? '', repoPath: deployment ? initialRepo(deployment, repos) : '', imageVersionOverride: '' }]);
  };
  const move = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    setDraft((previous) => { const next = [...previous]; const from = next.findIndex((row) => row.id === draggedId); const to = next.findIndex((row) => row.id === targetId); if (from < 0 || to < 0) return previous; const [row] = next.splice(from, 1); next.splice(to, 0, row!); return next; });
    setDraggedId('');
  };
  const preloadEmptyTab = async (tabId: string) => {
    const target = tabsRef.current.find((tab) => tab.id === tabId);
    if (!target || target.mappings.some((mapping) => mapping.context === target.context && mapping.namespace === 'default') || target.deploymentSnapshot) return;
    const attemptKey = `${tabId}/${target.context}`;
    if (preloadAttempted.current.has(attemptKey)) return;
    preloadAttempted.current.add(attemptKey);
    const reusableRows = tabsRef.current
      .filter((tab) => tab.id !== target.id && tab.context === target.context)
      .flatMap((tab) => tab.mappings)
      .filter((mapping) => mapping.context === target.context && mapping.namespace === 'default');
    let rows: DeploymentMapping[];
    let snapshot: KubeDeploymentSummary[];
    if (reusableRows.length) {
      rows = reusableRows.map((mapping) => ({ ...mapping, id: crypto.randomUUID() }));
      snapshot = tabsRef.current.find((tab) => tab.context === target.context && tab.deploymentSnapshot)?.deploymentSnapshot ?? [];
    } else {
      setLoading(true);
      setError('');
      try {
        snapshot = await window.api.k8sDeployments(target.context, 'default');
        rows = snapshot.map((deployment) => {
          const existing = tabsRef.current
            .filter((tab) => tab.id !== target.id)
            .flatMap((tab) => tab.mappings)
            .find((mapping) => mapping.context === target.context && mapping.namespace === 'default' && mapping.deployment === deployment.name);
          return {
            id: crypto.randomUUID(), context: target.context, namespace: 'default', deployment: deployment.name,
            repoPath: existing?.repoPath || initialRepo(deployment, reposRef.current),
            noRepo: existing?.noRepo ?? false,
            imageVersionOverride: existing?.imageVersionOverride ?? '',
          };
        });
      } catch (reason) {
        preloadAttempted.current.delete(attemptKey);
        setError(reason instanceof Error ? reason.message : String(reason));
        return;
      } finally {
        setLoading(false);
      }
    }
    const latestTabs = tabsRef.current;
    if (!latestTabs.some((tab) => tab.id === tabId)) return;
    const nextTabs = latestTabs.map((tab) => tab.id === tabId ? { ...tab, mappings: rows, deploymentSnapshot: snapshot } : tab);
    setTabs(nextTabs);
    if (activeTabId === tabId) {
      setDeployments(snapshot.map((deployment) => ({ ...deployment, context: target.context })));
      setDraft(rows);
      setLoadedMappings(rows);
    }
    onPersist(nextTabs, tabId);
  };
  useEffect(() => {
    if (activeTab) void preloadEmptyTab(activeTab.id);
  }, [activeTabId, selectedContext]);
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
    if (editing || drawerDraft) return;
    const index = tabs.findIndex((tab) => tab.id === id);
    let nextTabs = tabs.filter((tab) => tab.id !== id);
    if (nextTabs.length === 0) {
      const deletedTab = tabs[index];
      const replacement: DeploymentMappingTab = { id: crypto.randomUUID(), name: 'Mapping 1', context: deletedTab?.context ?? selectedContext, mappings: [] };
      preloadAttempted.current.add(`${replacement.id}/${replacement.context}`);
      nextTabs = [replacement];
    }
    const nextActiveId = activeTabId === id
      ? nextTabs[Math.min(index, nextTabs.length - 1)]?.id ?? nextTabs[0]?.id ?? activeTabId
      : activeTabId;
    persistTabs(nextTabs, nextActiveId);
  };
  const saveTabDetails = () => {
    if (!tabEditor) return;
    const name = tabEditor.name.trim();
    if (!name) return;
    persistTabs(tabs.map((tab) => tab.id === tabEditor.id ? {
      ...tab, name, context: tabEditor.context,
      ...(tab.context !== tabEditor.context ? { deploymentSnapshot: undefined } : {}),
    } : tab));
    setTabEditor(null);
    setSearch('');
  };
  const changeContext = (context: string) => {
    if (!activeTab) return;
    previousContextForLoad.current = activeTab.context;
    persistTabs(tabs.map((tab) => tab.id === activeTab.id ? {
      ...tab, context, ...(tab.context !== context ? { deploymentSnapshot: undefined } : {}),
    } : tab));
    setSearch('');
  };
  const openEditDrawer = (mapping: DeploymentMapping) => { setContextMenu(null); setDrawerDraft({ ...mapping }); };
  const openDetailDrawer = (mapping: DeploymentMapping) => { setContextMenu(null); setDetailMappingId(mapping.id); setDetailDrawerWidth(Math.min(630, window.innerWidth * 0.92)); };
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
        <div className="mapping-release-filters" role="group" aria-label="Release branch filter">
          <button type="button" className={`repo-status-chip repo-status-chip-all ${releaseFilter === 'all' ? 'is-active' : ''}`} data-tooltip="All mappings" aria-pressed={releaseFilter === 'all'} onClick={() => setReleaseFilter('all')}>All</button>
          <button type="button" className={`repo-status-chip repo-status-chip-synced ${releaseFilter === 'released' ? 'is-active' : ''}`} data-tooltip={`In ${releaseBranch || 'release'}`} aria-label={`In release: ${releasedCount}`} title={`In ${releaseBranch || 'release'} (${releasedCount})`} aria-pressed={releaseFilter === 'released'} onClick={() => setReleaseFilter((current) => current === 'released' ? 'all' : 'released')}>{releasedCount}</button>
          <button type="button" className={`repo-status-chip repo-status-chip-not-in-release ${releaseFilter === 'not-released' ? 'is-active' : ''}`} data-tooltip={`Not in ${releaseBranch || 'release'}`} aria-label={`Not in release: ${notReleasedCount}`} title={`Not in ${releaseBranch || 'release'} (${notReleasedCount})`} aria-pressed={releaseFilter === 'not-released'} onClick={() => setReleaseFilter((current) => current === 'not-released' ? 'all' : 'not-released')}>{notReleasedCount}</button>
        </div>
        <select className="mapping-filter-select" aria-label="Filter mappings" value={mappingFilter} onChange={(event) => setMappingFilter(event.target.value as typeof mappingFilter)}>
          <option value="all">All</option><option value="mapped">Mapped</option><option value="unmapped">Unmapped</option><option value="synced">Synced</option><option value="not-synced">Not synced</option>
        </select>
        <select className="mapping-filter-select" aria-label="Filter by deployment age" title="Filter by Kubernetes deployment update time" value={deploymentAgeFilter} onChange={(event) => setDeploymentAgeFilter(event.target.value)}>
          <option value="all">All ages</option><option value="10m">10 min</option><option value="30m">30 min</option><option value="1h">1 hr</option><option value="6h">6 hr</option><option value="today">Today</option><option value="3d">3 days</option><option value="5d">5 days</option><option value="15d">15 days</option><option value="1mo">1 month</option><option value="older">Older than 1 month</option>
        </select>
        <select className="mapping-context-select" aria-label="Kubernetes context" value={selectedContext} disabled={editing || !contexts.length} onChange={(event) => changeContext(event.target.value)}>{contexts.map((context) => <option key={context.name} value={context.name}>{context.name}{context.current ? ' · current' : ''}</option>)}</select>
        <span className="mapping-count">{visibleMappings.length}</span>
        <button className="mapping-button secondary" disabled={loading || syncing || editing || !selectedContext} onClick={refreshMappings}>{loading || syncing ? 'Refreshing…' : '↻ Refresh (R)'}</button>
        {editing ? <><button className="mapping-button secondary" onClick={() => { setDraft(loadedMappings); onCancel(); }}>Cancel</button><button className="mapping-button primary" onClick={() => { saveActiveMappings(draft); onCancel(); }}>Save changes</button></> : <button className="mapping-button primary" onClick={onEdit}>Edit mappings</button>}
      </div>
    </header>
    <div className="mapping-tabbar" role="tablist" aria-label="Mapping tabs">
      <div className="mapping-tabs">{tabs.map((tab) => <div key={tab.id} className={`mapping-tab-shell ${tab.id === activeTab?.id ? 'active' : ''}`}>
        <button type="button" role="tab" aria-selected={tab.id === activeTab?.id} className="mapping-tab" disabled={editing || !!drawerDraft || !!tabEditor} onClick={() => activateTab(tab.id)}><span>{tab.name}</span></button>
      </div>)}</div>
      <div className="mapping-tab-actions"><button type="button" onClick={createTab} disabled={editing || !!drawerDraft || !!tabEditor}>＋ New</button><button type="button" onClick={duplicateTab} disabled={editing || !!drawerDraft || !!tabEditor || !activeTab}>Duplicate</button><button type="button" onClick={() => activeTab && setTabEditor({ id: activeTab.id, name: activeTab.name, context: activeTab.context })} disabled={editing || !!drawerDraft || !!tabEditor || !activeTab}>Edit tab</button><button type="button" className="mapping-tab-menu-button" aria-label="More mapping tab actions" title="More mapping tab actions" disabled={editing || !!drawerDraft || !!tabEditor || !activeTab} onClick={(event) => { if (!activeTab) return; const rect = event.currentTarget.getBoundingClientRect(); setTabMenu({ id: activeTab.id, x: Math.min(rect.right, window.innerWidth - 190), y: rect.bottom }); }}>⋯</button></div>
    </div>
    {loading && <div className="mapping-state">Loading deployments from kubeconfig…</div>}
    {!loading && error && <div className="mapping-state mapping-error">{error}</div>}
    {!loading && !error && contexts.length === 0 && <div className="mapping-state">No Kubernetes contexts found. Configure a context in your kubeconfig to map deployments.</div>}
    <div className="table-container mapping-table-wrap"><div className="table-header mapping-table-head">
        <div className="cell mapping-column-number">#</div><div className="cell mapping-column-deployment">DEPLOYMENT</div><div className="cell mapping-column-repo">GIT REPOSITORY</div><div className="cell mapping-column-changes">CHANGES</div>{editing && <div className="cell mapping-column-no-repo">NO REPO</div>}<div className="cell mapping-column-image">DEPLOYED IMAGE</div><div className="cell mapping-column-latest">LATEST GIT TAG</div><div className="cell mapping-column-status">STATUS</div>{editing && <div className="cell mapping-column-actions" />}
    </div>
      {visibleMappings.map((mapping, index) => {
        const deployment = deployments.find((item) => item.context === mapping.context && item.namespace === mapping.namespace && item.name === mapping.deployment);
        const repo = repos.find((item) => item.path === mapping.repoPath);
        const deployed = mapping.imageVersionOverride?.trim() || (deployment ? tagOf(deployment.image) : '');
        const latest = repo?.latestVersion ?? '';
        const changes = changeCounts[mapping.id]?.count;
        const comparisonTag = changeCounts[mapping.id]?.tag;
        const dim = !editing && !!repo?.missingRelease && !syncing;
        const age = deploymentAge(deployment);
        const deploymentTimestamp = deployment?.lastUpdated || deployment?.createdAt;
        const deploymentHours = deploymentTimestamp ? Math.max(0, (Date.now() - new Date(deploymentTimestamp).getTime()) / 3_600_000) : null;
        return <div key={mapping.id} className={`table-row mapping-row ${selectedMappingId === mapping.id ? 'mapping-row-selected' : ''} ${draggedId === mapping.id ? 'dragging' : ''}`} style={dim ? { opacity: 0.5 } : undefined} title={dim ? `Repository has no ${releaseBranch} branch` : undefined} draggable={editing} onClick={() => setSelectedMappingId(mapping.id)} onDragStart={() => setDraggedId(mapping.id)} onDragOver={(event) => { if (editing) event.preventDefault(); }} onDrop={() => move(mapping.id)} onDragEnd={() => setDraggedId('')} onContextMenu={(event) => { event.preventDefault(); setSelectedMappingId(mapping.id); setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 180), y: Math.min(event.clientY, window.innerHeight - 50), id: mapping.id }); }}>
          <div className="cell mapping-column-number mapping-serial">{index + 1}</div>
          {editing ? <div className="cell mapping-column-deployment"><SearchableSelect label="Kubernetes deployment" value={deployment ? deploymentKey(deployment) : ''} placeholder="Search deployment…" options={deployments.map((item) => ({ value: deploymentKey(item), label: item.name }))} onChange={(value) => { const selected = deployments.find((item) => deploymentKey(item) === value); if (selected) patch(mapping.id, { context: selected.context, namespace: 'default', deployment: selected.name, repoPath: mapping.repoPath || initialRepo(selected, repos), imageVersionOverride: '' }); }} /></div> : <div className="cell mapping-column-deployment mapping-deployment"><strong>{mapping.deployment || 'Select deployment'}</strong></div>}
          <div className="cell mapping-column-repo">{editing ? mapping.noRepo ? <span className="mapping-muted">—</span> : <SearchableSelect label="Git repository" value={mapping.repoPath} placeholder="Search repository…" options={repos.map((item) => ({ value: item.path, label: item.name }))} onChange={(value) => patch(mapping.id, { repoPath: value, noRepo: false })} /> : mapping.noRepo ? <span className="mapping-no-repo-note">No repo for this</span> : repo?.name ?? (mapping.repoPath ? mapping.repoPath.split(/[\\/]/).pop() : null) ?? <span className="mapping-muted">Not mapped</span>}</div>
          <div className={`cell mapping-column-changes ${changes != null && changes > 0 ? 'mapping-changes-out-of-sync' : ''}`} title={comparisonTag ? `Open diff: ${comparisonTag} → ${mapping.baseBranch?.trim() || baseBranch} (press O)` : `Commits on ${mapping.baseBranch?.trim() || baseBranch} since its latest reachable Git tag`}>
            {mapping.noRepo ? '—' : changes == null ? '—' : <button type="button" className="mapping-changes-link" aria-label={`Open ${changes} commits behind diff for ${repo?.name ?? mapping.deployment}`} disabled={!comparisonTag || changes === 0} onClick={(event) => { event.stopPropagation(); setSelectedMappingId(mapping.id); void openGitDiff(mapping); }}>{changes > 0 ? `${changes} behind` : '0 behind'}</button>}
          </div>
          {editing && <div className="cell mapping-column-no-repo"><input type="checkbox" aria-label={`No repository needed for ${mapping.deployment}`} checked={!!mapping.noRepo} onChange={(event) => patch(mapping.id, { noRepo: event.target.checked })} /></div>}
          <div className={`cell mapping-column-image ${deployed ? 'mapping-version' : ''}`}>{editing ? <><input aria-label="Deployed image version override" placeholder={deployed || 'Image version override'} value={mapping.imageVersionOverride ?? ''} onChange={(event) => patch(mapping.id, { imageVersionOverride: event.target.value })} />{age && <small className="mapping-image-age">{age}</small>}</> : <><span>{deployed || '—'}</span>{age && <small className="mapping-image-age" title={deployment?.lastUpdated || deployment?.createdAt}>· {age}</small>}</>}</div>
          <div className="cell mapping-column-latest mapping-latest"><strong title={latest || undefined}>{latest || '—'}</strong><small title={repo?.latestVersionDate ? new Date(repo.latestVersionDate).toLocaleString() : undefined}>{repo?.latestVersionDate ? `${new Date(repo.latestVersionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${timeAgo(repo.latestVersionDate)} ago` : 'Tag time unavailable'}</small></div>
          <div className="cell mapping-column-status">{mapping.noRepo ? <span className="mapping-status synced">✓ Mapped</span> : !mapping.repoPath ? <span className="mapping-status out-of-sync">Unmapped</span> : deploymentHours != null && deploymentHours < 4 ? <span className="mapping-status synced">✓ Deployed</span> : deploymentHours != null && deploymentHours <= 9 ? <span className="mapping-status synced">Deployed today</span> : <span className="mapping-status synced">✓ Mapped</span>}</div>
          {editing && <div className="cell mapping-column-actions mapping-row-actions"><button type="button" className="mapping-drag" aria-label="Drag to reorder" title="Drag to reorder">⠿</button><button type="button" className="mapping-remove" aria-label="Remove mapping" onClick={() => setDraft((previous) => previous.filter((item) => item.id !== mapping.id))}>×</button></div>}
        </div>;
      })}
      {!loading && visibleMappings.length === 0 && <div className="mapping-empty">{search || mappingFilter !== 'all' || deploymentAgeFilter !== 'all' ? 'No mappings match the current search and filter.' : 'No deployments found in this context’s default namespace.'}</div>}
    </div>
    {editing && <button className="mapping-add" type="button" onClick={addMapping}>＋ Add deployment mapping</button>}
    {tabMenu && <><button type="button" className="repo-context-backdrop mapping-menu-backdrop" aria-label="Close tab menu" onClick={() => setTabMenu(null)} /><div className="repo-context-menu mapping-row-menu" style={{ left: tabMenu.x, top: tabMenu.y }}><div className="repo-context-heading">{tabs.find((tab) => tab.id === tabMenu.id)?.name ?? 'Mapping tab'}</div><button type="button" onClick={() => { const target = tabs.find((tab) => tab.id === tabMenu.id); setTabMenu(null); if (target) setDeleteTabTarget(target); }}><span>Delete tab…</span></button></div></>}
    {contextMenu && <><button type="button" className="repo-context-backdrop mapping-menu-backdrop" aria-label="Close row menu" onClick={() => setContextMenu(null)} /><div className="repo-context-menu mapping-row-menu" style={{ left: contextMenu.x, top: contextMenu.y }}><div className="repo-context-heading">Mapping row</div><button type="button" onClick={() => { const mapping = draft.find((item) => item.id === contextMenu.id); if (mapping) openDetailDrawer(mapping); }}><span>View details</span><kbd>V</kbd></button><button type="button" onClick={() => { const mapping = draft.find((item) => item.id === contextMenu.id); if (mapping) openEditDrawer(mapping); }}><span>Edit mapping</span></button></div></>}
    {deleteTabTarget && <><button type="button" className="dashboard-drawer-backdrop" aria-label="Cancel deleting mapping tab" onClick={() => setDeleteTabTarget(null)} /><aside className="dashboard-detail-drawer mapping-edit-drawer" role="dialog" aria-modal="true" aria-label="Confirm mapping tab deletion"><header className="dashboard-drawer-header"><div><span className="about-drawer-eyebrow">Delete mapping tab</span><h2>Delete “{deleteTabTarget.name}”?</h2></div><button type="button" className="dashboard-drawer-close" aria-label="Cancel" onClick={() => setDeleteTabTarget(null)}>×</button></header><div className="dashboard-drawer-body mapping-edit-body"><p>This removes the tab and its saved mappings and refreshed deployment data.</p></div><footer className="dashboard-drawer-footer"><button type="button" className="mapping-button secondary" onClick={() => setDeleteTabTarget(null)}>Cancel</button><button type="button" className="mapping-button danger" onClick={() => { closeTab(deleteTabTarget.id); setDeleteTabTarget(null); }}>Delete tab</button></footer></aside></>}
    {drawerDraft && <><button type="button" className="dashboard-drawer-backdrop" aria-label="Close mapping editor" onClick={closeEditDrawer} /><aside className="dashboard-detail-drawer mapping-edit-drawer" role="dialog" aria-modal="true" aria-label="Edit deployment mapping">
      <header className="dashboard-drawer-header"><div><span className="about-drawer-eyebrow">Mapping editor</span><h2>{drawerDraft.deployment || 'Deployment mapping'}</h2></div><button type="button" className="dashboard-drawer-close" aria-label="Close editor" onClick={closeEditDrawer}>×</button></header>
      <div className="dashboard-drawer-body mapping-edit-body"><div className="mapping-edit-context"><span>Context</span><strong>{drawerDraft.context} · default</strong></div>
        <label className="mapping-edit-field"><span>Deployment</span><SearchableSelect label="Deployment" value={`${drawerDraft.context}/default/${drawerDraft.deployment}`} placeholder="Search deployment…" options={deployments.map((item) => ({ value: deploymentKey(item), label: item.name }))} onChange={(value) => { const selected = deployments.find((item) => deploymentKey(item) === value); if (selected) setDrawerDraft((current) => current ? { ...current, context: selected.context, namespace: 'default', deployment: selected.name, repoPath: current.repoPath || initialRepo(selected, repos), imageVersionOverride: '' } : current); }} /></label>
        <label className="mapping-edit-field"><span>Git repository</span><SearchableSelect label="Git repository" value={drawerDraft.repoPath} placeholder={drawerDraft.noRepo ? 'No repository required' : 'Search repository…'} options={repos.map((item) => ({ value: item.path, label: item.name }))} onChange={(value) => setDrawerDraft((current) => current ? { ...current, repoPath: value, noRepo: false } : current)} /></label>
        <label className="mapping-no-repo-option"><input type="checkbox" checked={!!drawerDraft.noRepo} onChange={(event) => setDrawerDraft((current) => current ? { ...current, noRepo: event.target.checked } : current)} /><span><strong>No repository for this deployment</strong><small>Count this deployment as mapped without comparing a Git image tag.</small></span></label>
        <label className="mapping-edit-field"><span>Deployed image version override</span><input value={drawerDraft.imageVersionOverride ?? ''} placeholder="Use the deployment image tag" onChange={(event) => setDrawerDraft((current) => current ? { ...current, imageVersionOverride: event.target.value } : current)} /></label>
        <label className="mapping-edit-field"><span>Base branch</span><input value={drawerDraft.baseBranch ?? ''} placeholder={`Global default: ${baseBranch}`} onChange={(event) => setDrawerDraft((current) => current ? { ...current, baseBranch: event.target.value || undefined } : current)} /></label>
        <p className="mapping-edit-help">Leave empty to use the workspace’s global base branch ({baseBranch}).</p>
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
      const mergedPRs = detailPRs.filter((pr) => pr.state.toLowerCase() === 'merged');
      const closedPRs = detailPRs.filter((pr) => !['open', 'merged'].includes(pr.state.toLowerCase()));
      const closedAndMergedPRCount = closedPRs.length + mergedPRs.length;
      const renderPRGroup = (label: string, prs: PR[]) => <div className="mapping-pr-group" key={label}><h4>{label} <span>{prs.length}</span></h4>{prs.length ? <div className="mapping-pr-list">{prs.map((pr) => <button type="button" className="mapping-pr-item" key={`${pr.repoName}-${pr.number}`} onClick={() => onOpenPR(pr)}><span className="mapping-pr-title">#{pr.number} · {pr.title}</span><span className="mapping-pr-meta">{pr.author} · {pr.sourceBranch} → {pr.targetBranch}</span></button>)}</div> : <div className="mapping-pr-state">None</div>}</div>;
      return <><button type="button" className="dashboard-drawer-backdrop" aria-label="Close mapping details" onClick={() => setDetailMappingId('')} /><aside className="dashboard-detail-drawer mapping-detail-drawer" role="dialog" aria-modal="true" aria-label="Mapping details" style={{ width: `${detailDrawerWidth}px` }}>
        <div className="mapping-detail-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize mapping details drawer" title="Drag to resize" onPointerDown={(event) => { detailResize.current = { pointerId: event.pointerId, x: event.clientX, width: detailDrawerWidth }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const resize = detailResize.current; if (!resize || resize.pointerId !== event.pointerId) return; const maxWidth = Math.min(900, window.innerWidth - 80); setDetailDrawerWidth(Math.max(320, Math.min(maxWidth, resize.width + resize.x - event.clientX))); }} onPointerUp={(event) => { if (detailResize.current?.pointerId === event.pointerId) detailResize.current = null; }} onPointerCancel={() => { detailResize.current = null; }} />
        <header className="dashboard-drawer-header">
          <div><span className="about-drawer-eyebrow">Mapping details · drag left edge to resize</span><h2>{mapping.deployment}</h2></div><button type="button" className="dashboard-drawer-close" aria-label="Close mapping details" onClick={() => setDetailMappingId('')}>×</button>
        </header>
        <div className="dashboard-drawer-body mapping-detail-body">
          <span className={`dashboard-drawer-badge ${mapping.noRepo || matched ? 'is-good' : deployed && latest ? 'is-bad' : 'is-warning'}`}><span />{mapping.noRepo || mapping.repoPath ? matched ? 'Synced' : deployed && latest ? 'Not synced' : 'Mapped' : 'Unmapped'}</span>
          <section className="dashboard-drawer-section"><h3>Deployment</h3><div className="dashboard-drawer-facts"><div className="dashboard-drawer-fact"><span>Cluster context</span><strong>{mapping.context}</strong></div><div className="dashboard-drawer-fact"><span>Namespace</span><strong>{mapping.namespace || 'Default'}</strong></div><div className="dashboard-drawer-fact"><span>Container image</span><strong>{deployment?.image?.split('/').pop() ?? 'Unavailable'}</strong></div><div className="dashboard-drawer-fact"><span>Running for</span><strong>{deploymentAge(deployment) || 'Unavailable'}</strong></div></div></section>
          <section className="dashboard-drawer-section"><h3>Git mapping</h3><div className="dashboard-drawer-facts"><div className="dashboard-drawer-fact"><span>Repository</span><strong>{mapping.noRepo ? 'No repository needed' : repo?.name ?? 'Not mapped'}</strong></div><div className="dashboard-drawer-fact"><span>Deployed version</span><strong>{deployed || 'Unavailable'}</strong></div><div className="dashboard-drawer-fact"><span>Latest Git tag</span><strong>{latest || 'Unavailable'}</strong></div><div className="dashboard-drawer-fact"><span>Latest tag created</span><strong>{tagDate ? `${tagDate.toLocaleDateString()} (${timeAgo(tagDate.toISOString())} ago)` : 'Unavailable'}</strong></div></div></section>
          <section className="dashboard-drawer-section mapping-pr-section"><h3>Pull requests <span className="mapping-pr-count">{closedAndMergedPRCount}</span></h3><p className="mapping-pr-branches">{releaseBranch || 'Release'} → {baseBranch || 'Base'}</p>
            {detailPRLoading ? <div className="mapping-pr-state">Loading pull requests…</div>
              : detailPRError ? <div className="mapping-pr-state mapping-error">{detailPRError}</div>
                : !repo || mapping.noRepo ? <div className="mapping-pr-state">Map a Git repository to see its pull requests.</div>
                  : !token.trim() ? <div className="mapping-pr-state">Add an access token in workspace settings to load pull requests.</div>
                    : closedAndMergedPRCount === 0 ? <><div className="mapping-pr-state">No merged or closed pull requests from {releaseBranch || 'the release branch'} to {baseBranch || 'the base branch'}{detailPRHasMore ? ' in the first 100 closed PRs.' : '.'}</div>{detailPRHasMore && <div className="mapping-pr-state">More closed PRs exist beyond the single-page lookup.</div>}</>
                      : <><div className="mapping-pr-groups">{renderPRGroup('Merged', mergedPRs)}{renderPRGroup('Closed', closedPRs)}</div>{detailPRHasMore && <div className="mapping-pr-state">Showing matches from the first 100 PRs; more may exist.</div>}</>}
          </section>
        </div>
      </aside></>;
    })()}
  </section>;
}
