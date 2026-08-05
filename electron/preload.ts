import { contextBridge, ipcRenderer } from 'electron';
import { homedir } from 'os';
import type { AppConfig, RepoState, CacheFile, Provider, CommitDetail, PR, PRDetail, JiraIssue, Workspace } from '../core/types.js';

export interface DeltaDotAPI {
  homeDir: string;
  getAppInfo: () => Promise<{ version: string; name: string }>;
  initialize: (args: Partial<AppConfig>) => Promise<AppConfig>;
  findRepos: (workspace: string) => Promise<string[]>;
  loadCache: (workspace: string) => Promise<CacheFile | null>;
  saveCache: (cache: CacheFile) => Promise<void>;
  loadConfig: () => Promise<Partial<AppConfig>>;
  saveConfig: (cfg: AppConfig) => Promise<void>;
  getConfig: () => Promise<AppConfig | null>;
  syncOneRepo: (repoPath: string, base: string, release: string) => Promise<RepoState>;
  syncAllRepos: (repoPaths: string[], base: string, release: string) => Promise<RepoState[]>;
  fetchCommitDetail: (repoPath: string, hash: string) => Promise<CommitDetail>;
  getRemoteUrl: (repoPath: string) => Promise<string>;
  getRemoteOwnerRepo: (repoPath: string) => Promise<{ owner: string; repo: string } | null>;
  fetchPRs: (owner: string, repo: string, provider: Provider, token: string, repoName?: string, state?: string) => Promise<PR[]>;
  fetchPRDetail: (owner: string, repo: string, prNumber: number, provider: Provider, token: string) => Promise<PRDetail>;
  fetchJira: (config: { url: string; email: string; apiToken: string }, issueKey: string) => Promise<JiraIssue>;
  extractJiraKey: (...sources: string[]) => Promise<string | null>;
  fetchAIReview: (aiConfig: any, jiraDescription: string, files: any[]) => Promise<string>;
  streamAIReview: (
    aiConfig: any,
    jiraDescription: string,
    files: any[],
    onChunk: (text: string) => void,
  ) => Promise<string>;
  openUrl: (url: string) => Promise<void>;
  detectProvider: (remoteUrl: string) => Promise<Provider>;
  getCompareUrl: (remoteUrl: string, base: string, release: string) => Promise<string>;
  getPRsUrl: (remoteUrl: string) => Promise<string>;
  getCommitUrl: (remoteUrl: string, hash: string) => Promise<string>;
  selectWorkspace: () => Promise<string | null>;
  cloneRepo: (url: string, workspacePath: string) => Promise<{ success: boolean; path?: string; name?: string; error?: string }>;
  onSyncProgress: (callback: (progress: { done: number; total: number }) => void) => () => void;
  loadWorkspaces: () => Promise<Workspace[]>;
  loadActiveWorkspaceId: () => Promise<string | null>;
  addWorkspace: (ws: Workspace) => Promise<Workspace[]>;
  removeWorkspace: (id: string) => Promise<Workspace[]>;
  activateWorkspace: (id: string) => Promise<AppConfig>;
  saveWorkspaceConfig: (id: string, config: AppConfig) => Promise<void>;
  saveWorkspaces: (wsList: Workspace[]) => Promise<void>;
}

const api: DeltaDotAPI = {
  homeDir: homedir(),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  initialize: (args) => ipcRenderer.invoke('initialize', args),
  findRepos: (workspace) => ipcRenderer.invoke('find-repos', workspace),
  loadCache: (workspace) => ipcRenderer.invoke('load-cache', workspace),
  saveCache: (cache) => ipcRenderer.invoke('save-cache', cache),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  getConfig: () => ipcRenderer.invoke('get-config'),
  syncOneRepo: (repoPath, base, release) => ipcRenderer.invoke('sync-one-repo', repoPath, base, release),
  syncAllRepos: (repoPaths, base, release) => ipcRenderer.invoke('sync-all-repos', repoPaths, base, release),
  fetchCommitDetail: (repoPath, hash) => ipcRenderer.invoke('fetch-commit-detail', repoPath, hash),
  getRemoteUrl: (repoPath) => ipcRenderer.invoke('get-remote-url', repoPath),
  getRemoteOwnerRepo: (repoPath) => ipcRenderer.invoke('get-remote-owner-repo', repoPath),
  fetchPRs: (owner, repo, provider, token, repoName, state) => ipcRenderer.invoke('fetch-prs', owner, repo, provider, token, repoName, state),
  fetchPRDetail: (owner, repo, prNumber, provider, token) => ipcRenderer.invoke('fetch-pr-detail', owner, repo, prNumber, provider, token),
  fetchJira: (config, issueKey) => ipcRenderer.invoke('fetch-jira', config, issueKey),
  extractJiraKey: (...sources) => ipcRenderer.invoke('extract-jira-key', ...sources),
  fetchAIReview: (aiConfig, jiraDescription, files) => ipcRenderer.invoke('fetch-ai-review', aiConfig, jiraDescription, files),
  streamAIReview: (aiConfig, jiraDescription, files, onChunk) => {
    const chunkHandler = (_event: any, chunk: string) => onChunk(chunk);
    const doneHandler = () => {
      ipcRenderer.removeListener('ai-review-chunk', chunkHandler);
      ipcRenderer.removeListener('ai-review-done', doneHandler);
      ipcRenderer.removeListener('ai-review-error', errorHandler);
    };
    const errorHandler = (_event: any, err: string) => {
      ipcRenderer.removeListener('ai-review-chunk', chunkHandler);
      ipcRenderer.removeListener('ai-review-done', doneHandler);
      ipcRenderer.removeListener('ai-review-error', errorHandler);
    };
    ipcRenderer.on('ai-review-chunk', chunkHandler);
    ipcRenderer.on('ai-review-done', doneHandler);
    ipcRenderer.on('ai-review-error', errorHandler);
    return ipcRenderer.invoke('stream-ai-review', aiConfig, jiraDescription, files);
  },
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  detectProvider: (remoteUrl) => ipcRenderer.invoke('detect-provider', remoteUrl),
  getCompareUrl: (remoteUrl, base, release) => ipcRenderer.invoke('get-compare-url', remoteUrl, base, release),
  getPRsUrl: (remoteUrl) => ipcRenderer.invoke('get-prs-url', remoteUrl),
  getCommitUrl: (remoteUrl, hash) => ipcRenderer.invoke('get-commit-url', remoteUrl, hash),
  selectWorkspace: () => ipcRenderer.invoke('select-workspace'),
  cloneRepo: (url, workspacePath) => ipcRenderer.invoke('clone-repo', url, workspacePath),
  onSyncProgress: (callback) => {
    const handler = (_event: any, progress: { done: number; total: number }) => callback(progress);
    ipcRenderer.on('sync-progress', handler);
    return () => ipcRenderer.removeListener('sync-progress', handler);
  },
  loadWorkspaces: () => ipcRenderer.invoke('load-workspaces'),
  loadActiveWorkspaceId: () => ipcRenderer.invoke('load-active-workspace-id'),
  addWorkspace: (ws) => ipcRenderer.invoke('add-workspace', ws),
  removeWorkspace: (id) => ipcRenderer.invoke('remove-workspace', id),
  activateWorkspace: (id) => ipcRenderer.invoke('activate-workspace', id),
  saveWorkspaceConfig: (id, config) => ipcRenderer.invoke('save-workspace-config', id, config),
  saveWorkspaces: (wsList) => ipcRenderer.invoke('save-workspaces', wsList),
};

contextBridge.exposeInMainWorld('api', api);
