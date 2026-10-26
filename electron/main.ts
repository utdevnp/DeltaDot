import { app, BrowserWindow, ipcMain, shell, dialog, net } from 'electron';
import { join, dirname, resolve, basename, relative, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { writeFile, mkdtemp, rename, rm, lstat, realpath } from 'fs/promises';
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
  loadKubeContext,
  saveKubeContext,
} from '../core/config.js';
import { analyzeRepo, countCommitsSinceTag, fetchBranchCommits, fetchCommitDetail, getRepoGitInfo, run } from '../core/git.js';
import { commitLocalChanges, discardAllLocalChanges, discardLocalFile, fetchRepoTags, getLocalChanges } from '../core/local-changes.js';
import { forceReplaceRepo } from '../core/force-fetch.js';
import { getRemoteUrl, getCompareUrl, getPRsUrl, getCommitUrl } from '../core/remote.js';
import { getRemoteOwnerRepo, fetchPRs, fetchPRDetail, createPRComment, approvePR, detectProviderFromRemote } from '../core/pr.js';
import { fetchJiraIssue, extractJiraIssueKey } from '../core/services/tasks/jira.js';
import { fetchAIReview, streamAIReview } from '../core/services/ai/review.js';
import { getKubeContexts, getKubeNamespaces, getKubeDeployments, getKubeDeploymentDetail, getKubeDeploymentPods, getKubePodLogs, streamKubePodLogs, getKubeResources, restartKubeDeployment, restartAllKubeDeployments, deleteKubeJob, deleteKubeResource, describeKubeResource } from '../core/k8s.js';
import type { AppConfig, RepoState, CacheFile, Provider, ThemeMode, Workspace, KubeResourceKind, ForceFetchPreflight } from '../core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const kubeLogStreams = new Map<string, AbortController>();

// The Kubernetes client's undici request can surface an intentional abort as
// an uncaught exception after the IPC stop handler has completed. Aborting a
// log stream is normal user activity, so suppress only AbortError here; all
// other uncaught exceptions keep Electron's normal crash behavior.
process.on('uncaughtException', (error) => {
  if (error instanceof Error && error.name === 'AbortError') return;
  throw error;
});

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
    mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  // Diagnostics — surface load failures in the terminal
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[DeltaDot] did-fail-load (${code}): ${desc} — ${url}`);
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[DeltaDot] render-process-gone: ${JSON.stringify(details)}`);
  });
  mainWindow.webContents.on('console-message', (event: any) => {
    // Electron >= 32: single object event { level, message, lineNumber, sourceId }
    const message = event?.message ?? '';
    if (/error|fail|uncaught/i.test(message)) console.error(`[renderer] ${message}`);
  });

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
    releaseStartDate: cliArgs.releaseStartDate ?? savedCfg.releaseStartDate ?? '',
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

ipcMain.handle('clone-repo', async (_event, cloneUrl: string, workspacePath: string, override = false) => {
  let tempRoot: string | null = null;
  let keepRecoveryCopy = false;
  try {
    const normalizedUrl = cloneUrl.trim().replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
    const repoName = normalizedUrl.split(/[/:]/).pop() || 'repo';
    if (repoName === '.' || repoName === '..' || repoName !== basename(repoName)) throw new Error('Could not determine a safe repository folder name from this URL.');
    const workspace = resolve(workspacePath);
    const dest = join(workspace, repoName);
    if (resolve(dirname(dest)) !== workspace) throw new Error('The clone destination must be inside the selected workspace.');
    let destinationExists = false;
    try { await lstat(dest); destinationExists = true; }
    catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err; }
    if (destinationExists && !override) throw new Error(`A folder named "${repoName}" already exists. Enable Override existing repository to replace it with a clean clone.`);

    tempRoot = await mkdtemp(join(workspace, '.deltadot-clone-'));
    const cloneTarget = join(tempRoot, repoName);
    // Use GIT_SSH_COMMAND to auto-accept new host keys (non-interactive)
    const gitSshCmd = process.env.GIT_SSH_COMMAND || 'ssh -o StrictHostKeyChecking=accept-new';
    execFileSync('git', ['clone', cloneUrl, cloneTarget], {
      cwd: workspace,
      encoding: 'utf8',
      timeout: 120000, // 2 min timeout
      env: {
        ...process.env,
        GIT_SSH_COMMAND: gitSshCmd,
      },
    });
    if (destinationExists) {
      const recoveryPath = join(tempRoot, `${repoName}-previous`);
      await rename(dest, recoveryPath);
      try { await rename(cloneTarget, dest); }
      catch (swapError) {
        try { await rename(recoveryPath, dest); }
        catch (restoreError) {
          keepRecoveryCopy = true;
          throw new Error(`Could not install the clean clone. The previous repository is preserved at ${recoveryPath}. ${String(restoreError)}`);
        }
        throw swapError;
      }
    } else {
      await rename(cloneTarget, dest);
    }
    return { success: true, path: dest, name: repoName };
  } catch (err: any) {
    const msg = err?.stderr?.toString() || err?.message || String(err);
    // Clean up common error messages
    const cleaned = msg
      .replace(/^fatal:\s*/i, '')
      .replace(/^Cloning into.*?\n/i, '')
      .trim();
    return { success: false, error: cleaned };
  } finally {
    if (tempRoot && !keepRecoveryCopy) await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
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

ipcMain.handle('sync-one-repo', async (_event, repoPath: string, base: string, release: string, fetchMode: 'all' | 'origin' = 'all') => {
  const result = await analyzeRepo(repoPath, base, release, fetchMode);
  // Update in-memory list
  const idx = currentRepos.findIndex((r) => r.path === repoPath);
  if (idx !== -1) currentRepos[idx] = result;
  else currentRepos.push(result);
  return result;
});

ipcMain.handle('get-local-changes', (_event, repoPath: string) => getLocalChanges(repoPath));
ipcMain.handle('get-repo-git-info', (_event, repoPath: string) => getRepoGitInfo(repoPath));
ipcMain.handle('count-commits-since-tag', (_event, repoPath: string, branch: string) => countCommitsSinceTag(repoPath, branch));
ipcMain.handle('remove-repo-folder', async (_event, repoPath: string) => {
  if (!currentConfig?.workspace) throw new Error('No active workspace is configured.');
  const workspaceRoot = await realpath(resolve(currentConfig.workspace));
  const target = await realpath(resolve(repoPath));
  const pathFromWorkspace = relative(workspaceRoot, target);
  if (!pathFromWorkspace || pathFromWorkspace === '..' || pathFromWorkspace.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(pathFromWorkspace)) {
    throw new Error('Only a repository folder inside the active workspace can be removed.');
  }
  const gitRoot = await realpath(await run('git rev-parse --show-toplevel', target));
  if (gitRoot !== target) throw new Error('The selected folder is not the root of a Git repository.');
  await rm(target, { recursive: true, force: false });
  currentRepos = currentRepos.filter((repo) => repo.path !== repoPath);
});
ipcMain.handle('inspect-force-fetch', async (_event, repoPath: string): Promise<ForceFetchPreflight> => {
  let exists = false;
  let remoteUrl = '';
  try {
    const info = await lstat(resolve(repoPath));
    if (!info.isDirectory()) return { exists: false, remoteUrl: '', files: [], commitsAhead: null, aheadCommits: [], error: 'The repository path is not a directory.' };
    exists = true;
    await run('git rev-parse --is-inside-work-tree', repoPath);
    remoteUrl = await run('git remote get-url origin', repoPath);
    if (!remoteUrl) return { exists: true, remoteUrl: '', files: [], commitsAhead: null, aheadCommits: [], error: 'No origin remote is configured.' };
    const local = await getLocalChanges(repoPath);
    return { exists: true, remoteUrl, files: local.files, commitsAhead: local.commitsAhead, aheadCommits: local.aheadCommits };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { exists, remoteUrl, files: [], commitsAhead: null, aheadCommits: [], error };
  }
});
ipcMain.handle('force-replace-repo', async (event, operationId: string, repoPath: string, remoteUrl: string, base: string, release: string) => {
  const result = await forceReplaceRepo(repoPath, remoteUrl, base, release, (progress) => {
    event.sender.send('force-fetch-progress', operationId, progress);
  });
  const idx = currentRepos.findIndex((repo) => repo.path === repoPath);
  if (idx >= 0) currentRepos[idx] = result;
  else currentRepos.push(result);
  return result;
});
ipcMain.handle('discard-local-file', async (_event, repoPath: string, path: string, untracked: boolean) => {
  await discardLocalFile(repoPath, path, untracked);
  return getLocalChanges(repoPath);
});
ipcMain.handle('discard-all-local-changes', (_event, repoPath: string) => discardAllLocalChanges(repoPath));
ipcMain.handle('fetch-repo-tags', (_event, repoPath: string) => fetchRepoTags(repoPath));
ipcMain.handle('commit-local-changes', (_event, repoPath: string, paths: string[], message: string) => commitLocalChanges(repoPath, paths, message));

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

ipcMain.handle('fetch-branch-commits', async (_event, repoPath: string, branch: string) => {
  return fetchBranchCommits(repoPath, branch);
});

ipcMain.handle('get-remote-url', async (_event, repoPath: string) => {
  return getRemoteUrl(repoPath);
});

ipcMain.handle('get-remote-owner-repo', async (_event, repoPath: string) => {
  return getRemoteOwnerRepo(repoPath);
});

ipcMain.handle('fetch-prs', async (_event, owner: string, repo: string, provider: Provider, token: string, repoName?: string, state?: string, page?: number, pageSize?: number, sourceBranch?: string, targetBranch?: string) => {
  return fetchPRs(owner, repo, provider, token, repoName, state, page, pageSize, sourceBranch, targetBranch, net.fetch);
});

ipcMain.handle('fetch-pr-detail', async (_event, owner: string, repo: string, prNumber: number, provider: Provider, token: string) => {
  return fetchPRDetail(owner, repo, prNumber, provider, token);
});

ipcMain.handle('create-pr-comment', async (_event, owner: string, repo: string, prNumber: number, provider: Provider, token: string, body: string) => {
  return createPRComment(owner, repo, prNumber, provider, token, body);
});

ipcMain.handle('approve-pr', async (_event, owner: string, repo: string, prNumber: number, provider: Provider, token: string, body: string) => {
  return approvePR(owner, repo, prNumber, provider, token, body);
});

ipcMain.handle('get-git-user', async (_event, repoPath: string) => {
  // Fetch each value independently so a missing email doesn't swallow the name
  const name = await run('git config user.name', repoPath).catch(() => '');
  const email = await run('git config user.email', repoPath).catch(() => '');
  return { name, email };
});

ipcMain.handle('get-github-user', async (_event, token: string) => {
  try {
    const { getGitHubUser } = await import('../core/services/pr/github.js');
    return await getGitHubUser(token);
  } catch {
    return null;
  }
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

// ─── Kubernetes ──────────────────────────────────────────────────────────────

ipcMain.handle('k8s-contexts', async () => {
  return getKubeContexts();
});

ipcMain.handle('k8s-namespaces', async (_event, contextName: string) => {
  return getKubeNamespaces(contextName);
});

ipcMain.handle('k8s-deployments', async (_event, contextName: string, namespace: string) => {
  return getKubeDeployments(contextName, namespace);
});

ipcMain.handle('k8s-deployment-detail', async (_event, contextName: string, namespace: string, name: string) => {
  return getKubeDeploymentDetail(contextName, namespace, name);
});

ipcMain.handle('k8s-deployment-pods', async (_event, contextName: string, namespace: string, name: string) => {
  return getKubeDeploymentPods(contextName, namespace, name);
});

ipcMain.handle('k8s-pod-logs', async (_event, contextName: string, namespace: string, name: string, container?: string, tailLines?: number) => {
  return getKubePodLogs(contextName, namespace, name, container, tailLines);
});

ipcMain.handle('k8s-pod-log-stream-start', async (_event, streamId: string, contextName: string, namespace: string, name: string, container?: string) => {
  const existing = kubeLogStreams.get(streamId);
  existing?.abort();
  const controller = await streamKubePodLogs(contextName, namespace, name, container,
    (chunk) => mainWindow?.webContents.send('k8s-pod-log-chunk', streamId, chunk),
    () => mainWindow?.webContents.send('k8s-pod-log-stream-status', streamId, 'end'),
    (err) => mainWindow?.webContents.send('k8s-pod-log-stream-status', streamId, 'error', err instanceof Error ? err.message : String(err)),
  );
  kubeLogStreams.set(streamId, controller);
  controller.signal.addEventListener('abort', () => {
    if (kubeLogStreams.get(streamId) === controller) kubeLogStreams.delete(streamId);
  }, { once: true });
});

ipcMain.handle('k8s-pod-log-stream-stop', async (_event, streamId: string) => {
  const controller = kubeLogStreams.get(streamId);
  kubeLogStreams.delete(streamId);
  if (controller && !controller.signal.aborted) {
    try {
      controller.abort();
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) throw err;
    }
  }
});

ipcMain.handle('save-k8s-logs', async (_event, filename: string, content: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Save Kubernetes logs',
    defaultPath: filename,
    filters: [{ name: 'Log files', extensions: ['log', 'txt'] }],
  });
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, content, 'utf8');
  return result.filePath;
});

ipcMain.handle('k8s-restart-deployment', async (_event, contextName: string, namespace: string, name: string) => {
  return restartKubeDeployment(contextName, namespace, name);
});

ipcMain.handle('k8s-restart-all-deployments', async (_event, contextName: string, namespace: string) => {
  return restartAllKubeDeployments(contextName, namespace);
});

ipcMain.handle('k8s-delete-job', async (_event, contextName: string, namespace: string, name: string) => {
  return deleteKubeJob(contextName, namespace, name);
});

ipcMain.handle('k8s-delete-resource', async (_event, contextName: string, namespace: string, kind: KubeResourceKind, name: string) => {
  return deleteKubeResource(contextName, namespace, kind, name);
});

ipcMain.handle('k8s-describe-resource', async (_event, contextName: string, namespace: string, kind: KubeResourceKind, name: string) => {
  return describeKubeResource(contextName, namespace, kind, name);
});

ipcMain.handle('k8s-resources', async (_event, contextName: string, namespace: string, kind: string) => {
  return getKubeResources(contextName, namespace, kind);
});

ipcMain.handle('load-kube-context', async () => {
  return loadKubeContext();
});

ipcMain.handle('save-kube-context', async (_event, contextName: string) => {
  await saveKubeContext(contextName);
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
