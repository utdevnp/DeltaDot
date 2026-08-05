import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  loadGlobalConfig,
  saveGlobalConfig,
  loadCache,
  saveCache,
  findGitRepos,
  resolveInitialRepos,
  resolveCliConfig,
  loadWorkspaces,
  saveWorkspaces,
  loadWorkspaceConfig,
  saveWorkspaceConfig,
  loadActiveWorkspaceId,
  saveActiveWorkspaceId,
} from '../core/config.js';
import { analyzeRepo, fetchCommitDetail } from '../core/git.js';
import { getRemoteUrl, getCompareUrl, getPRsUrl, getCommitUrl } from '../core/remote.js';
import { getRemoteOwnerRepo, fetchPRs, fetchPRDetail, createPRComment, detectProviderFromRemote } from '../core/pr.js';
import { fetchJiraIssue, extractJiraIssueKey } from '../core/services/tasks/jira.js';
import { fetchAIReview, streamAIReview } from '../core/services/ai/review.js';
import type { AppConfig, RepoState, CacheFile, Provider, ThemeMode, Workspace } from '../core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

// ─── Window ────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'DeltaDot',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── State ──────────────────────────────────────────────────────────────────

let currentConfig: AppConfig | null = null;
let currentRepos: RepoState[] = [];
let currentCache: CacheFile | null = null;

// ─── IPC Handlers ───────────────────────────────────────────────────────────

ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  name: app.getName(),
}));

ipcMain.handle('initialize', async (_event, cliArgs: Partial<AppConfig>) => {
  const savedCfg = await loadGlobalConfig();
  const merged: AppConfig = {
    ...savedCfg,
    ...cliArgs,
    workspace: cliArgs.workspace ?? savedCfg.workspace ?? '',
    base: cliArgs.base ?? savedCfg.base ?? 'main',
    release: cliArgs.release ?? savedCfg.release ?? 'R10',
    syncInterval: cliArgs.syncInterval ?? savedCfg.syncInterval ?? 30,
    token: cliArgs.token ?? savedCfg.token ?? '',
    provider: (cliArgs.provider ?? savedCfg.provider ?? 'github') as Provider,
    taskProvider: savedCfg.taskProvider ?? 'none',
    jiraUrl: savedCfg.jiraUrl ?? '',
    jiraEmail: savedCfg.jiraEmail ?? '',
    jiraApiToken: savedCfg.jiraApiToken ?? '',
    aiProvider: (savedCfg.aiProvider ?? 'none') as any,
    aiApiKey: savedCfg.aiApiKey ?? '',
    aiApiUrl: savedCfg.aiApiUrl ?? '',
    aiModel: savedCfg.aiModel ?? 'gpt-4o',
    aiSystemPrompt: savedCfg.aiSystemPrompt ?? '',
    theme: (savedCfg.theme ?? 'system') as ThemeMode,
    defaultView: (savedCfg.defaultView ?? 'list') as 'list' | 'prs',
  };
  currentConfig = merged;
  return merged;
});

ipcMain.handle('select-workspace', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Workspace Directory',
    message: 'Choose a folder containing Git repositories to monitor',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('clone-repo', async (_event, cloneUrl: string, workspacePath: string) => {
  try {
    // Extract repo name from URL — works for both HTTPS and SSH
    const normalizedUrl = cloneUrl.replace(/\.git$/, '');
    const repoName = normalizedUrl.split('/').pop()?.split(':').pop() || 'repo';
    const dest = join(workspacePath, repoName);
    // Use GIT_SSH_COMMAND to auto-accept new host keys (non-interactive)
    const gitSshCmd = process.env.GIT_SSH_COMMAND || 'ssh -o StrictHostKeyChecking=accept-new';
    execSync(`git clone "${cloneUrl}" "${dest}"`, {
      cwd: workspacePath,
      encoding: 'utf8',
      timeout: 120000, // 2 min timeout
      env: {
        ...process.env,
        GIT_SSH_COMMAND: gitSshCmd,
      },
    });
    return { success: true, path: dest, name: repoName };
  } catch (err: any) {
    const msg = err?.stderr?.toString() || err?.message || String(err);
    // Clean up common error messages
    const cleaned = msg
      .replace(/^fatal:\s*/i, '')
      .replace(/^Cloning into.*?\n/i, '')
      .trim();
    return { success: false, error: cleaned };
  }
});

ipcMain.handle('find-repos', async (_event, workspace: string) => {
  return findGitRepos(workspace);
});

ipcMain.handle('load-cache', async (_event, workspace: string) => {
  currentCache = await loadCache(workspace);
  return currentCache;
});

ipcMain.handle('save-cache', async (_event, cache: CacheFile) => {
  currentCache = cache;
  await saveCache(cache);
});

ipcMain.handle('load-config', async () => {
  return loadGlobalConfig();
});

ipcMain.handle('save-config', async (_event, cfg: AppConfig) => {
  currentConfig = cfg;
  await saveGlobalConfig(cfg);
});

ipcMain.handle('get-config', () => currentConfig);

ipcMain.handle('sync-one-repo', async (_event, repoPath: string, base: string, release: string) => {
  const result = await analyzeRepo(repoPath, base, release);
  // Update in-memory list
  const idx = currentRepos.findIndex((r) => r.path === repoPath);
  if (idx !== -1) currentRepos[idx] = result;
  else currentRepos.push(result);
  return result;
});

ipcMain.handle('sync-all-repos', async (_event, repoPaths: string[], base: string, release: string) => {
  const total = repoPaths.length;
  const results: (RepoState | null)[] = new Array(total).fill(null);

  let lastProgressSent = 0;
  const PROGRESS_THROTTLE = 250;

  const sendProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressSent < PROGRESS_THROTTLE) return;
    lastProgressSent = now;
    const done = results.filter((r): r is RepoState => r !== null).length;
    mainWindow?.webContents.send('sync-progress', { done, total });
  };

  const promises = repoPaths.map((p, i) =>
    analyzeRepo(p, base, release)
      .then((result: RepoState) => {
        results[i] = result;
        sendProgress();
      })
      .catch((err: unknown) => {
        results[i] = {
          name: p.split('/').pop() ?? p,
          path: p,
          status: 'error' as const,
          diffCommits: [], latestCommits: [],
          latestVersion: null, latestVersionDate: null,
          currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '',
          error: err instanceof Error ? err.message : String(err),
        };
        sendProgress();
      })
  );

  await Promise.allSettled(promises);
  sendProgress(true);
  currentRepos = results.filter((r): r is RepoState => r !== null);
  return currentRepos;
});

ipcMain.handle('fetch-commit-detail', async (_event, repoPath: string, hash: string) => {
  return fetchCommitDetail(repoPath, hash);
});

ipcMain.handle('get-remote-url', async (_event, repoPath: string) => {
  return getRemoteUrl(repoPath);
});

ipcMain.handle('get-remote-owner-repo', async (_event, repoPath: string) => {
  return getRemoteOwnerRepo(repoPath);
});

ipcMain.handle('fetch-prs', async (_event, owner: string, repo: string, provider: Provider, token: string, repoName?: string, state?: string) => {
  return fetchPRs(owner, repo, provider, token, repoName, state);
});

ipcMain.handle('fetch-pr-detail', async (_event, owner: string, repo: string, prNumber: number, provider: Provider, token: string) => {
  return fetchPRDetail(owner, repo, prNumber, provider, token);
});

ipcMain.handle('create-pr-comment', async (_event, owner: string, repo: string, prNumber: number, provider: Provider, token: string, body: string) => {
  return createPRComment(owner, repo, prNumber, provider, token, body);
});

ipcMain.handle('fetch-jira', async (_event, config: { url: string; email: string; apiToken: string }, issueKey: string) => {
  return fetchJiraIssue(config, issueKey);
});

ipcMain.handle('extract-jira-key', async (_event, ...sources: string[]) => {
  return extractJiraIssueKey(...sources);
});

ipcMain.handle('fetch-ai-review', async (_event, aiConfig: any, jiraDescription: string, files: any[]) => {
  return fetchAIReview(aiConfig, jiraDescription, files);
});

ipcMain.handle('stream-ai-review', async (event, aiConfig: any, jiraDescription: string, files: any[]) => {
  try {
    const result = await streamAIReview(aiConfig, jiraDescription, files, (chunk) => {
      event.sender.send('ai-review-chunk', chunk);
    });
    event.sender.send('ai-review-done');
    return result;
  } catch (err: any) {
    event.sender.send('ai-review-error', err?.message ?? String(err));
    throw err;
  }
});

// ─── Workspace Management ──────────────────────────────────────────────────

ipcMain.handle('load-workspaces', async () => {
  return loadWorkspaces();
});

ipcMain.handle('add-workspace', async (_event, workspace: Workspace) => {
  const workspaces = await loadWorkspaces();
  const existing = workspaces.findIndex((w) => w.id === workspace.id);
  if (existing !== -1) {
    // Update existing workspace
    workspaces[existing] = workspace;
  } else {
    workspaces.push(workspace);
  }
  await saveWorkspaces(workspaces);
  await saveActiveWorkspaceId(workspace.id);
  return workspaces;
});

ipcMain.handle('remove-workspace', async (_event, id: string) => {
  let workspaces = await loadWorkspaces();
  workspaces = workspaces.filter((w) => w.id !== id);
  await saveWorkspaces(workspaces);
  return workspaces;
});

ipcMain.handle('activate-workspace', async (_event, id: string) => {
  const workspaces = await loadWorkspaces();
  const ws = workspaces.find((w) => w.id === id);
  if (!ws) throw new Error('Workspace not found');
  await saveActiveWorkspaceId(id);
  // Return config from per-workspace config file, falling back to workspace's stored config
  const saved = await loadWorkspaceConfig(id);
  const config: AppConfig = { ...ws.config, ...saved, workspace: ws.path };
  // Theme is always global — restore it from the global config, never per-workspace
  const globalCfg = await loadGlobalConfig();
  if (globalCfg?.theme) config.theme = globalCfg.theme;
  currentConfig = config;
  return config;
});

ipcMain.handle('load-active-workspace-id', async () => {
  return loadActiveWorkspaceId();
});

ipcMain.handle('save-workspace-config', async (_event, id: string, config: AppConfig) => {
  await saveWorkspaceConfig(id, config);
  const workspaces = await loadWorkspaces();
  const idx = workspaces.findIndex((w) => w.id === id);
  if (idx !== -1) {
    workspaces[idx]!.config = config;
    await saveWorkspaces(workspaces);
  }
  currentConfig = config;
});

ipcMain.handle('save-workspaces', async (_event, workspaces: Workspace[]) => {
  await saveWorkspaces(workspaces);
});

ipcMain.handle('open-url', async (_event, url: string) => {
  if (url) shell.openExternal(url);
});

ipcMain.handle('detect-provider', async (_event, remoteUrl: string) => {
  return detectProviderFromRemote(remoteUrl);
});

ipcMain.handle('get-compare-url', async (_event, remoteUrl: string, base: string, release: string) => {
  return getCompareUrl(remoteUrl, base, release);
});

ipcMain.handle('get-prs-url', async (_event, remoteUrl: string) => {
  return getPRsUrl(remoteUrl);
});

ipcMain.handle('get-commit-url', async (_event, remoteUrl: string, hash: string) => {
  return getCommitUrl(remoteUrl, hash);
});

// ─── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
