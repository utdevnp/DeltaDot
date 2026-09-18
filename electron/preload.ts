import { contextBridge, ipcRenderer } from 'electron';
import { homedir } from 'os';
import type { AppConfig, RepoState, CacheFile, Provider, CommitDetail, PRDetail, PRPage, JiraIssue, Workspace, KubeContext, KubeDeploymentSummary, KubeDeploymentDetail, KubeResourceKind, KubeResourceList } from '../core/types.js';

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
  fetchBranchCommits: (repoPath: string, branch: string) => Promise<import('../core/types.js').LatestCommit[]>;
  getRemoteUrl: (repoPath: string) => Promise<string>;
  getRemoteOwnerRepo: (repoPath: string) => Promise<{ owner: string; repo: string } | null>;
  fetchPRs: (owner: string, repo: string, provider: Provider, token: string, repoName?: string, state?: string, page?: number, pageSize?: number) => Promise<PRPage>;
  fetchPRDetail: (owner: string, repo: string, prNumber: number, provider: Provider, token: string) => Promise<PRDetail>;
  createPRComment: (owner: string, repo: string, prNumber: number, provider: Provider, token: string, body: string) => Promise<string>;
  approvePR: (owner: string, repo: string, prNumber: number, provider: Provider, token: string, body: string) => Promise<void>;
  getGitUser: (repoPath: string) => Promise<{ name: string; email: string }>;
  getGitHubUser: (token: string) => Promise<{ login: string; name: string } | null>;
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
  k8sContexts: () => Promise<KubeContext[]>;
  k8sNamespaces: (contextName: string) => Promise<string[]>;
  k8sDeployments: (contextName: string, namespace: string) => Promise<KubeDeploymentSummary[]>;
  k8sDeploymentDetail: (contextName: string, namespace: string, name: string) => Promise<KubeDeploymentDetail>;
  k8sDeploymentPods: (contextName: string, namespace: string, name: string) => Promise<KubeResourceList>;
  k8sPodLogs: (contextName: string, namespace: string, name: string, container?: string, tailLines?: number) => Promise<string>;
  k8sPodLogStreamStart: (streamId: string, contextName: string, namespace: string, name: string, container?: string) => Promise<void>;
  k8sPodLogStreamStop: (streamId: string) => Promise<void>;
  onK8sPodLogChunk: (callback: (streamId: string, chunk: string) => void) => () => void;
  onK8sPodLogStreamStatus: (callback: (streamId: string, status: 'end' | 'error', message?: string) => void) => () => void;
  saveK8sLogs: (filename: string, content: string) => Promise<string | null>;
  k8sRestartDeployment: (contextName: string, namespace: string, name: string) => Promise<void>;
  k8sRestartAllDeployments: (contextName: string, namespace: string) => Promise<number>;
  k8sDeleteJob: (contextName: string, namespace: string, name: string) => Promise<void>;
  k8sDeleteResource: (contextName: string, namespace: string, kind: KubeResourceKind, name: string) => Promise<void>;
  k8sDescribeResource: (contextName: string, namespace: string, kind: KubeResourceKind, name: string) => Promise<string>;
  k8sResources: (contextName: string, namespace: string, kind: string) => Promise<KubeResourceList>;
  loadKubeContext: () => Promise<string | null>;
  saveKubeContext: (contextName: string) => Promise<void>;
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
  fetchBranchCommits: (repoPath, branch) => ipcRenderer.invoke('fetch-branch-commits', repoPath, branch),
  getRemoteUrl: (repoPath) => ipcRenderer.invoke('get-remote-url', repoPath),
  getRemoteOwnerRepo: (repoPath) => ipcRenderer.invoke('get-remote-owner-repo', repoPath),
  fetchPRs: (owner, repo, provider, token, repoName, state, page, pageSize) => ipcRenderer.invoke('fetch-prs', owner, repo, provider, token, repoName, state, page, pageSize),
  fetchPRDetail: (owner, repo, prNumber, provider, token) => ipcRenderer.invoke('fetch-pr-detail', owner, repo, prNumber, provider, token),
  createPRComment: (owner, repo, prNumber, provider, token, body) => ipcRenderer.invoke('create-pr-comment', owner, repo, prNumber, provider, token, body),
  approvePR: (owner, repo, prNumber, provider, token, body) => ipcRenderer.invoke('approve-pr', owner, repo, prNumber, provider, token, body),
  getGitUser: (repoPath) => ipcRenderer.invoke('get-git-user', repoPath),
  getGitHubUser: (token) => ipcRenderer.invoke('get-github-user', token),
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
  k8sContexts: () => ipcRenderer.invoke('k8s-contexts'),
  k8sNamespaces: (contextName) => ipcRenderer.invoke('k8s-namespaces', contextName),
  k8sDeployments: (contextName, namespace) => ipcRenderer.invoke('k8s-deployments', contextName, namespace),
  k8sDeploymentDetail: (contextName, namespace, name) => ipcRenderer.invoke('k8s-deployment-detail', contextName, namespace, name),
  k8sDeploymentPods: (contextName, namespace, name) => ipcRenderer.invoke('k8s-deployment-pods', contextName, namespace, name),
  k8sPodLogs: (contextName, namespace, name, container, tailLines) => ipcRenderer.invoke('k8s-pod-logs', contextName, namespace, name, container, tailLines),
  k8sPodLogStreamStart: (streamId, contextName, namespace, name, container) => ipcRenderer.invoke('k8s-pod-log-stream-start', streamId, contextName, namespace, name, container),
  k8sPodLogStreamStop: (streamId) => ipcRenderer.invoke('k8s-pod-log-stream-stop', streamId),
  onK8sPodLogChunk: (callback) => {
    const handler = (_event: any, streamId: string, chunk: string) => callback(streamId, chunk);
    ipcRenderer.on('k8s-pod-log-chunk', handler);
    return () => ipcRenderer.removeListener('k8s-pod-log-chunk', handler);
  },
  onK8sPodLogStreamStatus: (callback) => {
    const handler = (_event: any, streamId: string, status: 'end' | 'error', message?: string) => callback(streamId, status, message);
    ipcRenderer.on('k8s-pod-log-stream-status', handler);
    return () => ipcRenderer.removeListener('k8s-pod-log-stream-status', handler);
  },
  saveK8sLogs: (filename, content) => ipcRenderer.invoke('save-k8s-logs', filename, content),
  k8sRestartDeployment: (contextName, namespace, name) => ipcRenderer.invoke('k8s-restart-deployment', contextName, namespace, name),
  k8sRestartAllDeployments: (contextName, namespace) => ipcRenderer.invoke('k8s-restart-all-deployments', contextName, namespace),
  k8sDeleteJob: (contextName, namespace, name) => ipcRenderer.invoke('k8s-delete-job', contextName, namespace, name),
  k8sDeleteResource: (contextName, namespace, kind, name) => ipcRenderer.invoke('k8s-delete-resource', contextName, namespace, kind, name),
  k8sDescribeResource: (contextName, namespace, kind, name) => ipcRenderer.invoke('k8s-describe-resource', contextName, namespace, kind, name),
  k8sResources: (contextName, namespace, kind) => ipcRenderer.invoke('k8s-resources', contextName, namespace, kind),
  loadKubeContext: () => ipcRenderer.invoke('load-kube-context'),
  saveKubeContext: (contextName) => ipcRenderer.invoke('save-kube-context', contextName),
};

contextBridge.exposeInMainWorld('api', api);
