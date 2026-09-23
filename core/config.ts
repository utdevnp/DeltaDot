import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { existsSync, statSync } from 'fs';
import { readdirSync } from 'fs';
import type { AppConfig, CacheFile, RepoState, Workspace } from './types.js';

export function dataDir(): string {
  return join(homedir(), '.deltadot');
}

export function globalConfigPath(): string {
  return join(dataDir(), 'config.json');
}

export function workspacesFilePath(): string {
  return join(dataDir(), 'workspaces.json');
}

export function workspaceConfigPath(workspaceId: string): string {
  return join(dataDir(), 'workspaces', workspaceId, 'config.json');
}

export async function loadGlobalConfig(): Promise<Partial<AppConfig>> {
  try {
    const raw = await readFile(globalConfigPath(), 'utf8');
    return JSON.parse(raw) as Partial<AppConfig>;
  } catch { return {}; }
}

export async function saveGlobalConfig(cfg: AppConfig): Promise<void> {
  try {
    const dir = dataDir();
    await mkdir(dir, { recursive: true });
    await writeFile(globalConfigPath(), JSON.stringify(cfg, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}

export async function loadWorkspaces(): Promise<Workspace[]> {
  try {
    const raw = await readFile(workspacesFilePath(), 'utf8');
    return JSON.parse(raw) as Workspace[];
  } catch { return []; }
}

export async function saveWorkspaces(workspaces: Workspace[]): Promise<void> {
  try {
    await mkdir(dataDir(), { recursive: true });
    await writeFile(workspacesFilePath(), JSON.stringify(workspaces, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}

export async function loadWorkspaceConfig(workspaceId: string): Promise<Partial<AppConfig>> {
  try {
    const raw = await readFile(workspaceConfigPath(workspaceId), 'utf8');
    return JSON.parse(raw) as Partial<AppConfig>;
  } catch { return {}; }
}

export async function saveWorkspaceConfig(workspaceId: string, config: AppConfig): Promise<void> {
  try {
    await mkdir(join(dataDir(), 'workspaces', workspaceId), { recursive: true });
    await writeFile(workspaceConfigPath(workspaceId), JSON.stringify(config, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}

export async function loadActiveWorkspaceId(): Promise<string | null> {
  try {
    const raw = await readFile(join(dataDir(), 'active-workspace'), 'utf8');
    return raw.trim() || null;
  } catch { return null; }
}

export async function saveActiveWorkspaceId(id: string): Promise<void> {
  try {
    await mkdir(dataDir(), { recursive: true });
    await writeFile(join(dataDir(), 'active-workspace'), id, 'utf8');
  } catch { /* non-fatal */ }
}

export async function loadKubeContext(): Promise<string | null> {
  try {
    const raw = await readFile(join(dataDir(), 'kube-context'), 'utf8');
    return raw.trim() || null;
  } catch { return null; }
}

export async function saveKubeContext(contextName: string): Promise<void> {
  try {
    await mkdir(dataDir(), { recursive: true });
    await writeFile(join(dataDir(), 'kube-context'), contextName, 'utf8');
  } catch { /* non-fatal */ }
}

export function cachePath(workspacePath: string): string {
  return join(workspacePath, '.deltadot-cache.json');
}

export async function loadCache(workspacePath: string): Promise<CacheFile | null> {
  try {
    const raw = await readFile(cachePath(workspacePath), 'utf8');
    return JSON.parse(raw) as CacheFile;
  } catch { return null; }
}

export async function saveCache(data: CacheFile): Promise<void> {
  try {
    await writeFile(cachePath(data.workspace), JSON.stringify(data, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}

export function findGitRepos(workspacePath: string): string[] {
  try {
    const entries = readdirSync(workspacePath, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && existsSync(join(workspacePath, e.name, '.git')))
      .map((e) => join(workspacePath, e.name));
  } catch { return []; }
}

export function resolveInitialRepos(
  repoPaths: string[],
  cache: CacheFile | null,
  finalCfg: AppConfig,
): { initialRepos: RepoState[]; initialLastSync: string } {
  let initialLastSync = '';

  if (cache && cache.base === finalCfg.base && cache.release === finalCfg.release) {
    const initialRepos = repoPaths.map((p) => {
      const name = p.split('/').pop() ?? p;
      const cached = cache.repos.find((r) => r.name === name);
      return cached
        ? { ...cached, status: 'stale' as const, currentBranch: cached.currentBranch ?? '', latestVersionDate: (cached as any).latestVersionDate ?? null }
        : { name, path: p, status: 'loading' as const, diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null, currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: null };
    });
    initialLastSync = cache.lastFullSync;
    return { initialRepos, initialLastSync };
  }

  const initialRepos = repoPaths.map((p) => ({
    name: p.split('/').pop() ?? p, path: p, status: 'loading' as const,
    diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null, currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: null,
  }));
  return { initialRepos, initialLastSync };
}

export function resolveCliConfig(cliOpts: { path?: string; base?: string; release?: string; syncInterval?: string; token?: string; provider?: string }, savedCfg: Partial<AppConfig>): AppConfig | null {
  const finalCfg: AppConfig = {
    workspace:    resolve(cliOpts.path ?? savedCfg.workspace ?? '.'),
    base:         cliOpts.base         ?? savedCfg.base         ?? 'main',
    release:      cliOpts.release      ?? savedCfg.release      ?? 'R10',
    releaseStartDate: savedCfg.releaseStartDate ?? '',
    syncInterval: cliOpts.syncInterval ? parseFloat(cliOpts.syncInterval)
                                        : (savedCfg.syncInterval ?? 10),
    token:        cliOpts.token        ?? savedCfg.token        ?? '',
    provider:     (cliOpts.provider    ?? savedCfg.provider     ?? 'github') as 'github' | 'gitlab' | 'bitbucket',
    taskProvider: savedCfg.taskProvider ?? 'none',
    jiraUrl:      savedCfg.jiraUrl      ?? '',
    jiraEmail:    savedCfg.jiraEmail    ?? '',
    jiraApiToken: savedCfg.jiraApiToken ?? '',
    aiProvider:   (savedCfg.aiProvider  ?? 'none') as any,
    aiApiKey:     savedCfg.aiApiKey     ?? '',
    aiApiUrl:     savedCfg.aiApiUrl     ?? '',
    aiModel:      savedCfg.aiModel      ?? 'gpt-4o',
    aiSystemPrompt: savedCfg.aiSystemPrompt ?? 'You are a senior software engineer conducting a code review. Review the provided PR changes against the Jira ticket description. Focus on correctness, performance, edge cases, and code style. Provide concise, actionable feedback.',
    theme:        savedCfg.theme        ?? 'system',
    defaultView:  savedCfg.defaultView  ?? 'list',
  };

  if (!existsSync(finalCfg.workspace)) {
    console.error(`Error: workspace path does not exist — ${finalCfg.workspace}`);
    return null;
  }
  if (!statSync(finalCfg.workspace).isDirectory()) {
    console.error(`Error: workspace path is not a directory — ${finalCfg.workspace}`);
    return null;
  }

  return finalCfg;
}
