import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AppConfig, RepoState, View, CommitDetail, PR, PRDetail, JiraIssue, ConfigField, ThemeMode } from '../core/types.js';
import { getVisibleConfigFields } from '../core/types.js';
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

  // Search / Command
  const [inputMode, setInputMode] = useState<'none' | 'search' | 'command'>('none');
  const [searchQuery, setSearchQuery] = useState('');

  // PR state
  const [prs, setPRs] = useState<PR[]>([]);
  const [selectedPR, setSelectedPR] = useState(0);
  const [prLoading, setPRLoading] = useState(false);
  const [prError, setPRError] = useState('');
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

  // ─── Initialize ──────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const config = await window.api.initialize({});
        setCfg(config);
        setWorkspacePath(config.workspace);

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
                : { name, path: p, status: 'loading' as const, diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null, currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: null };
            });
            lastSyncTime = cache.lastFullSync;
          } else {
            initialRepos = paths.map((p: string) => ({
              name: p.split('/').pop() ?? p, path: p, status: 'loading' as const,
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

  // ─── Workspace Selection ──────────────────────────────────────────────────

  const selectWorkspace = useCallback(async () => {
    try {
      const folder = await window.api.selectWorkspace();
      if (!folder) return;

      setWorkspacePath(folder);
      setStatusMessage('Loading repos...');

      const paths = await window.api.findRepos(folder);
      setRepoPaths(paths);

      const cache = await window.api.loadCache(folder);
      let initialRepos: RepoState[];
      if (cache && cache.base) {
        initialRepos = paths.map((p: string) => {
          const name = p.split('/').pop() ?? p;
          const cached = cache.repos.find((r: RepoState) => r.name === name);
          return cached
            ? { ...cached, status: 'stale' as const }
            : { name, path: p, status: 'loading' as const, diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null, currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: null };
        });
        setLastSync(cache.lastFullSync);
      } else {
        initialRepos = paths.map((p: string) => ({
          name: p.split('/').pop() ?? p, path: p, status: 'loading' as const,
          diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null,
          currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: null,
        }));
      }
      setRepos(initialRepos);

      // Persist config
      try {
        const saved = await window.api.loadConfig();
        saved.workspace = folder;
        if (saved) await window.api.saveConfig(saved as AppConfig);
      } catch { /* non-fatal */ }

      setStatusMessage('');
      setView('list');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('selectWorkspace error:', msg);
      setStatusMessage('Failed to select workspace: ' + msg);
    }
  }, []);

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

    const results: RepoState[] = [];
    for (let i = 0; i < repoPaths.length; i++) {
      try {
        const result = await window.api.syncOneRepo(repoPaths[i], cfg.base, cfg.release);
        results.push(result);
      } catch (err) {
        results.push({
          name: repoPaths[i].split('/').pop() ?? repoPaths[i],
          path: repoPaths[i],
          status: 'error',
          diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null,
          currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      setSyncProgress({ done: i + 1, total: repoPaths.length });
    }

    setRepos(results);
    const now = new Date().toISOString();
    setLastSync(now);
    setIsSyncing(false);

    // Save cache
    try {
      await window.api.saveCache({
        workspace: cfg.workspace,
        base: cfg.base,
        release: cfg.release,
        lastFullSync: now,
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

  // ─── Auto-sync ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!cfg || cfg.syncInterval <= 0) return;
    const interval = setInterval(syncAll, cfg.syncInterval * 60 * 1000);
    return () => clearInterval(interval);
  }, [cfg, syncAll]);

  // ─── PR Fetching ─────────────────────────────────────────────────────────

  const fetchPRsForRepo = useCallback(async (repoPath: string) => {
    if (!cfg) return;
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
      const result = await window.api.fetchPRs(remoteInfo.owner, remoteInfo.repo, provider, cfg.token);
      if (result.length === 0) {
        setPRError('No open pull requests found for this repository.');
      }
      setPRs(result);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // Map common API errors to user-friendly messages
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
  }, [cfg]);

  // ─── Keyboard Handler ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (inputMode !== 'none') return;
      if (showConfig) return;
      if (showCloneDialog) return;

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
                showStatus('No repositories to inspect. Select a workspace first.', true);
              } else if (!repos[selectedRepo]) {
                showStatus('No repo selected.', true);
              } else if (repos[selectedRepo].status === 'loading' || repos[selectedRepo].status === 'syncing') {
                showStatus('Repo still loading. Wait for sync to finish.', true);
              } else {
                setView('commits');
                setSelectedCommit(0);
              }
              break;
            }
            case 's': {
              if (repos.length === 0) {
                showStatus('No repositories to sync. Select a workspace first.', true);
              } else if (selectedRepo < repos.length && repos[selectedRepo]) {
                if (repos[selectedRepo].status === 'syncing') {
                  showStatus('Already syncing this repo.', true);
                } else {
                  syncOne(repos[selectedRepo].path);
                }
              }
              break;
            }
            case 'S':
              if (repos.length === 0) {
                showStatus('No repositories to sync. Select a workspace first.', true);
              } else {
                syncAll();
              }
              break;
            case 'e':
              setShowConfig(true);
              break;
            case 'P': {
              if (repos.length === 0) {
                showStatus('No workspace selected. Select a workspace first.', true);
              } else if (!repos[selectedRepo]) {
                showStatus('No repo selected.', true);
              } else if (!cfg?.token || cfg.token.trim() === '') {
                showStatus('API token not configured. Press e to open settings.', true);
              } else {
                setView('prs');
                setPRError('');
                fetchPRsForRepo(repos[selectedRepo].path);
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
                showStatus('No repo selected to open.', true);
              } else if (!cfg) {
                showStatus('Config not loaded.', true);
              } else {
                window.api.getRemoteUrl(repos[selectedRepo].path).then((url) => {
                  if (!url) {
                    showStatus('No remote URL found for this repository.', true);
                    return;
                  }
                  window.api.getCompareUrl(url, cfg.base, cfg.release).then((compareUrl) => {
                    if (!compareUrl) {
                      showStatus('Could not generate compare URL.', true);
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
                window.api.fetchPRDetail(
                  pr.repoName ? '' : (() => { const x = repos[selectedRepo]; return x.name; })(),
                  pr.repoName ?? repos[selectedRepo]?.name ?? '',
                  pr.number,
                  cfg?.provider ?? 'github',
                  cfg?.token ?? '',
                ).then((detail) => {
                  setPRDetail(detail);
                  setView('prdetail');
                  setPRDetailLoading(false);
                }).catch((err) => {
                  setPRDetailError(err instanceof Error ? err.message : String(err));
                  setPRDetailLoading(false);
                });
              }
              break;
            }
            case 'S':
              syncAll().then(() => {
                if (repos[selectedRepo]) fetchPRsForRepo(repos[selectedRepo].path);
              });
              break;
            case 'R': {
              const pr = prs[selectedPR];
              if (pr && repos[selectedRepo]) {
                setReviewContext({
                  repoPath: repos[selectedRepo].path,
                  prNumber: pr.number,
                  returnView: 'prs',
                });
                setView('review');
                setReviewLoading(true);
                setReviewError('');
                // Load Jira + PR detail
                (async () => {
                  try {
                    const prDetail = await window.api.fetchPRDetail(
                      pr.repoName ? '' : repos[selectedRepo].name,
                      pr.repoName ?? repos[selectedRepo].name,
                      pr.number,
                      cfg?.provider ?? 'github',
                      cfg?.token ?? '',
                    );
                    setPRDetail(prDetail);
                    const remoteInfo = await window.api.getRemoteOwnerRepo(repos[selectedRepo].path);
                    const jiraConfig = cfg ? { url: cfg.jiraUrl, email: cfg.jiraEmail, apiToken: cfg.jiraApiToken } : null;
                    if (jiraConfig?.url && jiraConfig.email) {
                      const key = await window.api.extractJiraKey(
                        pr.title, prDetail.description || '', pr.sourceBranch,
                      );
                      if (key) {
                        try {
                          const jira = await window.api.fetchJira(jiraConfig, key);
                          setReviewJira(jira);
                        } catch { /* jira optional */ }
                      }
                    }
                    setReviewLoading(false);
                  } catch (err) {
                    setReviewError(err instanceof Error ? err.message : String(err));
                    setReviewLoading(false);
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
                setReviewContext({
                  repoPath: repos[selectedRepo]?.path ?? '',
                  prNumber: prDetail.number,
                  returnView: 'prdetail',
                });
                setView('review');
                setReviewLoading(true);
                setReviewError('');
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
                          setReviewJira(jira);
                        } catch { /* jira optional */ }
                      }
                    }
                    setReviewLoading(false);
                  } catch (err) {
                    setReviewError(err instanceof Error ? err.message : String(err));
                    setReviewLoading(false);
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
  }, [view, repos, selectedRepo, selectedCommit, prs, selectedPR, prDetail, cfg, inputMode, showConfig, reviewContext, syncOne, syncAll, fetchPRsForRepo, showStatus]);

  // ─── Filtered Repos ──────────────────────────────────────────────────────

  const filteredRepos = searchQuery
    ? repos.filter((r) => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : repos;

  // ─── Config Save ─────────────────────────────────────────────────────────

  const handleConfigSave = useCallback(async (newConfig: AppConfig) => {
    await window.api.saveConfig(newConfig);
    setCfg(newConfig);
    setWorkspacePath(newConfig.workspace);
    setShowConfig(false);
    // Re-init with new config
    if (newConfig.workspace) {
      const paths = await window.api.findRepos(newConfig.workspace);
      setRepoPaths(paths);
      setRepos(paths.map((p: string) => ({
        name: p.split('/').pop() ?? p, path: p, status: 'loading' as const,
        diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null,
        currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: null,
      })));
    }
  }, []);

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
    showStatus(`Cloned ${name}. Syncing...`);

    if (cfg) {
      try {
        const result = await window.api.syncOneRepo(path, cfg.base, cfg.release);
        setRepos((prev) => prev.map((r) => r.path === path ? result : r));
        showStatus(`${name} synced`);
      } catch {
        showStatus(`Failed to sync ${name}`, true);
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
            onSelect={setSelectedPR}
            onBack={() => setView('list')}
            onOpenConfig={() => setShowConfig(true)}
            onSelectPR={() => {
              const pr = prs[selectedPR];
              if (pr && repos[selectedRepo]) {
                setPRDetailLoading(true);
                setPRDetailError('');
                window.api.fetchPRDetail(
                  '',
                  pr.repoName ?? repos[selectedRepo].name,
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
            onBack={() => setView('prs')}
            onReview={() => {
              setReviewContext({
                repoPath: repos[selectedRepo]?.path ?? '',
                prNumber: prDetail.number,
                returnView: 'prdetail',
              });
              setView('review');
              setReviewLoading(true);
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
                        setReviewJira(jira);
                      } catch { /* jira optional */ }
                    }
                  }
                } catch {}
                setReviewLoading(false);
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
            onSyncAll={syncAll}
            onSelectWorkspace={selectWorkspace}
            onOpenConfig={() => setShowConfig(true)}
            theme={cfg.theme}
            onToggleTheme={toggleTheme}
          />

          <div className="main-content">
            {renderView()}
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
          onSelectWorkspace={selectWorkspace}
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
                syncAll();
                break;
              case 'prs':
                if (repos[selectedRepo]) {
                  setView('prs');
                  fetchPRsForRepo(repos[selectedRepo].path);
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
    </div>
  );
}
