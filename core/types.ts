// ─── Types ────────────────────────────────────────────────────────────────────

export type RepoStatus = 'loading' | 'stale' | 'syncing' | 'synced' | 'behind' | 'error';
export type View = 'home' | 'list' | 'commits' | 'detail' | 'config' | 'prs' | 'prdetail' | 'review' | 'k8s';
export type InputMode = 'none' | 'search' | 'command';
export type Provider = 'github' | 'gitlab' | 'bitbucket';
export type TaskProvider = 'none' | 'jira' | 'clickup' | 'github';
export type ThemeMode = 'dark' | 'light' | 'system';

export interface Workspace {
  id: string;
  name: string;
  displayName?: string;
  path: string;
  color: string;
  isDefault?: boolean;
  config: AppConfig;
}

export const WORKSPACE_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#f97316', '#ec4899', '#8b5cf6', '#14b8a6',
] as const;

export interface AppConfig {
  workspace: string;
  base: string;
  release: string;
  releaseStartDate?: string;
  syncInterval: number;
  token: string;
  provider: Provider;
  taskProvider: TaskProvider;
  jiraUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  aiProvider: 'none' | 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openrouter' | 'deepseek';
  aiApiKey: string;
  aiApiUrl: string;
  aiModel: string;
  aiSystemPrompt: string;
  theme: ThemeMode;
  defaultView?: 'list' | 'prs';
  ignoredRepos?: string[];
}

export interface CommitEntry {
  hash: string;
  message: string;
  author?: string;
  age?: string;
  date?: string;
}

export interface LatestCommit {
  hash: string;
  subject: string;
  author: string;
  age: string;
  date?: string;
}

export interface CommitDetail {
  hash: string;
  author: string;
  date: string;
  subject: string;
  body: string;
  stat: string;
  files?: CommitFile[];
  rawPatch?: string;
}

export interface CommitFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface RepoState {
  name: string;
  path: string;
  status: RepoStatus;
  diffCommits: CommitEntry[];
  latestCommits: LatestCommit[];
  baseCommits?: LatestCommit[];
  lastCommitMsg: string;
  lastCommitAge: string;
  lastCommitAuthor: string;
  latestVersion: string | null;
  latestVersionDate: string | null;
  currentBranch: string;
  error: string | null;
  missingRelease?: boolean;
}

export interface CacheFile {
  workspace: string;
  base: string;
  release: string;
  lastFullSync: string;
  repos: RepoState[];
  prs?: PR[];
  aiReviews?: Record<string, string>;
}

export interface PR {
  number: number;
  title: string;
  author: string;
  state: string;
  sourceBranch: string;
  targetBranch: string;
  createdAt: string;
  url: string;
  repoName: string;
  approved: boolean;
  hasConflicts?: boolean;
}

export interface PRPage {
  prs: PR[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PRCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface PRComment {
  id: string;
  type: 'issue' | 'review' | 'pending';
  author: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  path?: string;
  line?: string;
}

export interface PRDetail {
  number: number;
  title: string;
  description: string;
  author: string;
  state: string;
  draft?: boolean;
  sourceBranch: string;
  targetBranch: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  mergedBy?: string;
  mergedAt?: string;
  mergeCommitSha?: string;
  commentsCount?: number;
  reviewCommentsCount?: number;
  requestedReviewers?: string[];
  approvedBy?: string[];
  changesRequestedBy?: string[];
  commentedBy?: string[];
  assignees?: string[];
  comments: PRComment[];
  reviewers: string[];
  labels: string[];
  repoName?: string;
  
  // New fields
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  commitsCount?: number;
  commits?: PRCommit[];
  files?: PRFile[];
  aiReview?: string;
}

export interface PRFile {
  path: string;
  additions: number;
  deletions: number;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  previousPath?: string;
  patch?: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  status: string;
  issueType: string;
  assignee: string;
  reporter: string;
  updatedAt?: string;
  url: string;
}

export type ConfigField = 'workspace' | 'base' | 'release' | 'releaseStartDate' | 'syncInterval' | 'token' | 'provider' | 'taskProvider' | 'jiraUrl' | 'jiraEmail' | 'jiraApiToken' | 'aiProvider' | 'aiApiKey' | 'aiApiUrl' | 'aiModel' | 'aiSystemPrompt' | 'theme';

export const CONFIG_FIELDS: ConfigField[] = ['workspace', 'base', 'release', 'releaseStartDate', 'syncInterval', 'token', 'provider', 'taskProvider', 'jiraUrl', 'jiraEmail', 'jiraApiToken', 'aiProvider', 'aiApiKey', 'aiApiUrl', 'aiModel', 'aiSystemPrompt', 'theme'];

export function getVisibleConfigFields(taskProvider: TaskProvider, aiProvider: string): ConfigField[] {
  const fields: ConfigField[] = ['workspace', 'base', 'release', 'releaseStartDate', 'syncInterval', 'token', 'provider', 'taskProvider'];
  if (taskProvider === 'jira') {
    fields.push('jiraUrl', 'jiraEmail', 'jiraApiToken');
  }
  fields.push('aiProvider');
  if (aiProvider && aiProvider !== 'none') {
    fields.push('aiApiKey', 'aiApiUrl', 'aiModel', 'aiSystemPrompt');
  }
  return fields;
}

export const CONFIG_LABELS: Record<ConfigField, string> = {
  workspace:    'Workspace Path',
  base:         'Base Branch',
  release:      'Release Branch',
  releaseStartDate: 'Release Start Date',
  syncInterval: 'Sync Interval (min)',
  token:        'API Token',
  provider:     'Provider',
  taskProvider: 'Task Provider',
  jiraUrl:      'Jira URL',
  jiraEmail:    'Jira Email',
  jiraApiToken: 'Jira API Token',
  aiProvider:     'AI Provider',
  aiApiKey:       'AI API Key',
  aiApiUrl:       'AI API URL',
  aiModel:        'AI Model',
  aiSystemPrompt: 'AI System Prompt',
  theme: 'Theme',
};

// ─── Kubernetes ──────────────────────────────────────────────────────────────

export interface KubeContext {
  name: string;
  cluster: string;
  namespace: string; // default namespace from the kubeconfig context (may be empty)
  current: boolean;
}

export interface KubeDeploymentSummary {
  name: string;
  namespace: string;
  image: string; // primary (first) container image
  replicas: number;
  ready: number;
  available: number;
  updated: number;
  strategy: string;
  createdAt: string; // ISO timestamp
  lastUpdated: string; // newest status-condition update time (ISO), '' when unknown
}

export interface KubeContainerPort {
  name?: string;
  containerPort: number;
  protocol?: string;
}

export interface KubeEnvVar {
  name: string;
  value?: string;
  valueFrom?: string; // human-readable source, e.g. "secretRef:my-secret/KEY"
}

export interface KubeResourceSpec {
  requests?: Record<string, string>;
  limits?: Record<string, string>;
}

export interface KubeProbe {
  type: string;
  detail: string; // human-readable probe definition
  initialDelaySeconds?: number;
  periodSeconds?: number;
}

export interface KubeContainer {
  name: string;
  image: string;
  imagePullPolicy?: string;
  ports: KubeContainerPort[];
  env: KubeEnvVar[];
  resources?: KubeResourceSpec;
  command?: string[];
  args?: string[];
  livenessProbe?: KubeProbe | null;
  readinessProbe?: KubeProbe | null;
  startupProbe?: KubeProbe | null;
}

export interface KubeDeploymentDetail {
  name: string;
  namespace: string;
  createdAt: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  replicas: number;
  ready: number;
  available: number;
  updated: number;
  strategyType: string;
  maxSurge?: string;
  maxUnavailable?: string;
  selector: Record<string, string>;
  containers: KubeContainer[];
  conditions: { type: string; status: string; reason?: string }[];
}

// ─── Kubernetes comparison (pure, renderer-safe) ────────────────────────────

export type KubeDiffStatus = 'same' | 'changed' | 'left-only' | 'right-only';

export interface KubeDiffRow {
  key: string;
  label: string;
  left?: string;
  right?: string;
  status: KubeDiffStatus;
}

export interface KubeDiffSection {
  title: string;
  rows: KubeDiffRow[];
}

// ─── Kubernetes tabs (renderer state) ───────────────────────────────────────

export interface KubeWorkloadTab {
  id: string; // `${namespace}/${name}`
  context: string;
  name: string;
  namespace: string;
  label?: string; // custom tab label (rename), defaults to `${namespace}/${name}`
  mode?: 'deployment' | 'pod-containers' | 'pod-logs';
  detail: KubeDeploymentDetail | null;
  pods?: KubeResourceList | null;
  selectedPod?: number;
  containers?: string[];
  selectedContainer?: number;
  logs?: string;
  container?: string;
  watch?: boolean;
  streamStatus?: 'stopped' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  watchInterval?: number;
  wrap?: boolean;
  loading: boolean;
  podsLoading?: boolean;
  logsLoading?: boolean;
  logsRefreshing?: boolean;
  error?: string;
}

export interface KubePodDrilldown {
  podName: string;
  namespace: string;
  containers: string[];
  containerStatuses?: Record<string, string>;
  selectedContainer: number;
}

export interface KubeCompareSide {
  context: string; // kube context name (dynamic column label)
  label?: string; // tab label when the context is open as a renamed tab
  deployments: KubeDeploymentSummary[]; // deployments in the compared namespace
  loaded: boolean;
}

export interface KubeCompareTab {
  sides: KubeCompareSide[]; // >= 2 contexts being compared
  namespace: string; // namespace the comparison ran in
  label?: string; // custom tab label (rename), defaults to "ctxA vs ctxB"
  loading: boolean;
  error: string;
}

export interface KubeContextTab {
  id: string; // context name (stable tab id)
  context: string;
  label?: string; // custom tab label (rename), defaults to the context name
  namespace: string; // current namespace shown in this tab
  namespaces: string[]; // namespaces available in this context
  kind: string; // selected resource kind id (deployments, pods, configmaps, …)
  resources: KubeResourceList; // table for the selected kind in the current namespace
  podFilters: string[]; // pods only: subset of owner kinds, combinable
  podAgeFilter: string; // pods only: age preset key, e.g. '10m' or 'older'
  watch: boolean; // live watch mode: poll the current resource table
  watchInterval: number; // seconds between polls (default 2)
  selected: number;
  loading: boolean;
  refreshing?: boolean;
  podStatus?: KubePodStatusSummary;
  error: string;
  podDrilldown?: KubePodDrilldown;
}

export interface KubePodStatusSummary {
  running: number;
  error: number;
  terminating: number;
  notReady: number;
  total: number;
}

// ─── Kubernetes generic resource tables (renderer-safe) ─────────────────────

export interface KubeResourceColumn {
  key: string;
  label: string;
  format?: 'text' | 'age' | 'ready' | 'image' | 'pod-status' | 'usage';
}

export interface KubeResourceItem {
  key: string; // unique within the list (namespace/name)
  name: string;
  namespace: string;
  updatedAt?: string; // newest meaningful status/update timestamp when available
  cells: Record<string, string>;
  containerStatuses?: Record<string, string>;
  containers?: string[];
  loading?: boolean;
}

export interface KubeResourceList {
  kind: string;
  columns: KubeResourceColumn[];
  items: KubeResourceItem[];
}

export type KubeResourceKind =
  | 'deployments'
  | 'pods'
  | 'configmaps'
  | 'secrets'
  | 'services'
  | 'statefulsets'
  | 'daemonsets'
  | 'ingresses'
  | 'jobs'
  | 'cronjobs'
  | 'nodes';

export const KUBE_RESOURCE_OPTIONS: { id: string; label: string }[] = [
  { id: 'deployments', label: 'Deployments' },
  { id: 'pods', label: 'Pods' },
  { id: 'configmaps', label: 'ConfigMaps' },
  { id: 'secrets', label: 'Secrets' },
  { id: 'services', label: 'Services' },
  { id: 'statefulsets', label: 'StatefulSets' },
  { id: 'daemonsets', label: 'DaemonSets' },
  { id: 'ingresses', label: 'Ingresses' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'cronjobs', label: 'CronJobs' },
  { id: 'nodes', label: 'Nodes' },
];
