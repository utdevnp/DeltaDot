import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AppConfig, RepoState, View, CommitDetail, PR, PRDetail, JiraIssue, ConfigField, ThemeMode, Workspace } from '../core/types.js';
import { getVisibleConfigFields, WORKSPACE_COLORS } from '../core/types.js';
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
import { CommandBar } from './components/CommandBar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { WorkspacePanel } from './components/WorkspacePanel';
import { AddWorkspaceDialog } from './components/AddWorkspaceDialog';
import { CloneDialog } from './components/CloneDialog';

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
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Workspace management
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Auto-clear status message after 8 seconds
  const showStatus = useCallback((msg: string, isError = false) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusMessage(msg);
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
            color: WORKSPACE_COLORS[0] ?? '#58a6ff',
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

  const handleChangeView = useCallback(async (newView: 'list' | 'prs') => {
    setView(newView);
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
  }, [cfg, activeWorkspaceId, repos]);

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
    const color = WORKSPACE_COLORS[workspaces.length % WORKSPACE_COLORS.length] ?? '#58a6ff';
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (inputMode !== 'none') return;
      if (showConfig) return;
      if (showCloneDialog) return;
      if (showAddWorkspace) return;
      if (editWorkspace) return;

      // Global workspace shortcuts
      if (e.key === 'w' && !e.metaKey && !e.ctrlKey) {
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
            case 'Enter': {
              const pr = prs[selectedPR];
              if (pr && repos[selectedRepo]) {
                setPRDetailLoading(true);
                setPRDetailError('');
                (async () => {
                  try {
                    // Resolve the real owner/repo from the PR's own repo remote
                    // (PRs may come from another repo in all-repos mode)
                    const prRepo = pr.repoName ? repos.find((r) => r.name === pr.repoName) : null;
                    const repo = prRepo ?? repos[selectedRepo];
                    const remoteInfo = repo ? await window.api.getRemoteOwnerRepo(repo.path) : null;
                    const owner = remoteInfo?.owner ?? '';
                    const repoName = pr.repoName || remoteInfo?.repo || repo?.name || '';
                    const detail = await window.api.fetchPRDetail(
                      owner,
                      repoName,
                      pr.number,
                      cfg?.provider ?? 'github',
                      cfg?.token ?? '',
                    );
                    setPRDetail(detail);
                    setView('prdetail');
                  } catch (err) {
                    setPRDetailError(err instanceof Error ? err.message : String(err));
                  }
                  setPRDetailLoading(false);
                })();
              }
              break;
            }
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
            case 'r': {
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
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view, repos, selectedRepo, selectedCommit, prs, selectedPR, prDetail, cfg, inputMode, showConfig, reviewContext]);

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
            currentView={view === 'prs' ? 'prs' : 'list'}
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

          <BottomBar currentView={view} />

          {statusMessage && !statusMessage.includes('Loading') && (
            <div style={{
              padding: '6px 16px',
              background: statusMessage.toLowerCase().includes('fail') || statusMessage.toLowerCase().includes('error') || statusMessage.toLowerCase().includes('not')
                ? 'rgba(248,81,73,0.12)'
                : 'rgba(88,166,255,0.1)',
              borderTop: statusMessage.toLowerCase().includes('fail') || statusMessage.toLowerCase().includes('error') || statusMessage.toLowerCase().includes('not')
                ? '1px solid rgba(248,81,73,0.3)'
                : '1px solid rgba(88,166,255,0.2)',
              color: statusMessage.toLowerCase().includes('fail') || statusMessage.toLowerCase().includes('error') || statusMessage.toLowerCase().includes('not')
                ? '#f85149'
                : '#58a6ff',
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
        />
      )}

      {inputMode === 'search' && (
        <CommandBar
          mode="search"
          value={searchQuery}
          onChange={setSearchQuery}
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
