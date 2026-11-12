import { readdirSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { existsSync, statSync } from 'fs';
import { database } from './sqlite-storage.js';
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
  return database().loadGlobalConfig();
}

export async function saveGlobalConfig(cfg: AppConfig): Promise<void> {
  database().saveGlobalConfig(cfg);
}

export async function loadWorkspaces(): Promise<Workspace[]> {
  return database().loadWorkspaces();
}

export async function saveWorkspaces(workspaces: Workspace[]): Promise<void> {
  database().saveWorkspaces(workspaces);
}

export async function loadWorkspaceConfig(workspaceId: string): Promise<Partial<AppConfig>> {
  return database().loadWorkspaceConfig(workspaceId);
}

export async function saveWorkspaceConfig(workspaceId: string, config: AppConfig): Promise<void> {
  database().saveWorkspaceConfig(workspaceId, config);
}

export async function loadActiveWorkspaceId(): Promise<string | null> {
  return database().loadActiveWorkspaceId();
}

export async function saveActiveWorkspaceId(id: string): Promise<void> {
  database().saveActiveWorkspaceId(id);
}

export async function loadKubeContext(): Promise<string | null> {
  return database().loadKubeContext();
}

export async function saveKubeContext(contextName: string): Promise<void> {
  database().saveKubeContext(contextName);
}

export function cachePath(workspacePath: string): string {
  return join(workspacePath, '.deltadot-cache.json');
}

export async function loadCache(workspacePath: string, base?: string, release?: string): Promise<CacheFile | null> {
  return database().loadCache(workspacePath, base, release);
}

export async function saveCache(data: CacheFile): Promise<void> {
  database().saveCache(data);
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
    deploymentMappingView: savedCfg.deploymentMappingView ?? 'all',
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
