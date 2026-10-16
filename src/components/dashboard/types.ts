import type { KubeContext, KubeContextTab, PR, RepoState } from '../../../core/types.js';

export interface DashboardProps {
  workspaceName: string;
  workspacePath: string;
  base: string;
  release: string;
  repos: RepoState[];
  prs: PR[];
  kubeContexts: KubeContext[];
  kubeContextTabs: KubeContextTab[];
  lastSync: string;
  prLastUpdated: string;
  prLoading: boolean;
  syncInterval: number;
  isSyncing: boolean;
  syncProgress: { done: number; total: number };
  onSyncAll: () => void;
  onRefreshPRs: () => void;
  onOpenRepositories: () => void;
  onOpenPRs: (filter?: 'all' | 'review' | 'conflicts' | 'approved') => void;
  onOpenKubernetes: () => void;
  onOpenSettings: () => void;
  onOpenWorkspace: () => void;
  onOpenCommitList: (repo: RepoState, commitHash?: string) => void;
  onOpenPRDetail: (pr: PR) => void;
  onOpenKubeDetail: (entry: KubeActivityEntry) => void;
  onOpenKubeLogs: (entry: KubeActivityEntry) => void;
  onViewMetric: (metric: DashboardMetricKey) => void;
}

export type DashboardMetricKey = 'repositories' | 'behind' | 'pullRequests' | 'errors';

export type KubeActivityEntry = {
  context: string;
  cluster?: string;
  kind: 'Pod' | 'Deployment';
  name: string;
  namespace: string;
  updatedAt: string;
  healthy: boolean;
  pending: boolean;
  reason: string;
  details: Record<string, string>;
};

export type ActivityTab = 'repos' | 'k8s';

export type DashboardDrawerItem =
  | { type: 'repo'; repo: RepoState }
  | { type: 'pr'; pr: PR }
  | { type: 'kube'; entry: KubeActivityEntry };
