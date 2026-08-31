import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AppConfig, RepoState, View, CommitDetail, PR, PRDetail, JiraIssue, ConfigField, ThemeMode, Workspace, KubeContext, KubeDeploymentSummary, KubeContextTab, KubeWorkloadTab, KubeCompareTab } from '../core/types.js';
import { getVisibleConfigFields, KUBE_RESOURCE_OPTIONS, WORKSPACE_COLORS } from '../core/types.js';
import { getPRsUrl } from '../core/urls.js';
import { TopBar } from './components/TopBar';
import { BottomBar } from './components/BottomBar';
import { RepoList } from './components/RepoList';
import { CommitsView } from './components/CommitsView';
import { DetailView } from './components/DetailView';
import { ConfigDialog } from './components/ConfigDialog';
import { PRsView } from './components/PRsView';
import { PRDetailView } from './components/PRDetailView';
import { ReviewView } from './components/ReviewView';
import { K8sView, KubeConfirmDialog, KubeDescribeDialog } from './components/K8sView';
import { CommandBar } from './components/CommandBar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { WorkspacePanel } from './components/WorkspacePanel';
import { AddWorkspaceDialog } from './components/AddWorkspaceDialog';
import { CloneDialog } from './components/CloneDialog';

function mergeKubeLogSnapshot(previous: string, next: string): string {
  if (!previous) return next;
  if (!next || next === previous) return previous;
  if (next.startsWith(previous)) return next;
  if (previous.endsWith(next)) return previous;
  const maxOverlap = Math.min(previous.length, next.length);
  for (let length = maxOverlap; length > 0; length -= 1) {
    if (previous.slice(-length) === next.slice(0, length)) {
      return previous + next.slice(length);
    }
  }
  return `${previous}${previous.endsWith('\n') ? '' : '\n'}${next}`;
}

function containerStatusMap(json: string): Record<string, string> {
  try {
    const pod = JSON.parse(json) as any;
    return Object.fromEntries((pod?.status?.containerStatuses ?? []).map((container: any) => {
      const waiting = container?.state?.waiting;
      const terminated = container?.state?.terminated;
      const status = waiting?.reason
        ?? (terminated ? (terminated.exitCode === 0 ? 'Succeeded' : (terminated.reason || 'Error')) : undefined)
        ?? (container?.state?.running ? (container.ready ? 'Running' : 'Running (not ready)') : 'Unknown');
      return [container.name, status];
    }));
  } catch {
    return {};
  }
}

type KubeConfirmAction = {
  type: 'deployment' | 'all-deployments' | 'delete-resource';
  context: string;
  namespace: string;
  name?: string;
  kind?: string;
  kindLabel?: string;
  tabId: string;
};

type StatusTone = 'success' | 'error' | 'warning';

export function App() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [repos, setRepos] = useState<RepoState[]>([]);
  const [repoPaths, setRepoPaths] = useState<string[]>([]);
  const [view, setView] = useState<View>('list');
  const [selectedRepo, setSelectedRepo] = useState(0);
  const [selectedCommit, setSelectedCommit] = useState(0);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [lastSync, setLastSync] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const [workspacePath, setWorkspacePath] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState<StatusTone>('success');
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Workspace management
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Auto-clear status message after 8 seconds
  const showStatus = useCallback((msg: string, isError = false, isWarning = false) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusMessage(msg);
    setStatusTone(isError ? 'error' : isWarning ? 'warning' : 'success');
    if (!isError) {
      statusTimerRef.current = setTimeout(() => setStatusMessage(''), 8000);
    }
  }, []);

  // Config dialog
  const [showConfig, setShowConfig] = useState(false);

  // Clone dialog
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [showAddWorkspace, setShowAddWorkspace] = useState(false);
  const [editWorkspace, setEditWorkspace] = useState<Workspace | null>(null);

  // Search / Command
  const [inputMode, setInputMode] = useState<'none' | 'search' | 'command'>('none');
  const [searchQuery, setSearchQuery] = useState('');

  // PR state
  const [prs, setPRs] = useState<PR[]>([]);
  const [selectedPR, setSelectedPR] = useState(0);
  const [prLoading, setPRLoading] = useState(false);
  const [prError, setPRError] = useState('');
  const [prFilter, setPRFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [prAllRepos, setPrAllRepos] = useState(false);
  const [prDetail, setPRDetail] = useState<PRDetail | null>(null);
  const [prDetailLoading, setPRDetailLoading] = useState(false);
  const [prDetailError, setPRDetailError] = useState('');

  // Review state
  const [reviewContext, setReviewContext] = useState<{
    repoPath: string; prNumber: number; returnView: 'prs' | 'prdetail';
  }>({ repoPath: '', prNumber: 0, returnView: 'prs' });
  const [reviewJira, setReviewJira] = useState<JiraIssue | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  // Guards against stale async review/Jira results overwriting a newer review
  const reviewGenRef = useRef(0);
  // Token-owner GitHub login + local git user name (for comment display)
  const [ownAuthor, setOwnAuthor] = useState('');
  const [gitUserName, setGitUserName] = useState('');

  // Kubernetes state
  const [kubeContexts, setKubeContexts] = useState<KubeContext[]>([]);
  const [kubeContextTabs, setKubeContextTabs] = useState<KubeContextTab[]>([]);
  const [kubeWorkloadTabs, setKubeWorkloadTabs] = useState<KubeWorkloadTab[]>([]);
  const [kubeActiveTab, setKubeActiveTab] = useState(''); // '' | 'compare' | context/workload tab id
  const [kubeCompareTab, setKubeCompareTab] = useState<KubeCompareTab | null>(null);
  const [kubeError, setKubeError] = useState('');
  const [kubeConfirm, setKubeConfirm] = useState<KubeConfirmAction | null>(null);
  const [kubeDescription, setKubeDescription] = useState<{ title: string; json: string; query: string; error?: string } | null>(null);

  // Recognize which GitHub account the token belongs to
  useEffect(() => {
    if (cfg?.token && cfg.provider === 'github') {
      window.api.getGitHubUser(cfg.token).then((u) => {
        if (u?.login) setOwnAuthor(u.login);
      }).catch(() => { /* non-fatal */ });
    }
  }, [cfg?.token, cfg?.provider]);

  // Local git identity for the currently selected repo
  const currentRepoPath = repos[selectedRepo]?.path;
  useEffect(() => {
    if (currentRepoPath) {
      window.api.getGitUser(currentRepoPath).then((u) => setGitUserName(u.name)).catch(() => { /* non-fatal */ });
    } else {
      setGitUserName('');
    }
  }, [currentRepoPath]);

  // ─── Initialize ──────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const wsList = await window.api.loadWorkspaces();
        setWorkspaces(wsList);

        let config: AppConfig | null = null;
        let wsId: string | null = null;

        if (wsList.length > 0) {
          // Use the last active workspace (saved to active-workspace file), or first one
          const activeId = await window.api.loadActiveWorkspaceId();
          wsId = (activeId as string) || wsList[0]!.id;
          if (wsId) {
            try {
              config = await window.api.activateWorkspace(wsId);
            } catch { config = null; }
          }
        }

        // Fallback: load legacy global config
        if (!config) {
          config = await window.api.initialize({});
        }

        // Auto-create workspace from legacy config if workspace list is empty
        if (wsList.length === 0 && config.workspace) {
          const normalizedPath = config.workspace.replace(/\/+$/, '');
          const name = normalizedPath.split('/').pop() ?? normalizedPath;
          const legacyWs: Workspace = {
            id: normalizedPath,
            name,
            displayName: name,
            path: normalizedPath,
            color: WORKSPACE_COLORS[0] ?? '#3b82f6',
            isDefault: true,
            config: { ...config, workspace: normalizedPath },
          };
          await window.api.addWorkspace(legacyWs);
          wsList.push(legacyWs);
          setWorkspaces([...wsList]);
          wsId = normalizedPath;
        }

        setCfg(config);
        setWorkspacePath(config.workspace || '');
        if (wsId) setActiveWorkspaceId(wsId);
        // Set initial view from config
        if (config.defaultView === 'prs') {
          setView('prs');
          // PR fetch will trigger via initialSyncDone effect
        }

        if (config.workspace) {
          const paths = await window.api.findRepos(config.workspace);
          setRepoPaths(paths);

          const cache = await window.api.loadCache(config.workspace);
          let initialRepos: RepoState[];
          let lastSyncTime = '';

          if (cache && cache.base === config.base && cache.release === config.release) {
            initialRepos = paths.map((p: string) => {
              const name = p.split('/').pop() ?? p;
              const cached = cache.repos.find((r: RepoState) => r.name === name);
              return cached
                ? { ...cached, status: 'stale' as const }
                : { name, path: p, status: 'stale' as const, diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null, currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: null };
            });
            lastSyncTime = cache.lastFullSync;
          } else {
            initialRepos = paths.map((p: string) => ({
              name: p.split('/').pop() ?? p, path: p, status: 'stale' as const,
              diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null,
              currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: null,
            }));
          }

          if (cache?.prs) setPRs(cache.prs);
          setRepos(initialRepos);
          setLastSync(lastSyncTime);
        }
      } catch (err) {
        setStatusMessage('Failed to initialize: ' + (err instanceof Error ? err.message : String(err)));
      }
    })();
  }, []);

  // ─── Theme ────────────────────────────────────────────────────────────────

  const effectiveTheme = (() => {
    if (!cfg || cfg.theme === 'system') {
      try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } catch { return 'dark'; }
    }
    return cfg.theme;
  })();

  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === 'light') {
      root.classList.add('theme-light');
    } else {
      root.classList.remove('theme-light');
    }
  }, [effectiveTheme]);

  // Listen for system theme changes
  useEffect(() => {
    if (!cfg || cfg.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { setCfg((prev) => prev ? { ...prev } : prev); }; // force re-render
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [cfg?.theme]);

  const toggleTheme = useCallback(() => {
    setCfg((prev) => {
      if (!prev) return prev;
      const order: ThemeMode[] = ['dark', 'light', 'system'];
      const idx = order.indexOf(prev.theme);
      const next = order[(idx + 1) % order.length];
      window.api.saveConfig({ ...prev, theme: next });
      return { ...prev, theme: next };
    });
  }, []);

  // ─── Workspace Management ─────────────────────────────────────────────────

  const switchWorkspace = useCallback(async (ws: Workspace) => {
    try {
      const config = await window.api.activateWorkspace(ws.id);
      setActiveWorkspaceId(ws.id);
      setCfg(config);
      setWorkspacePath(config.workspace);
      setPRs([]);
      // Reset any stale loading state from a previous/sync that might have been interrupted
      setIsSyncing(false);
      setSyncProgress({ done: 0, total: 0 });
      let newRepos: RepoState[] = [];
      if (config.workspace) {
        const paths = await window.api.findRepos(config.workspace);
        setRepoPaths(paths);
        const cache = await window.api.loadCache(config.workspace);
        let lastSyncTime = '';
        if (cache && cache.base === config.base && cache.release === config.release) {
          newRepos = paths.map((p: string) => {
            const name = p.split('/').pop() ?? p;
            const cached = cache.repos.find((r: RepoState) => r.name === name);
            return cached ? { ...cached, status: 'stale' as const } : { name, path: p, status: 'stale' as const, diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null, currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: null };
          });
          if (cache?.prs) setPRs(cache.prs);
          lastSyncTime = cache.lastFullSync;
          setLastSync(lastSyncTime);
        } else {
          newRepos = paths.map((p: string) => ({ name: p.split('/').pop() ?? p, path: p, status: 'stale' as const, diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null, currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: null }));
        }
        setRepos(newRepos);
        // Repos will be synced on initial load via the initialSyncDone effect.
        // On workspace switch, just show cached data without syncing all repos again.
      }
      setView(config.defaultView === 'prs' ? 'prs' : 'list');
      setSelectedRepo(0);
      // Load PRs immediately if default view is PRs.
      // Pass newRepos directly to avoid stale reposRef before React re-render.
      if (config.defaultView === 'prs' && config.token) {
        fetchAllPRsRef.current(undefined, newRepos);
      }
    } catch (err) {
      console.error('switchWorkspace error:', err);
      showStatus('Failed to switch workspace: ' + (err instanceof Error ? err.message : String(err)), true);
    }
  }, []);

  // Sync all repos with given config directly (bypasses stale closure in syncAll)
  const syncOneRepoDirect = useCallback(async (paths: string[], config: AppConfig) => {
    setIsSyncing(true);
    setSyncProgress({ done: 0, total: paths.length });
    const results: RepoState[] = [];
    let done = 0;
    for (const p of paths) {
      try {
        const result = await window.api.syncOneRepo(p, config.base, config.release);
        results.push(result);
      } catch (err) {
        results.push({ name: p.split('/').pop() ?? p, path: p, status: 'error' as const, diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null, currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: err instanceof Error ? err.message : String(err) });
      }
      done++;
      setSyncProgress({ done, total: paths.length });
      setRepos((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex((r) => r.path === p);
        if (idx !== -1) updated[idx] = results[results.length - 1]!;
        return updated;
      });
    }
    setLastSync(new Date().toISOString());
    setIsSyncing(false);
    try {
      await window.api.saveCache({ workspace: config.workspace, base: config.base, release: config.release, lastFullSync: new Date().toISOString(), repos: results });
    } catch {}
  }, []);

  const updateWorkspace = useCallback(async (ws: Workspace) => {
    setWorkspaces((prev) => prev.map((w) => w.id === ws.id ? ws : w));
    try {
      const current = await window.api.loadWorkspaces();
      const updated = current.map((w: Workspace) => w.id === ws.id ? ws : w);
      await window.api.saveWorkspaces(updated);
    } catch { /* non-fatal */ }
  }, []);

  const handleChangeView = useCallback(async (newView: 'list' | 'prs' | 'k8s') => {
    setView(newView);
    if (newView !== 'k8s') {
      if (cfg) {
        const updatedCfg = { ...cfg, defaultView: newView };
        setCfg(updatedCfg);
        if (activeWorkspaceId) {
          await window.api.saveWorkspaceConfig(activeWorkspaceId, updatedCfg);
        } else {
          await window.api.saveConfig(updatedCfg);
        }
      }
      // Auto-fetch PRs when switching to PR view
      if (newView === 'prs' && repos.length > 0 && cfg?.token) {
        setPRError('');
        fetchAllPRsRef.current();
      }
      return;
    }
    // Kubernetes view — load contexts on first entry, otherwise show the first context tab
    setKubeError('');
    if (kubeContextTabsRef.current.length === 0) {
      loadKubeContextsRef.current();
    } else {
      setKubeActiveTab(kubeContextTabsRef.current[0]!.id);
    }
  }, [cfg, activeWorkspaceId, repos, kubeContextTabs.length]);

  // ─── Workspace Selection ──────────────────────────────────────────────────

  const selectWorkspace = useCallback(async () => {
    setShowAddWorkspace(true);
  }, []);

  const handleAddWorkspaceSave = useCallback(async (folder: string, base: string, release: string, syncInterval: number) => {
    setShowAddWorkspace(false);
    const normalizedPath = folder.replace(/\/+$/, '');
    // Check if workspace with this path already exists
    const existing = workspaces.find((w) => w.path === normalizedPath || w.path === folder);
    if (existing) {
      // Update existing workspace's branches/interval
      const updated = {
        ...existing,
        config: { ...existing.config, base, release, syncInterval },
      };
      await window.api.saveWorkspaceConfig(updated.id, updated.config);
      // Also update the workspaces list
      const allWs = await window.api.loadWorkspaces();
      const idx = allWs.findIndex((w) => w.id === updated.id);
      if (idx !== -1) {
        allWs[idx] = updated;
        await window.api.saveWorkspaces(allWs);
      }
      setWorkspaces(allWs);
      await switchWorkspace(updated);
      return;
    }
    const name = normalizedPath.split('/').pop() ?? normalizedPath;
    const color = WORKSPACE_COLORS[workspaces.length % WORKSPACE_COLORS.length] ?? '#3b82f6';
    const isDefault = workspaces.length === 0;
    const ws: Workspace = {
      id: normalizedPath,
      name,
      path: normalizedPath,
      color,
      isDefault,
      config: {
        workspace: normalizedPath,
        base,
        release,
        syncInterval,
        token: cfg?.token ?? '',
        provider: cfg?.provider ?? 'github',
        taskProvider: cfg?.taskProvider ?? 'none',
        jiraUrl: cfg?.jiraUrl ?? '',
        jiraEmail: cfg?.jiraEmail ?? '',
        jiraApiToken: cfg?.jiraApiToken ?? '',
        aiProvider: cfg?.aiProvider ?? 'none',
        aiApiKey: cfg?.aiApiKey ?? '',
        aiApiUrl: cfg?.aiApiUrl ?? '',
        aiModel: cfg?.aiModel ?? '',
        aiSystemPrompt: cfg?.aiSystemPrompt ?? '',
        theme: cfg?.theme ?? 'system',
      },
    };
    const wsList = await window.api.addWorkspace(ws);
    setWorkspaces(wsList);
    await switchWorkspace(ws);
  }, [workspaces, cfg, switchWorkspace]);

  const handleEditWorkspaceSave = useCallback(async (
    id: string, name: string, folder: string, base: string, release: string, syncInterval: number
  ) => {
    setEditWorkspace(null);
    try {
      // Read fresh workspace list from IPC to avoid stale closure
      const currentWorkspaces = await window.api.loadWorkspaces();
      const ws = currentWorkspaces.find((w: Workspace) => w.id === id);
      if (!ws) {
        showStatus('Workspace not found for editing', true);
        return;
      }
      const updated: Workspace = {
        ...ws,
        name,
        displayName: name,
        path: folder,
        config: { ...ws.config, base, release, syncInterval, workspace: folder },
      };
      // Save config to per-workspace file
      const configId = updated.path;
      await window.api.saveWorkspaceConfig(configId, updated.config);
      // Update workspaces list: replace the entry
      const newList = currentWorkspaces.map((w: Workspace) =>
        w.id === id ? { ...updated, id: configId } : w
      );
      await window.api.saveWorkspaces(newList);
      setWorkspaces(newList);
      if (id === activeWorkspaceId) {
        setActiveWorkspaceId(configId);
        setWorkspacePath(updated.path);
        setCfg({ ...cfg!, ...updated.config });
      }
    } catch (err) {
      console.error('handleEditWorkspaceSave error:', err);
      showStatus('Failed to save workspace changes: ' + (err instanceof Error ? err.message : String(err)), true);
    }
  }, [activeWorkspaceId, cfg]);

  // Simple folder picker — just returns path, no side effects
  const browseWorkspace = useCallback(async (): Promise<string | null> => {
    try {
      return await window.api.selectWorkspace();
    } catch {
      return null;
    }
  }, []);

  // ─── Sync ─────────────────────────────────────────────────────────────────

  const syncAll = useCallback(async () => {
    if (!cfg || repoPaths.length === 0) return;
    setIsSyncing(true);
    setSyncProgress({ done: 0, total: repoPaths.length });

    const results: RepoState[] = new Array(repoPaths.length);
    let completed = 0;

    const promises = repoPaths.map((path, i) =>
      window.api.syncOneRepo(path, cfg.base, cfg.release)
        .then((result) => {
          results[i] = result;
          completed++;
          setRepos((prev) => {
            if (i >= prev.length) return prev;
            const next = [...prev];
            next[i] = result;
            return next;
          });
          setSyncProgress({ done: completed, total: repoPaths.length });
        })
        .catch((err) => {
          const errorResult: RepoState = {
            name: path.split('/').pop() ?? path,
            path,
            status: 'error',
            diffCommits: [], latestCommits: [],
            latestVersion: null, latestVersionDate: null,
            currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '',
            error: err instanceof Error ? err.message : String(err),
          };
          results[i] = errorResult;
          completed++;
          setRepos((prev) => {
            if (i >= prev.length) return prev;
            const next = [...prev];
            next[i] = errorResult;
            return next;
          });
          setSyncProgress({ done: completed, total: repoPaths.length });
        })
    );

    await Promise.allSettled(promises);
    setLastSync(new Date().toISOString());
    setIsSyncing(false);

    try {
      await window.api.saveCache({
        workspace: cfg.workspace,
        base: cfg.base,
        release: cfg.release,
        lastFullSync: new Date().toISOString(),
        repos: results,
        prs: prs,
      });
    } catch { /* non-fatal */ }
  }, [cfg, repoPaths, prs]);

  const syncOne = useCallback(async (repoPath: string) => {
    if (!cfg) return;
    try {
      const result = await window.api.syncOneRepo(repoPath, cfg.base, cfg.release);
      setRepos((prev) => prev.map((r) => r.path === repoPath ? result : r));
      const now = new Date().toISOString();
      setLastSync(now);
      // Save cache
      await window.api.saveCache({
        workspace: cfg.workspace,
        base: cfg.base,
        release: cfg.release,
        lastFullSync: now,
        repos: repos.map((r) => r.path === repoPath ? result : r),
        prs: prs,
      });
    } catch (err) {
      setStatusMessage('Sync failed for ' + repoPath.split('/').pop());
    }
  }, [cfg, repos, prs]);

  // ─── Sync Progress Listener ─────────────────────────────────────────────

  const syncProgressRef = useRef(syncProgress);
  useEffect(() => {
    let rafId: number | null = null;
    const cleanup = window.api.onSyncProgress((progress) => {
      syncProgressRef.current = progress;
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          setSyncProgress(syncProgressRef.current);
        });
      }
    });
    return () => {
      cleanup();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // ─── Initial Sync on Startup ────────────────────────────────────────────

  const initialSyncDoneRef = useRef(false);

  useEffect(() => {
    if (!cfg || repoPaths.length === 0 || initialSyncDoneRef.current) return;
    initialSyncDoneRef.current = true;
    syncAll().then(() => {
      if (cfg.defaultView === 'prs' && cfg.token) {
        fetchAllPRsRef.current();
      }
    });
  }, [cfg, repoPaths, syncAll]);

  // ─── Auto-sync ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!cfg || cfg.syncInterval <= 0) return;
    const interval = setInterval(syncAll, cfg.syncInterval * 60 * 1000);
    return () => clearInterval(interval);
  }, [cfg, syncAll]);

  // ─── PR Fetching ─────────────────────────────────────────────────────────

  const fetchPRsForRepo = useCallback(async (repoPath: string, filterOverride?: 'open' | 'closed' | 'all') => {
    if (!cfg) return;
    const filter = filterOverride ?? prFilter;
    setPRLoading(true);
    setPRError('');
    try {
      // Validate config before API calls
      if (!cfg.token || cfg.token.trim() === '') {
        setPRError('API token not configured. Press e to open settings and add your token.');
        setPRLoading(false);
        return;
      }

      const remoteInfo = await window.api.getRemoteOwnerRepo(repoPath);
      if (!remoteInfo) {
        setPRError('Could not detect remote repository URL. Make sure the repo has a remote origin configured.');
        setPRLoading(false);
        return;
      }
      let provider = cfg.provider;
      if (!provider) {
        const remoteUrl = await window.api.getRemoteUrl(repoPath);
        provider = await window.api.detectProvider(remoteUrl);
      }
      if (!provider) {
        setPRError('Could not determine provider (github/gitlab/bitbucket). Set it in settings (press e).');
        setPRLoading(false);
        return;
      }
      const result = await window.api.fetchPRs(remoteInfo.owner, remoteInfo.repo, provider, cfg.token, undefined, filter);
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPRs(result);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.includes('401')) {
        setPRError('Authentication failed. Your API token may be invalid or expired. Press e to update it.');
      } else if (raw.includes('403')) {
        setPRError('Access forbidden. Your token may lack permissions for this repository.');
      } else if (raw.includes('404')) {
        setPRError('Repository or pull requests not found. Check the remote URL and repository name.');
      } else if (raw.includes('rate limit') || raw.includes('429')) {
        setPRError('API rate limit exceeded. Wait a few minutes and try again.');
      } else {
        setPRError(`${raw}`);
      }
    }
    setPRLoading(false);
  }, [cfg, prFilter]);

  const fetchAllPRs = useCallback(async (filterOverride?: 'open' | 'closed' | 'all', reposOverride?: RepoState[]) => {
    const currentCfg = cfgRef.current;
    const currentRepos = reposOverride ?? reposRef.current;
    if (!currentCfg || currentRepos.length === 0) return;
    const filter = filterOverride ?? prFilter;
    setPRLoading(true);
    setPRError('');
    setPRs([]);
    const errors: string[] = [];
    let completed = 0;
    let loadedCount = 0;

    const fetchOne = async (repo: RepoState) => {
      try {
        const remoteInfo = await window.api.getRemoteOwnerRepo(repo.path);
        if (!remoteInfo) return;
        let provider = currentCfg.provider;
        if (!provider) {
          const remoteUrl = await window.api.getRemoteUrl(repo.path);
          provider = await window.api.detectProvider(remoteUrl);
        }
        if (!provider) return;
        const result = await window.api.fetchPRs(remoteInfo.owner, remoteInfo.repo, provider, currentCfg.token, repo.name, filter);
        if (result.length > 0) {
          loadedCount++;
          setPRs((prev) => {
            const merged = [...prev, ...result];
            merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return merged;
          });
        }
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        // Map common API errors to user-friendly messages
        let friendly = `${repo.name}: `;
        if (raw.includes('401')) {
          friendly += 'Authentication failed. Your token may be invalid or expired.';
        } else if (raw.includes('403')) {
          friendly += 'Access forbidden. Your token may lack permissions for this repository.';
        } else if (raw.includes('404')) {
          friendly += 'Repository or pull requests not found. Check the remote URL and repository name.';
        } else if (raw.includes('rate limit') || raw.includes('429')) {
          friendly += 'API rate limit exceeded. Wait a few minutes and try again.';
        } else {
          friendly += raw;
        }
        errors.push(friendly);
      }
    };

    const promises = currentRepos.map((repo) =>
      fetchOne(repo).finally(() => {
        completed++;
      })
    );

    await Promise.allSettled(promises);

    // Only show error if NO PRs loaded at all — partial results keep PR list visible
    if (errors.length > 0 && loadedCount === 0) {
      setPRError(errors.length === 1 ? errors[0]! : `Failed for ${errors.length} repo(s). Check your token and network.`);
    }
    setPRLoading(false);
  }, [cfg, repos, prFilter]);

  // ─── Kubernetes ─────────────────────────────────────────────────────────

  // Create a context tab (fetch its namespaces + deployments); activates it when asked.
  const createKubeContextTab = useCallback(async (ctxName: string, activate: boolean) => {
    const existing = kubeContextTabsRef.current.find((t) => t.id === ctxName);
    if (existing) {
      if (activate) setKubeActiveTab(ctxName);
      return;
    }
    const ctxObj = kubeContextsRef.current.find((c) => c.name === ctxName);
    const defaultNs = ctxObj?.namespace || 'default';
    const tab: KubeContextTab = {
      id: ctxName, context: ctxName, namespace: defaultNs, namespaces: [],
      kind: 'pods', resources: { kind: 'pods', columns: [], items: [] },
      podFilters: ['ReplicaSet'], watch: false, watchInterval: 1,
      selected: 0, loading: true, error: '',
    };
    setKubeContextTabs((prev) => [...prev, tab]);
    if (activate) setKubeActiveTab(ctxName);
    try {
      // Fetch namespaces and the default pod list in parallel.
      const [nsList, res] = await Promise.all([
        window.api.k8sNamespaces(ctxName).catch(() => []),
        window.api.k8sResources(ctxName, defaultNs, 'pods'),
      ]);
      setKubeContextTabs((prev) => prev.map((t) => t.id === ctxName ? { ...t, namespaces: nsList, resources: res, loading: false } : t));
    } catch (err) {
      setKubeContextTabs((prev) => prev.map((t) => t.id === ctxName ? { ...t, loading: false, error: err instanceof Error ? err.message : String(err) } : t));
    }
  }, []);

  // First entry: build the first context tab from the LAST selected context
  // (remembered across launches), falling back to the kubeconfig current context.
  const loadKubeContexts = useCallback(async () => {
    setKubeError('');
    try {
      const ctxs = await window.api.k8sContexts();
      setKubeContexts(ctxs);
      if (ctxs.length === 0) {
        setKubeError('No Kubernetes contexts found in your kubeconfig (~/.kube/config). Add a cluster and try again.');
        return;
      }
      const saved = await window.api.loadKubeContext().catch(() => null);
      const start = ctxs.find((c) => c.name === saved) ?? ctxs.find((c) => c.current) ?? ctxs[0]!;
      await createKubeContextTab(start.name, true);
    } catch (err) {
      setKubeError(err instanceof Error ? err.message : String(err));
    }
  }, [createKubeContextTab]);

  // Open (or activate) a context in its own tab; remember it as the last selected context.
  const openKubeContextTab = useCallback(async (ctxName: string) => {
    await createKubeContextTab(ctxName, true);
    window.api.saveKubeContext(ctxName);
  }, [createKubeContextTab]);

  // Change the namespace of a context tab and reload its current resource list.
  const handleKubeTabNamespaceChange = useCallback(async (tabId: string, ns: string) => {
    const kind = kubeContextTabsRef.current.find((t) => t.id === tabId)?.kind ?? 'deployments';
    const hasRows = (kubeContextTabsRef.current.find((t) => t.id === tabId)?.resources.items.length ?? 0) > 0;
    setKubeContextTabs((prev) => prev.map((t) => t.id === tabId ? {
      ...t,
      namespace: ns,
      loading: !hasRows,
      error: '',
      resources: hasRows ? { ...t.resources, items: t.resources.items.map((item) => ({ ...item, loading: true })) } : t.resources,
    } : t));
    try {
      const res = await window.api.k8sResources(tabId, ns, kind);
      setKubeContextTabs((prev) => prev.map((t) => t.id === tabId ? {
        ...t, resources: { ...res, items: res.items.map((item) => ({ ...item, loading: false })) }, selected: 0, loading: false,
      } : t));
    } catch (err) {
      setKubeContextTabs((prev) => prev.map((t) => t.id === tabId ? {
        ...t, loading: false, error: err instanceof Error ? err.message : String(err),
        resources: { ...t.resources, items: t.resources.items.map((item) => ({ ...item, loading: false })) },
      } : t));
    }
  }, []);

  // Switch the resource kind of a context tab (deployments → pods → configmaps …).
  const handleKubeTabKindChange = useCallback(async (tabId: string, kind: string) => {
    const ns = kubeContextTabsRef.current.find((t) => t.id === tabId)?.namespace ?? 'default';
    const hasRows = (kubeContextTabsRef.current.find((t) => t.id === tabId)?.resources.items.length ?? 0) > 0;
    setKubeContextTabs((prev) => prev.map((t) => t.id === tabId ? {
      ...t, kind, loading: !hasRows, error: '',
      resources: hasRows ? { ...t.resources, items: t.resources.items.map((item) => ({ ...item, loading: true })) } : t.resources,
    } : t));
    try {
      const res = await window.api.k8sResources(tabId, ns, kind);
      setKubeContextTabs((prev) => prev.map((t) => t.id === tabId ? {
        ...t, resources: { ...res, items: res.items.map((item) => ({ ...item, loading: false })) }, selected: 0, loading: false,
      } : t));
    } catch (err) {
      setKubeContextTabs((prev) => prev.map((t) => t.id === tabId ? {
        ...t, loading: false, error: err instanceof Error ? err.message : String(err),
        resources: { ...t.resources, items: t.resources.items.map((item) => ({ ...item, loading: false })) },
      } : t));
    }
  }, []);

  // Pod filters (combinable): owner kinds present in the list.
  const handleKubeTabPodFilterToggle = useCallback((tabId: string, category: string) => {
    setKubeContextTabs((prev) => prev.map((t) => t.id === tabId ? {
      ...t,
      podFilters: t.podFilters.includes(category) ? t.podFilters.filter((c) => c !== category) : [...t.podFilters, category],
      selected: 0,
    } : t));
  }, []);

  // Watch mode: toggle live polling of the tab's resource table.
  const handleKubeTabWatchToggle = useCallback((tabId: string, enabled: boolean) => {
    setKubeContextTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, watch: enabled } : t));
    if (enabled) refreshKubeTabRef.current(tabId); // immediate refresh on start
  }, []);
  // Watch interval in seconds (minimum 1).
  const handleKubeTabWatchInterval = useCallback((tabId: string, seconds: number) => {
    setKubeContextTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, watchInterval: Math.max(1, seconds) } : t));
  }, []);

  const refreshKubeTab = useCallback((tabId: string) => {
    const tab = kubeContextTabsRef.current.find((t) => t.id === tabId);
    if (tab) handleKubeTabNamespaceChange(tabId, tab.namespace);
  }, [handleKubeTabNamespaceChange]);

  // Silent refresh for watch mode: update the table in place without the
  // loading state; keep the current list on transient errors.
  const silentRefreshKubeTab = useCallback(async (tabId: string) => {
    const tab = kubeContextTabsRef.current.find((t) => t.id === tabId);
    if (!tab) return;
    setKubeContextTabs((prev) => prev.map((t) => t.id === tabId ? {
      ...t,
      resources: { ...t.resources, items: t.resources.items.map((item) => ({ ...item, loading: true })) },
    } : t));
    try {
      const res = await window.api.k8sResources(tab.context, tab.namespace, tab.kind);
      setKubeContextTabs((prev) => prev.map((t) => t.id === tabId ? {
        ...t,
        resources: { ...res, items: res.items.map((item) => ({ ...item, loading: false })) },
        selected: res.items.length > 0 ? Math.min(t.selected, res.items.length - 1) : 0,
      } : t));
    } catch {
      setKubeContextTabs((prev) => prev.map((t) => t.id === tabId ? {
        ...t,
        resources: { ...t.resources, items: t.resources.items.map((item) => ({ ...item, loading: false })) },
      } : t));
    }
  }, []);

  // Select a resource row inside the active context tab.
  const selectKubeDeployment = useCallback((i: number) => {
    setKubeContextTabs((prev) => prev.map((t) => t.id === kubeActiveTabRef.current ? { ...t, selected: i } : t));
  }, []);

  const requestKubeRestart = useCallback((all: boolean) => {
    const tab = kubeContextTabsRef.current.find((t) => t.id === kubeActiveTabRef.current);
    if (!tab || tab.kind !== 'deployments') return;
    const row = tab.resources.items[tab.selected];
    if (!all && !row) return;
    setKubeConfirm({
      type: all ? 'all-deployments' : 'deployment',
      context: tab.context,
      namespace: tab.namespace,
      name: row?.name,
      tabId: tab.id,
    });
  }, []);

  const confirmKubeRestart = useCallback(async () => {
    const action = kubeConfirm;
    setKubeConfirm(null);
    if (!action) return;
    try {
      if (action.type === 'delete-resource' && action.name && action.kind) {
        await window.api.k8sDeleteResource(action.context, action.namespace, action.kind as any, action.name);
        showStatus(`Deleted ${action.kindLabel?.toLowerCase() ?? 'resource'} ${action.name}`);
      } else if (action.type === 'deployment' && action.name) {
        await window.api.k8sRestartDeployment(action.context, action.namespace, action.name);
        showStatus(`Restart requested for ${action.name}`);
      } else {
        const count = await window.api.k8sRestartAllDeployments(action.context, action.namespace);
        showStatus(`Restart requested for ${count} deployment${count === 1 ? '' : 's'}`);
      }
      refreshKubeTabRef.current(action.tabId);
    } catch (err) {
      showStatus(err instanceof Error ? err.message : String(err), true);
    }
  }, [kubeConfirm, showStatus]);

  const requestKubeResourceDelete = useCallback(() => {
    const tab = kubeContextTabsRef.current.find((t) => t.id === kubeActiveTabRef.current);
    if (!tab || !KUBE_RESOURCE_OPTIONS.some((option) => option.id === tab.kind)) return;
    const row = tab.resources.items[tab.selected];
    if (!row) return;
    const kindLabel = KUBE_RESOURCE_OPTIONS.find((option) => option.id === tab.kind)?.label ?? tab.kind;
    setKubeConfirm({ type: 'delete-resource', context: tab.context, namespace: row.namespace, name: row.name, kind: tab.kind, kindLabel, tabId: tab.id });
  }, []);

  const describeKubeSelection = useCallback(async () => {
    const tab = kubeContextTabsRef.current.find((t) => t.id === kubeActiveTabRef.current);
    if (!tab || !KUBE_RESOURCE_OPTIONS.some((option) => option.id === tab.kind)) return;
    const row = tab.resources.items[tab.selected];
    if (!row) return;
    const kindLabel = KUBE_RESOURCE_OPTIONS.find((option) => option.id === tab.kind)?.label ?? tab.kind;
    const qualifiedName = row.namespace ? `${row.namespace}/${row.name}` : row.name;
    setKubeDescription({ title: `${kindLabel.replace(/s$/, '')} ${qualifiedName}`, json: '', query: '' });
    try {
      const json = await window.api.k8sDescribeResource(tab.context, row.namespace, tab.kind, row.name);
      setKubeDescription((prev) => prev ? { ...prev, json } : prev);
    } catch (err) {
      setKubeDescription((prev) => prev ? { ...prev, error: err instanceof Error ? err.message : String(err) } : prev);
    }
  }, []);

  // Open a deployment in its own workload tab (reuses the tab if already open).
  const openKubeWorkload = useCallback(async (i: number) => {
    const tab = kubeContextTabs.find((t) => t.id === kubeActiveTab) ?? kubeContextTabs[0];
    const row = tab?.resources.items[i];
    if (!tab || !row || tab.kind !== 'deployments') return;
    setKubeContextTabs((prev) => prev.map((t) => t.id === tab.id ? { ...t, selected: i } : t));
    const id = `${row.namespace}/${row.name}`;
    const existing = kubeWorkloadTabs.find((t) => t.id === id);
    if (existing) {
      setKubeActiveTab(id);
      return;
    }
    const newTab: KubeWorkloadTab = {
      id, context: tab.context, name: row.name, namespace: row.namespace, mode: 'deployment',
      detail: null, pods: null, selectedPod: 0, loading: true, podsLoading: true,
    };
    setKubeWorkloadTabs((prev) => [...prev, newTab]);
    setKubeActiveTab(id);
    try {
      const [detail, pods] = await Promise.all([
        window.api.k8sDeploymentDetail(tab.context, row.namespace, row.name),
        window.api.k8sDeploymentPods(tab.context, row.namespace, row.name),
      ]);
      setKubeWorkloadTabs((prev) => prev.map((t) => t.id === id ? { ...t, detail, pods, loading: false, podsLoading: false } : t));
    } catch (err) {
      setKubeWorkloadTabs((prev) => prev.map((t) => t.id === id ? { ...t, loading: false, podsLoading: false, error: err instanceof Error ? err.message : String(err) } : t));
    }
  }, [kubeActiveTab, kubeContextTabs, kubeWorkloadTabs]);

  const openKubeContextPod = useCallback(async (i: number) => {
    const tab = kubeContextTabsRef.current.find((t) => t.id === kubeActiveTabRef.current);
    const pod = tab?.resources.items[i];
    if (!tab || !pod || tab.kind !== 'pods') return;
    setKubeContextTabs((prev) => prev.map((t) => t.id === tab.id ? {
      ...t,
      podDrilldown: {
        podName: pod.name,
        namespace: pod.namespace,
        containers: pod.containers ?? [],
        containerStatuses: pod.containerStatuses,
        selectedContainer: 0,
      },
    } : t));
    setKubeActiveTab(tab.id);
    try {
      const json = await window.api.k8sDescribeResource(tab.context, pod.namespace, 'pods', pod.name);
      const statuses = containerStatusMap(json);
      setKubeContextTabs((prev) => prev.map((t) => t.id === tab.id && t.podDrilldown?.podName === pod.name
        ? { ...t, podDrilldown: { ...t.podDrilldown, containerStatuses: statuses } }
        : t));
    } catch {
      // The container list remains usable even when status lookup is unavailable.
    }
  }, []);

  const selectKubeContextContainer = useCallback((i: number) => {
    setKubeContextTabs((prev) => prev.map((t) => t.id === kubeActiveTabRef.current && t.podDrilldown ? {
      ...t, podDrilldown: { ...t.podDrilldown, selectedContainer: i },
    } : t));
  }, []);

  const openKubeContextContainerLogs = useCallback(async (i?: number) => {
    const tab = kubeContextTabsRef.current.find((t) => t.id === kubeActiveTabRef.current);
    const drilldown = tab?.podDrilldown;
    if (!tab || !drilldown) return;
    const container = drilldown.containers[i ?? drilldown.selectedContainer];
    if (!container) return;
    const id = `${tab.context}/${drilldown.namespace}/${drilldown.podName}/${container}/logs`;
    const existing = kubeWorkloadTabsRef.current.find((t) => t.id === id);
    if (existing) { setKubeActiveTab(id); return; }
    const logTab: KubeWorkloadTab = {
      id, context: tab.context, name: drilldown.podName, namespace: drilldown.namespace,
      label: `log ${drilldown.podName}/${container}`, mode: 'pod-logs', detail: null, container, logs: '', watch: false, watchInterval: 1, wrap: false, loading: true, logsLoading: true,
    };
    setKubeWorkloadTabs((prev) => [...prev, logTab]);
    setKubeActiveTab(id);
    try {
      const logs = await window.api.k8sPodLogs(tab.context, drilldown.namespace, drilldown.podName, container);
      setKubeWorkloadTabs((prev) => prev.map((t) => t.id === id ? { ...t, logs, loading: false, logsLoading: false } : t));
    } catch (err) {
      setKubeWorkloadTabs((prev) => prev.map((t) => t.id === id ? { ...t, loading: false, logsLoading: false, error: err instanceof Error ? err.message : String(err) } : t));
    }
  }, []);

  const closeKubePodDrilldown = useCallback(() => {
    setKubeContextTabs((prev) => prev.map((t) => t.id === kubeActiveTabRef.current ? { ...t, podDrilldown: undefined } : t));
  }, []);

  const toggleKubeLogWatch = useCallback((enabled: boolean) => {
    setKubeWorkloadTabs((prev) => prev.map((t) => t.id === kubeActiveTabRef.current ? { ...t, watch: enabled } : t));
  }, []);

  const toggleKubeLogWrap = useCallback((enabled: boolean) => {
    setKubeWorkloadTabs((prev) => prev.map((t) => t.id === kubeActiveTabRef.current ? { ...t, wrap: enabled } : t));
  }, []);

  const setKubeLogWatchInterval = useCallback((seconds: number) => {
    setKubeWorkloadTabs((prev) => prev.map((t) => t.id === kubeActiveTabRef.current ? { ...t, watchInterval: Math.max(1, seconds) } : t));
  }, []);

  const refreshKubeLogs = useCallback(async () => {
    const tab = kubeWorkloadTabsRef.current.find((t) => t.id === kubeActiveTabRef.current && t.mode === 'pod-logs');
    if (!tab || !tab.container) return;
    try {
      const logs = await window.api.k8sPodLogs(tab.context, tab.namespace, tab.name, tab.container);
      setKubeWorkloadTabs((prev) => prev.map((t) => t.id === tab.id
        ? { ...t, logs: mergeKubeLogSnapshot(t.logs ?? '', logs), error: '' }
        : t));
    } catch (err) {
      setKubeWorkloadTabs((prev) => prev.map((t) => t.id === tab.id ? { ...t, error: err instanceof Error ? err.message : String(err) } : t));
    }
  }, []);

  const selectKubeWorkloadPod = useCallback((workloadId: string, i: number) => {
    setKubeWorkloadTabs((prev) => prev.map((t) => t.id === workloadId ? { ...t, selectedPod: i } : t));
  }, []);

  const selectKubeWorkloadContainer = useCallback((workloadId: string, i: number) => {
    setKubeWorkloadTabs((prev) => prev.map((t) => t.id === workloadId ? { ...t, selectedContainer: i } : t));
  }, []);

  const openKubePodContainers = useCallback(async (workloadId: string, i?: number) => {
    const workload = kubeWorkloadTabsRef.current.find((t) => t.id === workloadId);
    if (!workload?.pods?.items.length) return;
    const index = i ?? workload.selectedPod ?? 0;
    const pod = workload.pods.items[index];
    if (!pod) return;
    const container = pod.containers?.[0];
    const id = `${workload.context}/${pod.namespace}/${pod.name}/logs`;
    const existing = kubeWorkloadTabsRef.current.find((t) => t.id === id);
    if (existing) {
      setKubeActiveTab(id);
      return;
    }
    const logTab: KubeWorkloadTab = {
      id, context: workload.context, name: pod.name, namespace: pod.namespace,
      label: `log ${pod.name}${container ? `/${container}` : ''}`,
      mode: 'pod-logs', detail: null, container, logs: '', watch: false, watchInterval: 1, wrap: false, loading: true, logsLoading: true,
    };
    setKubeWorkloadTabs((prev) => [...prev, logTab]);
    setKubeActiveTab(id);
    try {
      const logs = await window.api.k8sPodLogs(workload.context, pod.namespace, pod.name, container);
      setKubeWorkloadTabs((prev) => prev.map((t) => t.id === id ? { ...t, logs, loading: false, logsLoading: false } : t));
    } catch (err) {
      setKubeWorkloadTabs((prev) => prev.map((t) => t.id === id ? { ...t, loading: false, logsLoading: false, error: err instanceof Error ? err.message : String(err) } : t));
    }
  }, []);

  const openKubeContainerLogs = useCallback(async (containerTabId: string, i?: number) => {
    const containerTab = kubeWorkloadTabsRef.current.find((t) => t.id === containerTabId);
    if (!containerTab?.containers?.length) return;
    const container = containerTab.containers[i ?? containerTab.selectedContainer ?? 0];
    if (!container) return;
    const id = `${containerTab.context}/${containerTab.namespace}/${containerTab.name}/${container}/logs`;
    const existing = kubeWorkloadTabsRef.current.find((t) => t.id === id);
    if (existing) {
      setKubeActiveTab(id);
      return;
    }
    const logTab: KubeWorkloadTab = {
      id, context: containerTab.context, name: containerTab.name, namespace: containerTab.namespace,
      mode: 'pod-logs', detail: null, container, logs: '', watch: false, watchInterval: 1, wrap: false, loading: true, logsLoading: true,
    };
    setKubeWorkloadTabs((prev) => [...prev, logTab]);
    setKubeActiveTab(id);
    try {
      const logs = await window.api.k8sPodLogs(containerTab.context, containerTab.namespace, containerTab.name, container);
      setKubeWorkloadTabs((prev) => prev.map((t) => t.id === id ? { ...t, logs, loading: false, logsLoading: false } : t));
    } catch (err) {
      setKubeWorkloadTabs((prev) => prev.map((t) => t.id === id ? { ...t, loading: false, logsLoading: false, error: err instanceof Error ? err.message : String(err) } : t));
    }
  }, []);

  // Tab-by-tab compare: right-click a context tab → pick another context →
  // new compare tab; deployments are fetched for both contexts in the source
  // tab's namespace.
  const openKubeContextCompare = useCallback(async (sourceCtx: string, otherCtx: string) => {
    if (!sourceCtx || otherCtx === sourceCtx) return;
    const sourceTab = kubeContextTabs.find((t) => t.context === sourceCtx) ?? kubeContextTabs.find((t) => t.id === kubeActiveTab) ?? kubeContextTabs[0];
    if (!sourceTab) return;
    const ns = sourceTab.namespace;
    setKubeCompareTab({
      sides: [
        { context: sourceTab.context, label: sourceTab.label, deployments: [], loaded: false },
        { context: otherCtx, deployments: [], loaded: false },
      ],
      namespace: ns,
      loading: true,
      error: '',
    });
    setKubeActiveTab('compare');
    try {
      const [d1, d2] = await Promise.all([
        window.api.k8sDeployments(sourceCtx, ns),
        window.api.k8sDeployments(otherCtx, ns),
      ]);
      setKubeCompareTab((prev) => prev ? {
        ...prev,
        sides: [
          { ...prev.sides[0]!, deployments: d1, loaded: true },
          { ...prev.sides[1]!, deployments: d2, loaded: true },
        ],
        loading: false,
      } : prev);
    } catch (err) {
      setKubeCompareTab((prev) => prev ? { ...prev, loading: false, error: err instanceof Error ? err.message : String(err) } : prev);
    }
  }, [kubeActiveTab, kubeContextTabs]);

  // Append another context column to the compare table.
  const addKubeCompareContext = useCallback(async (ctx: string) => {
    const tab = kubeCompareTabRef.current;
    if (!tab || tab.sides.some((s) => s.context === ctx)) return;
    const openTab = kubeContextTabsRef.current.find((t) => t.context === ctx);
    setKubeCompareTab({ ...tab, sides: [...tab.sides, { context: ctx, label: openTab?.label, deployments: [], loaded: false }], loading: true, error: '' });
    try {
      const deps = await window.api.k8sDeployments(ctx, tab.namespace);
      setKubeCompareTab((prev) => prev ? {
        ...prev,
        sides: prev.sides.map((s, i) => i === prev.sides.length - 1 ? { ...s, deployments: deps, loaded: true } : s),
        loading: false,
      } : prev);
    } catch (err) {
      setKubeCompareTab((prev) => prev ? { ...prev, loading: false, error: err instanceof Error ? err.message : String(err) } : prev);
    }
  }, []);

  // Remove a context column from the compare table (keep at least 2).
  const removeKubeCompareSide = useCallback((index: number) => {
    setKubeCompareTab((prev) => {
      if (!prev || prev.sides.length <= 2) return prev;
      return { ...prev, sides: prev.sides.filter((_, i) => i !== index) };
    });
  }, []);

  // Rename a tab (context, workload or compare) via double-click.
  const renameKubeTab = useCallback((id: string, label: string) => {
    const trimmed = label.trim();
    if (id === 'compare') {
      setKubeCompareTab((prev) => prev ? { ...prev, label: trimmed || undefined } : prev);
      return;
    }
    const next = trimmed || undefined;
    setKubeContextTabs((prev) => prev.some((t) => t.id === id) ? prev.map((t) => t.id === id ? { ...t, label: next } : t) : prev);
    setKubeWorkloadTabs((prev) => prev.some((t) => t.id === id) ? prev.map((t) => t.id === id ? { ...t, label: next } : t) : prev);
  }, []);

  const activateKubeTab = useCallback((id: string) => {
    setKubeActiveTab(id);
    // Remember the last selected context across launches.
    if (id !== 'compare' && kubeContextTabsRef.current.some((t) => t.id === id)) {
      window.api.saveKubeContext(id);
    }
  }, []);

  const closeKubeTab = useCallback((id: string) => {
    const fallbackId = () => kubeContextTabs[0]?.id ?? '';
    if (id === 'compare') {
      setKubeCompareTab(null);
      if (kubeActiveTab === 'compare') setKubeActiveTab(fallbackId());
      return;
    }
    if (kubeWorkloadTabs.some((t) => t.id === id)) {
      const closingWorkload = kubeWorkloadTabs.find((t) => t.id === id);
      setKubeWorkloadTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (kubeActiveTab === id) setKubeActiveTab(fallbackId());
        return next;
      });
      // A context pod drilldown is only needed while its log is open. Clear
      // it when closing that log so the next pod starts with fresh state.
      if (closingWorkload?.mode === 'pod-logs') {
        setKubeContextTabs((prev) => prev.map((t) => t.context === closingWorkload.context
          && t.podDrilldown?.podName === closingWorkload.name
          && t.podDrilldown.namespace === closingWorkload.namespace
          ? { ...t, podDrilldown: undefined }
          : t));
      }
      return;
    }
    // Context tab — keep at least one open.
    setKubeContextTabs((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((t) => t.id !== id);
      if (kubeActiveTab === id) setKubeActiveTab(next[0]!.id);
      return next;
    });
  }, [kubeActiveTab, kubeWorkloadTabs, kubeContextTabs]);

  const closeActiveKubeTab = useCallback(() => {
    if (kubeActiveTab === 'compare') closeKubeTab('compare');
    else if (kubeWorkloadTabs.some((t) => t.id === kubeActiveTab)) closeKubeTab(kubeActiveTab);
    else setView('list'); // context tab or empty state → back to repos
  }, [kubeActiveTab, kubeWorkloadTabs, closeKubeTab]);

  // ─── Keyboard Handler ────────────────────────────────────────────────────

  const showStatusRef = useRef(showStatus);
  showStatusRef.current = showStatus;
  const syncOneRef = useRef(syncOne);
  syncOneRef.current = syncOne;
  const syncAllRef = useRef(syncAll);
  syncAllRef.current = syncAll;
  const fetchPRsForRepoRef = useRef(fetchPRsForRepo);
  fetchPRsForRepoRef.current = fetchPRsForRepo;
  const fetchAllPRsRef = useRef(fetchAllPRs);
  fetchAllPRsRef.current = fetchAllPRs;
  const prAllReposRef = useRef(prAllRepos);
  prAllReposRef.current = prAllRepos;
  const switchWorkspaceRef = useRef(switchWorkspace);
  switchWorkspaceRef.current = switchWorkspace;
  const selectWorkspaceRef = useRef(selectWorkspace);
  selectWorkspaceRef.current = selectWorkspace;
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const reposRef = useRef(repos);
  reposRef.current = repos;
  const kubeContextsRef = useRef(kubeContexts);
  kubeContextsRef.current = kubeContexts;
  const kubeContextTabsRef = useRef(kubeContextTabs);
  kubeContextTabsRef.current = kubeContextTabs;
  const kubeWorkloadTabsRef = useRef(kubeWorkloadTabs);
  kubeWorkloadTabsRef.current = kubeWorkloadTabs;
  const kubeActiveTabRef = useRef(kubeActiveTab);
  kubeActiveTabRef.current = kubeActiveTab;
  const loadKubeContextsRef = useRef(loadKubeContexts);
  loadKubeContextsRef.current = loadKubeContexts;
  const openKubeWorkloadRef = useRef(openKubeWorkload);
  openKubeWorkloadRef.current = openKubeWorkload;
  const openKubeContextPodRef = useRef(openKubeContextPod);
  openKubeContextPodRef.current = openKubeContextPod;
  const selectKubeContextContainerRef = useRef(selectKubeContextContainer);
  selectKubeContextContainerRef.current = selectKubeContextContainer;
  const openKubeContextContainerLogsRef = useRef(openKubeContextContainerLogs);
  openKubeContextContainerLogsRef.current = openKubeContextContainerLogs;
  const openKubePodContainersRef = useRef(openKubePodContainers);
  openKubePodContainersRef.current = openKubePodContainers;
  const openKubeContainerLogsRef = useRef(openKubeContainerLogs);
  openKubeContainerLogsRef.current = openKubeContainerLogs;
  const selectKubeWorkloadPodRef = useRef(selectKubeWorkloadPod);
  selectKubeWorkloadPodRef.current = selectKubeWorkloadPod;
  const selectKubeWorkloadContainerRef = useRef(selectKubeWorkloadContainer);
  selectKubeWorkloadContainerRef.current = selectKubeWorkloadContainer;
  const kubeCompareTabRef = useRef(kubeCompareTab);
  kubeCompareTabRef.current = kubeCompareTab;
  const refreshKubeTabRef = useRef(refreshKubeTab);
  refreshKubeTabRef.current = refreshKubeTab;
  const silentRefreshKubeTabRef = useRef(silentRefreshKubeTab);
  silentRefreshKubeTabRef.current = silentRefreshKubeTab;
  const handleKubeTabWatchToggleRef = useRef(handleKubeTabWatchToggle);
  handleKubeTabWatchToggleRef.current = handleKubeTabWatchToggle;
  const closeActiveKubeTabRef = useRef(closeActiveKubeTab);
  closeActiveKubeTabRef.current = closeActiveKubeTab;
  const closeKubePodDrilldownRef = useRef(closeKubePodDrilldown);
  closeKubePodDrilldownRef.current = closeKubePodDrilldown;
  const toggleKubeLogWatchRef = useRef(toggleKubeLogWatch);
  toggleKubeLogWatchRef.current = toggleKubeLogWatch;
  const toggleKubeLogWrapRef = useRef(toggleKubeLogWrap);
  toggleKubeLogWrapRef.current = toggleKubeLogWrap;
  const requestKubeRestartRef = useRef(requestKubeRestart);
  requestKubeRestartRef.current = requestKubeRestart;
  const describeKubeSelectionRef = useRef(describeKubeSelection);
  describeKubeSelectionRef.current = describeKubeSelection;
  const confirmKubeRestartRef = useRef(confirmKubeRestart);
  confirmKubeRestartRef.current = confirmKubeRestart;
  const requestKubeResourceDeleteRef = useRef(requestKubeResourceDelete);
  requestKubeResourceDeleteRef.current = requestKubeResourceDelete;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (inputMode !== 'none') return;
      if (kubeDescription && e.key === 'Escape') {
        e.preventDefault();
        setKubeDescription(null);
        return;
      }
      // Never hijack keys while typing in an input/select (tab rename, watch interval, …)
      const evtTarget = e.target as HTMLElement | null;
      if (evtTarget && (evtTarget.tagName === 'INPUT' || evtTarget.tagName === 'TEXTAREA' || evtTarget.tagName === 'SELECT')) return;
      if (showConfig) return;
      if (showCloneDialog) return;
      if (showAddWorkspace) return;
      if (editWorkspace) return;
      if (kubeConfirm) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setKubeConfirm(null);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          confirmKubeRestartRef.current();
        }
        return;
      }

      // Global workspace shortcuts ('w' switches workspace EXCEPT in the k8s
      // view, where 'w' toggles watch mode on the active context tab).
      if (e.key === 'w' && !e.metaKey && !e.ctrlKey && view !== 'k8s') {
        if (workspaces.length > 1) {
          e.preventDefault();
          const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
          const next = idx === -1 ? 0 : (idx + 1) % workspaces.length;
          switchWorkspaceRef.current(workspaces[next]!);
        }
        return;
      }
      if (e.key === 'W') {
        e.preventDefault();
        selectWorkspaceRef.current();
        return;
      }
      if (e.key === 'S') {
        if (repos.length === 0) {
          showStatusRef.current('No repositories to sync. Select a workspace first.', true);
        } else {
          const syncPromise = syncAllRef.current();
          // In PR view, refresh the PR list after the sync completes
          if (view === 'prs' && syncPromise) {
            syncPromise.then(() => {
              if (prAllReposRef.current) {
                fetchAllPRsRef.current();
              } else if (reposRef.current[selectedRepo]) {
                fetchPRsForRepoRef.current(reposRef.current[selectedRepo].path);
              }
            }).catch(() => {});
          }
        }
        return;
      }

      switch (view) {
        case 'list': {
          switch (e.key) {
            case 'j': case 'ArrowDown':
              e.preventDefault();
              setSelectedRepo((i) => Math.min(i + 1, repos.length - 1));
              break;
            case 'k': case 'ArrowUp':
              e.preventDefault();
              setSelectedRepo((i) => Math.max(i - 1, 0));
              break;
            case 'g':
              if (!e.shiftKey) setSelectedRepo(0);
              break;
            case 'G':
              setSelectedRepo(repos.length - 1);
              break;
            case 'c': case 'Enter': {
              if (repos.length === 0) {
                showStatusRef.current('No repositories to inspect. Select a workspace first.', true);
              } else if (!repos[selectedRepo]) {
                showStatusRef.current('No repo selected.', true);
              } else if (repos[selectedRepo].status === 'loading' || repos[selectedRepo].status === 'syncing') {
                showStatusRef.current('Repo still loading. Wait for sync to finish.', true);
              } else {
                setView('commits');
                setSelectedCommit(0);
              }
              break;
            }
            case 's': {
              if (repos.length === 0) {
                showStatusRef.current('No repositories to sync. Select a workspace first.', true);
              } else if (selectedRepo < repos.length && repos[selectedRepo]) {
                if (repos[selectedRepo].status === 'syncing') {
                  showStatusRef.current('Already syncing this repo.', true);
                } else {
                  syncOneRef.current(repos[selectedRepo].path);
                }
              }
              break;
            }
            case 'r':
              if (repos[selectedRepo]) syncOneRef.current(repos[selectedRepo].path);
              break;
            case 'e':
              setShowConfig(true);
              break;
            case 'p': {
              if (repos.length === 0) {
                showStatusRef.current('No workspace selected.', true);
              } else if (!repos[selectedRepo]) {
                showStatusRef.current('No repo selected.', true);
              } else if (!cfg?.token || cfg.token.trim() === '') {
                showStatusRef.current('API token not configured. Press e to open settings.', true);
              } else {
                setView('prs');
                setPRError('');
                setPrAllRepos(false);
                fetchPRsForRepoRef.current(repos[selectedRepo].path);
              }
              break;
            }
            case 'P': {
              if (repos.length === 0) {
                showStatusRef.current('No workspace selected.', true);
              } else if (!cfg?.token || cfg.token.trim() === '') {
                showStatusRef.current('API token not configured. Press e to open settings.', true);
              } else {
                setView('prs');
                setPRError('');
                setPrAllRepos(true);
                fetchAllPRsRef.current();
              }
              break;
            }
            case 'K': {
              setView('k8s');
              setKubeError('');
              if (kubeContextTabsRef.current.length === 0) {
                loadKubeContextsRef.current();
              } else {
                setKubeActiveTab(kubeContextTabsRef.current[0]!.id);
              }
              break;
            }
            case '/':
              setInputMode('search');
              setSearchQuery('');
              break;
            case ':':
              setInputMode('command');
              setSearchQuery('');
              break;
            case 'o': {
              if (repos.length === 0 || !repos[selectedRepo]) {
                showStatusRef.current('No repo selected to open.', true);
              } else if (!cfg) {
                showStatusRef.current('Config not loaded.', true);
              } else {
                window.api.getRemoteUrl(repos[selectedRepo].path).then((url) => {
                  if (!url) {
                    showStatusRef.current('No remote URL found for this repository.', true);
                    return;
                  }
                  window.api.getCompareUrl(url, cfg.base, cfg.release).then((compareUrl) => {
                    if (!compareUrl) {
                      showStatusRef.current('Could not generate compare URL.', true);
                      return;
                    }
                    window.api.openUrl(compareUrl);
                  });
                });
              }
              break;
            }
            case 'n': {
              if ((e.ctrlKey || e.metaKey) && workspacePath) {
                e.preventDefault();
                setShowCloneDialog(true);
              }
              break;
            }
            case 'q':
              window.api.getAppInfo().then(() => window.close());
              break;
          }
          break;
        }
        case 'commits': {
          const repo = repos[selectedRepo];
          const allCommits = [...(repo?.diffCommits ?? []), ...(repo?.latestCommits ?? []).map(c => ({ hash: c.hash, message: c.subject }))];
          switch (e.key) {
            case 'j': case 'ArrowDown':
              e.preventDefault();
              setSelectedCommit((i) => Math.min(i + 1, allCommits.length - 1));
              break;
            case 'k': case 'ArrowUp':
              e.preventDefault();
              setSelectedCommit((i) => Math.max(i - 1, 0));
              break;
            case 'Enter':
              if (allCommits[selectedCommit]) {
                window.api.fetchCommitDetail(repo.path, allCommits[selectedCommit].hash).then(setDetail);
                setView('detail');
              }
              break;
            case 'b': case 'Escape':
              setView('list');
              break;
            case 'q':
              window.api.getAppInfo().then(() => window.close());
              break;
          }
          break;
        }
        case 'detail': {
          switch (e.key) {
            case 'b': case 'Escape':
              setView('commits');
              setDetail(null);
              break;
            case 'q':
              window.api.getAppInfo().then(() => window.close());
              break;
          }
          break;
        }
        case 'prs': {
          switch (e.key) {
            case 'j': case 'ArrowDown':
              e.preventDefault();
              setSelectedPR((i) => Math.min(i + 1, prs.length - 1));
              break;
            case 'k': case 'ArrowUp':
              e.preventDefault();
              setSelectedPR((i) => Math.max(i - 1, 0));
              break;
            case 'g':
              if (!e.shiftKey) setSelectedPR(0);
              break;
            case 'G':
              setSelectedPR(prs.length - 1);
              break;

            case 'o': {
              const pr = prs[selectedPR];
              if (pr?.url) window.api.openUrl(pr.url);
              break;
            }
            case 'f': {
              e.preventDefault();
              const next = prFilter === 'open' ? 'closed' : prFilter === 'closed' ? 'all' : 'open';
              setPRFilter(next);
              setSelectedPR(0);
              if (prAllReposRef.current) {
                fetchAllPRsRef.current(next);
              } else if (repos[selectedRepo]) {
                fetchPRsForRepoRef.current(repos[selectedRepo].path, next);
              }
              break;
            }
            case 'Enter': {
              // Enter opens the AI review for the selected PR.
              e.preventDefault();
              const pr = prs[selectedPR];
              if (pr && repos.length > 0) {
                // Find the correct repo — PR may be from a different repo than repos[selectedRepo]
                const prRepo = pr.repoName ? repos.find((r) => r.name === pr.repoName) : null;
                const repo = prRepo ?? repos[selectedRepo];
                if (!repo) break;
                setReviewContext({
                  repoPath: repo.path,
                  prNumber: pr.number,
                  returnView: 'prs',
                });
                setView('review');
                const gen = ++reviewGenRef.current;
                setReviewLoading(true);
                setReviewError('');
                setReviewJira(null);
                // Load Jira + PR detail
                (async () => {
                  try {
                    const remoteInfo = await window.api.getRemoteOwnerRepo(repo.path);
                    const owner = remoteInfo?.owner ?? '';
                    const prDetail = await window.api.fetchPRDetail(
                      owner,
                      pr.repoName || repo.name,
                      pr.number,
                      cfg?.provider ?? 'github',
                      cfg?.token ?? '',
                    );
                    if (gen === reviewGenRef.current) setPRDetail(prDetail);
                    const jiraConfig = cfg ? { url: cfg.jiraUrl, email: cfg.jiraEmail, apiToken: cfg.jiraApiToken } : null;
                    if (jiraConfig?.url && jiraConfig.email) {
                      const key = await window.api.extractJiraKey(
                        pr.title, prDetail.description || '', pr.sourceBranch,
                      );
                      if (key) {
                        try {
                          const jira = await window.api.fetchJira(jiraConfig, key);
                          if (gen === reviewGenRef.current) setReviewJira(jira);
                        } catch { /* jira optional */ }
                      }
                    }
                    if (gen === reviewGenRef.current) setReviewLoading(false);
                  } catch (err) {
                    if (gen === reviewGenRef.current) {
                      setReviewError(err instanceof Error ? err.message : String(err));
                      setReviewLoading(false);
                    }
                  }
                })();
              }
              break;
            }
            case 'r':
              e.preventDefault();
              if (prAllReposRef.current) fetchAllPRsRef.current();
              else if (repos[selectedRepo]) fetchPRsForRepoRef.current(repos[selectedRepo].path);
              break;
            case 'b': case 'Escape':
              setView('list');
              break;
            case 'q':
              window.api.getAppInfo().then(() => window.close());
              break;
          }
          break;
        }
        case 'prdetail': {
          switch (e.key) {
            case 'R': {
              if (prDetail) {
                const prRepo = prDetail.repoName ? repos.find((r) => r.name === prDetail.repoName) : null;
                const repoPath = prRepo?.path ?? repos[selectedRepo]?.path ?? '';
                setReviewContext({
                  repoPath,
                  prNumber: prDetail.number,
                  returnView: 'prdetail',
                });
                setView('review');
                const gen = ++reviewGenRef.current;
                setReviewLoading(true);
                setReviewError('');
                setReviewJira(null);
                (async () => {
                  try {
                    const jiraConfig = cfg ? { url: cfg.jiraUrl, email: cfg.jiraEmail, apiToken: cfg.jiraApiToken } : null;
                    if (jiraConfig?.url && jiraConfig.email) {
                      const key = await window.api.extractJiraKey(
                        prDetail.title, prDetail.description, prDetail.sourceBranch,
                      );
                      if (key) {
                        try {
                          const jira = await window.api.fetchJira(jiraConfig, key);
                          if (gen === reviewGenRef.current) setReviewJira(jira);
                        } catch { /* jira optional */ }
                      }
                    }
                    if (gen === reviewGenRef.current) setReviewLoading(false);
                  } catch (err) {
                    if (gen === reviewGenRef.current) {
                      setReviewError(err instanceof Error ? err.message : String(err));
                      setReviewLoading(false);
                    }
                  }
                })();
              }
              break;
            }
            case 'b': case 'Escape':
              setView('prs');
              break;
            case 'q':
              window.api.getAppInfo().then(() => window.close());
              break;
          }
          break;
        }
        case 'review': {
          switch (e.key) {
            case 'b': case 'Escape':
              setView(reviewContext.returnView);
              setReviewJira(null);
              break;
            case 'o': {
              // Open the PR in git
              if (prDetail?.url) {
                window.api.openUrl(prDetail.url);
              } else if (reviewContext.repoPath) {
                window.api.getRemoteUrl(reviewContext.repoPath)
                  .then((remoteUrl) => {
                    const pulls = getPRsUrl(remoteUrl);
                    if (pulls) window.api.openUrl(`${pulls}/${reviewContext.prNumber}`);
                  })
                  .catch(() => { /* non-fatal */ });
              }
              break;
            }
            case 'q':
              window.api.getAppInfo().then(() => window.close());
              break;
          }
          break;
        }
        case 'k8s': {
          const ctxTab = kubeContextTabs.find((t) => t.id === kubeActiveTab) ?? kubeContextTabs[0];
          const activeWorkload = kubeWorkloadTabs.find((t) => t.id === kubeActiveTab);
          const onContextList = !!ctxTab && kubeActiveTab !== 'compare' && !activeWorkload && !ctxTab.podDrilldown;
          switch (e.key) {
            case 'j': case 'ArrowDown':
              e.preventDefault();
              if (onContextList) selectKubeDeployment(Math.min(ctxTab.selected + 1, ctxTab.resources.items.length - 1));
              else if (activeWorkload?.pods?.items.length) selectKubeWorkloadPodRef.current(activeWorkload.id, Math.min((activeWorkload.selectedPod ?? 0) + 1, activeWorkload.pods.items.length - 1));
              else if (activeWorkload?.containers?.length) selectKubeWorkloadContainerRef.current(activeWorkload.id, Math.min((activeWorkload.selectedContainer ?? 0) + 1, activeWorkload.containers.length - 1));
              else if (ctxTab?.podDrilldown?.containers.length) selectKubeContextContainerRef.current(Math.min(ctxTab.podDrilldown.selectedContainer + 1, ctxTab.podDrilldown.containers.length - 1));
              break;
            case 'k': case 'ArrowUp':
              e.preventDefault();
              if (onContextList) selectKubeDeployment(Math.max(ctxTab.selected - 1, 0));
              else if (activeWorkload?.pods?.items.length) selectKubeWorkloadPodRef.current(activeWorkload.id, Math.max((activeWorkload.selectedPod ?? 0) - 1, 0));
              else if (activeWorkload?.containers?.length) selectKubeWorkloadContainerRef.current(activeWorkload.id, Math.max((activeWorkload.selectedContainer ?? 0) - 1, 0));
              else if (ctxTab?.podDrilldown?.containers.length) selectKubeContextContainerRef.current(Math.max(ctxTab.podDrilldown.selectedContainer - 1, 0));
              break;
            case 'g':
              if (!e.shiftKey && onContextList) selectKubeDeployment(0);
              break;
            case 'G':
              if (onContextList) selectKubeDeployment(ctxTab.resources.items.length - 1);
              break;
            case 'Enter':
              e.preventDefault();
              if (onContextList && ctxTab.resources.items[ctxTab.selected]) {
                if (ctxTab.kind === 'pods') openKubeContextPodRef.current(ctxTab.selected);
                else if (ctxTab.kind === 'deployments') openKubeWorkloadRef.current(ctxTab.selected);
              } else if (activeWorkload?.mode === 'deployment') {
                openKubePodContainersRef.current(activeWorkload.id, activeWorkload.selectedPod ?? 0);
              } else if (activeWorkload?.mode === 'pod-containers') {
                openKubeContainerLogsRef.current(activeWorkload.id, activeWorkload.selectedContainer ?? 0);
              } else if (ctxTab?.podDrilldown) {
                openKubeContextContainerLogsRef.current(ctxTab.podDrilldown.selectedContainer);
              }
              break;
            case 'r':
              if (onContextList && ctxTab.kind === 'deployments') requestKubeRestartRef.current(false);
              else if (ctxTab) refreshKubeTabRef.current(ctxTab.id);
              break;
            case 'R':
              if (onContextList && ctxTab.kind === 'deployments') {
                e.preventDefault();
                requestKubeRestartRef.current(true);
              }
              break;
            case 'd':
              if (onContextList && ctxTab && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                requestKubeResourceDeleteRef.current();
              } else if (onContextList && ctxTab) {
                e.preventDefault();
                describeKubeSelectionRef.current();
              }
              break;
            case 'w':
              if (activeWorkload?.mode === 'pod-logs') {
                e.preventDefault();
                toggleKubeLogWatchRef.current(!activeWorkload.watch);
              } else if (ctxTab) {
                e.preventDefault();
                handleKubeTabWatchToggleRef.current(ctxTab.id, !ctxTab.watch);
              }
              break;
            case 'z':
              if (activeWorkload?.mode === 'pod-logs') {
                e.preventDefault();
                toggleKubeLogWrapRef.current(!activeWorkload.wrap);
              }
              break;
            case 'b': case 'Escape':
              if (ctxTab?.podDrilldown) closeKubePodDrilldownRef.current();
              else closeActiveKubeTabRef.current();
              break;
            case 'q':
              window.api.getAppInfo().then(() => window.close());
              break;
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view, repos, selectedRepo, selectedCommit, prs, selectedPR, prDetail, cfg, inputMode, showConfig, reviewContext, kubeContexts, kubeContextTabs, kubeWorkloadTabs, kubeActiveTab, kubeConfirm, selectKubeDeployment]);

  // ─── Filtered Repos ──────────────────────────────────────────────────────

  const filteredRepos = searchQuery
    ? repos.filter((r) => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : repos;

  // ─── Config Save ─────────────────────────────────────────────────────────

  const handleConfigSave = useCallback(async (newConfig: AppConfig) => {
    // Theme is always global — never save to workspace config
    if (activeWorkspaceId) {
      const { theme: _unused, ...wsConfig } = newConfig;
      await window.api.saveWorkspaceConfig(activeWorkspaceId, wsConfig as AppConfig);
    }
    // Always save theme to global config
    await window.api.saveConfig(newConfig);
    setCfg(newConfig);
    setWorkspacePath(newConfig.workspace);
    setShowConfig(false);
    if (newConfig.workspace) {
      const paths = await window.api.findRepos(newConfig.workspace);
      setRepoPaths(paths);
      setRepos(paths.map((p: string) => ({
        name: p.split('/').pop() ?? p, path: p, status: 'stale' as const,
        diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null,
        currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: null,
      })));
      // Re-sync immediately with the freshly saved config so repos aren't left stale
      syncOneRepoDirect(paths, newConfig);
    }
  }, [activeWorkspaceId, syncOneRepoDirect]);

  const handleCloned = useCallback(async (name: string, path: string) => {
    setShowCloneDialog(false);
    // Refresh repos
    const newRepo: RepoState = {
      name,
      path,
      status: 'syncing',
      diffCommits: [], latestCommits: [],
      latestVersion: null, latestVersionDate: null,
      currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '',
      error: null,
    };
    setRepos((prev) => [newRepo, ...prev]);
    setRepoPaths((prev) => [path, ...prev]);
    showStatusRef.current(`Cloned ${name}. Syncing...`);

    if (cfg) {
      try {
        const result = await window.api.syncOneRepo(path, cfg.base, cfg.release);
        setRepos((prev) => prev.map((r) => r.path === path ? result : r));
        showStatusRef.current(`${name} synced`);
      } catch {
        showStatusRef.current(`Failed to sync ${name}`, true);
      }
    }
  }, [cfg, showStatus]);

  // ─── Render ──────────────────────────────────────────────────────────────

  if (!cfg) {
    return (
      <div className="app-container">
        <div className="state-message">
          {statusMessage || 'Loading DeltaDot...'}
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch (view) {
      case 'list':
        return (
          <RepoList
            repos={filteredRepos}
            selected={selectedRepo}
            onSelect={setSelectedRepo}
            isSyncing={isSyncing}
            syncProgress={syncProgress}
          />
        );
      case 'commits': {
        const repo = repos[selectedRepo];
        if (!repo) return <div className="state-message">No repo selected</div>;
        return (
          <CommitsView
            repo={repo}
            selectedCommit={selectedCommit}
            base={cfg.base}
            release={cfg.release}
            onSelectCommit={setSelectedCommit}
            onBack={() => setView('list')}
            onCommitDetail={(hash: string) => {
              window.api.fetchCommitDetail(repo.path, hash).then(setDetail);
              setView('detail');
            }}
          />
        );
      }
      case 'detail':
        return detail ? (
          <DetailView detail={detail} onBack={() => { setView('commits'); setDetail(null); }} />
        ) : null;
      case 'prs':
        return (
          <PRsView
            prs={prs}
            loading={prLoading}
            error={prError}
            selected={selectedPR}
            filter={prFilter}
            onSelect={setSelectedPR}
            onBack={() => setView('list')}
            onOpenConfig={() => setShowConfig(true)}
            onFilterChange={(f) => {
              setPRFilter(f);
              setSelectedPR(0);
              if (prAllRepos) {
                fetchAllPRsRef.current(f);
              } else if (repos[selectedRepo]) {
                fetchPRsForRepoRef.current(repos[selectedRepo].path, f);
              }
            }}
            onSelectPR={() => {
              const pr = prs[selectedPR];
              if (pr && repos.length > 0) {
                const prRepo = pr.repoName ? repos.find((r) => r.name === pr.repoName) : null;
                const repo = prRepo ?? repos[selectedRepo];
                if (!repo) return;
                setPRDetailLoading(true);
                setPRDetailError('');
                window.api.getRemoteOwnerRepo(repo.path).then((remoteInfo) => {
                  const owner = remoteInfo?.owner ?? '';
                  window.api.fetchPRDetail(
                    owner,
                    pr.repoName ?? repo.name,
                    pr.number,
                    cfg.provider,
                    cfg.token,
                  ).then((detail) => {
                    setPRDetail(detail);
                    setView('prdetail');
                    setPRDetailLoading(false);
                  }).catch((err) => {
                    setPRDetailError(err instanceof Error ? err.message : String(err));
                    setPRDetailLoading(false);
                  });
                }).catch((err) => {
                  setPRDetailError(err instanceof Error ? err.message : String(err));
                  setPRDetailLoading(false);
                });
              }
            }}
          />
        );
      case 'prdetail':
        return prDetail ? (
          <PRDetailView
            prDetail={prDetail}
            loading={prDetailLoading}
            error={prDetailError}
            ownAuthor={ownAuthor}
            gitUserName={gitUserName}
            onBack={() => setView('prs')}
            onReview={() => {
              const prRepo = prDetail.repoName ? repos.find((r) => r.name === prDetail.repoName) : null;
              setReviewContext({
                repoPath: prRepo?.path ?? repos[selectedRepo]?.path ?? '',
                prNumber: prDetail.number,
                returnView: 'prdetail',
              });
              setView('review');
              const gen = ++reviewGenRef.current;
              setReviewLoading(true);
              setReviewError('');
              setReviewJira(null);
              (async () => {
                try {
                  const jiraConfig = cfg ? { url: cfg.jiraUrl, email: cfg.jiraEmail, apiToken: cfg.jiraApiToken } : null;
                  if (jiraConfig?.url && jiraConfig.email) {
                    const key = await window.api.extractJiraKey(
                      prDetail.title, prDetail.description, prDetail.sourceBranch,
                    );
                    if (key) {
                      try {
                        const jira = await window.api.fetchJira(jiraConfig, key);
                        if (gen === reviewGenRef.current) setReviewJira(jira);
                      } catch { /* jira optional */ }
                    }
                  }
                } catch {}
                if (gen === reviewGenRef.current) setReviewLoading(false);
              })();
            }}
          />
        ) : null;
      case 'review':
        return (
          <ReviewView
            cfg={cfg}
            repoPath={reviewContext.repoPath}
            prNumber={reviewContext.prNumber}
            prTitle={prDetail?.title}
            jiraIssue={reviewJira}
            loading={reviewLoading}
            error={reviewError}
            onBack={() => { setView(reviewContext.returnView); setReviewJira(null); }}
          />
        );
      case 'k8s':
        return (
          <K8sView
            contexts={kubeContexts}
            contextTabs={kubeContextTabs}
            activeTab={kubeActiveTab}
            workloadTabs={kubeWorkloadTabs}
            compareTab={kubeCompareTab}
            error={kubeError}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onOpenContextTab={openKubeContextTab}
            onTabNamespaceChange={handleKubeTabNamespaceChange}
            onTabKindChange={handleKubeTabKindChange}
            onTabPodFilterToggle={handleKubeTabPodFilterToggle}
            onTabWatchToggle={handleKubeTabWatchToggle}
            onTabWatchInterval={handleKubeTabWatchInterval}
            onRefreshTab={refreshKubeTab}
            onSilentRefreshTab={silentRefreshKubeTab}
            onSelect={selectKubeDeployment}
            onOpenWorkload={openKubeWorkload}
            onOpenPod={openKubeContextPod}
            onSelectContextContainer={selectKubeContextContainer}
            onOpenContextContainerLogs={openKubeContextContainerLogs}
            onClosePodDrilldown={closeKubePodDrilldown}
            onToggleLogWatch={toggleKubeLogWatch}
            onLogWatchInterval={setKubeLogWatchInterval}
            onRefreshLogs={refreshKubeLogs}
            onToggleLogWrap={toggleKubeLogWrap}
            onSelectWorkloadPod={selectKubeWorkloadPod}
            onOpenPodLogs={openKubePodContainers}
            onSelectWorkloadContainer={selectKubeWorkloadContainer}
            onOpenContainerLogs={openKubeContainerLogs}
            onCompareContext={openKubeContextCompare}
            onAddCompareContext={addKubeCompareContext}
            onRemoveCompareSide={removeKubeCompareSide}
            onActivateTab={activateKubeTab}
            onCloseTab={closeKubeTab}
            onRenameTab={renameKubeTab}
            onBack={closeActiveKubeTab}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      {workspacePath ? (
        <>
          <TopBar
            workspacePath={workspacePath}
            base={cfg.base}
            release={cfg.release}
            repoCount={repos.length}
            isSyncing={isSyncing}
            syncProgress={syncProgress}
            lastSync={lastSync}
            currentView={view === 'prs' ? 'prs' : view === 'k8s' ? 'k8s' : 'list'}
            onSyncAll={syncAll}
            onSelectWorkspace={selectWorkspace}
            onOpenConfig={() => setShowConfig(true)}
            onChangeView={handleChangeView}
            theme={cfg.theme}
            onToggleTheme={toggleTheme}
          />

          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <WorkspacePanel
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              collapsed={sidebarCollapsed}
              onSwitch={switchWorkspace}
              onAdd={selectWorkspace}
              onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
              onUpdate={updateWorkspace}
              onEdit={(ws) => setEditWorkspace(ws)}
            />
            <div className="main-content">
              {renderView()}
            </div>
          </div>

          <BottomBar
            currentView={view}
            k8sMenuMode={view !== 'k8s' ? undefined : (() => {
              const activeWorkload = kubeWorkloadTabs.find((tab) => tab.id === kubeActiveTab);
              if (activeWorkload?.mode === 'pod-logs') return 'logs' as const;
              if (activeWorkload) return 'workload' as const;
              const activeContext = kubeContextTabs.find((tab) => tab.id === kubeActiveTab);
              if (activeContext?.podDrilldown) return 'pod-drilldown' as const;
              if (activeContext?.kind === 'deployments') return 'deployments' as const;
              if (activeContext?.kind === 'pods') return 'pods' as const;
              if (activeContext?.kind === 'jobs') return 'jobs' as const;
              return 'other' as const;
            })()}
          />

          {statusMessage && !statusMessage.includes('Loading') && (
            <div style={{
              padding: '6px 16px',
              background: statusTone === 'error' ? 'var(--tint-red)' : statusTone === 'warning' ? 'var(--tint-yellow)' : 'var(--tint-green)',
              borderTop: statusTone === 'error' ? '1px solid var(--border-red)' : statusTone === 'warning' ? '1px solid var(--border-yellow)' : '1px solid var(--border-green)',
              color: statusTone === 'error' ? 'var(--accent-red)' : statusTone === 'warning' ? 'var(--accent-yellow)' : 'var(--accent-green)',
              fontSize: 12,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span>{statusMessage}</span>
            </div>
          )}
        </>
      ) : (
        <WelcomeScreen
          workspaces={workspaces}
          onSelectWorkspace={selectWorkspace}
          onSwitchWorkspace={switchWorkspace}
          onOpenConfig={() => setShowConfig(true)}
          statusMessage={statusMessage}
          statusTone={statusTone}
        />
      )}

      {inputMode === 'search' && (
        <CommandBar
          mode="search"
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={view === 'k8s' ? 'Search pods or deployments...' : 'Search repos...'}
          onClose={() => { setInputMode('none'); setSearchQuery(''); }}
          onSubmit={() => setInputMode('none')}
        />
      )}

      {inputMode === 'command' && (
        <CommandBar
          mode="command"
          value={searchQuery}
          onChange={setSearchQuery}
          onClose={() => { setInputMode('none'); setSearchQuery(''); }}
          onSubmit={(cmd: string) => {
            setInputMode('none');
            switch (cmd.trim().toLowerCase()) {
              case 'q': case 'quit': case 'exit':
                window.api.getAppInfo().then(() => window.close());
                break;
              case 'config': case 'settings':
                setShowConfig(true);
                break;
              case 'sync':
                syncAllRef.current();
                break;
              case 'prs':
                if (repos[selectedRepo]) {
                  setView('prs');
                  fetchPRsForRepoRef.current(repos[selectedRepo].path);
                }
                break;
            }
          }}
        />
      )}

      {showConfig && cfg && (
        <ConfigDialog
          config={cfg}
          onSave={handleConfigSave}
          onClose={() => setShowConfig(false)}
          onBrowseWorkspace={browseWorkspace}
        />
      )}

      {showCloneDialog && workspacePath && (
        <CloneDialog
          workspacePath={workspacePath}
          onClose={() => setShowCloneDialog(false)}
          onCloned={handleCloned}
        />
      )}

      {kubeConfirm && (
        <KubeConfirmDialog
          title={kubeConfirm.type === 'delete-resource' ? `Confirm ${kubeConfirm.kindLabel?.toLowerCase() ?? 'resource'} deletion` : 'Confirm deployment restart'}
          message={kubeConfirm.type === 'all-deployments'
            ? `Restart all deployments in ${kubeConfirm.context}/${kubeConfirm.namespace}?`
            : kubeConfirm.type === 'delete-resource'
              ? `Delete ${kubeConfirm.kindLabel?.toLowerCase() ?? 'resource'} ${kubeConfirm.namespace ? `${kubeConfirm.namespace}/` : ''}${kubeConfirm.name}?`
              : `Restart deployment ${kubeConfirm.namespace}/${kubeConfirm.name}?`}
          warning={kubeConfirm.type === 'delete-resource'
            ? 'This permanently deletes the selected Kubernetes resource and cannot be undone.'
            : 'This updates the deployment pod template and triggers a rolling restart.'}
          confirmLabel={kubeConfirm.type === 'delete-resource' ? 'Delete' : 'Restart'}
          onConfirm={confirmKubeRestart}
          onCancel={() => setKubeConfirm(null)}
        />
      )}

      {kubeDescription && (
        <KubeDescribeDialog
          title={kubeDescription.title}
          json={kubeDescription.json}
          query={kubeDescription.query}
          error={kubeDescription.error}
          onQueryChange={(query) => setKubeDescription((prev) => prev ? { ...prev, query } : prev)}
          onClose={() => setKubeDescription(null)}
        />
      )}

      {showAddWorkspace && (
        <AddWorkspaceDialog
          onSave={handleAddWorkspaceSave}
          onClose={() => setShowAddWorkspace(false)}
          onBrowse={browseWorkspace}
          defaultBase={cfg?.base ?? 'main'}
          defaultRelease={cfg?.release ?? 'R10'}
          defaultSyncInterval={cfg?.syncInterval ?? 30}
        />
      )}

      {editWorkspace && (
        <AddWorkspaceDialog
          editWorkspace={editWorkspace}
          onEditSave={handleEditWorkspaceSave}
          onClose={() => setEditWorkspace(null)}
          onBrowse={browseWorkspace}
        />
      )}
    </div>
  );
}
