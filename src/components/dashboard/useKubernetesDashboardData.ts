import { useCallback, useEffect, useState } from 'react';
import type { KubeContext, KubeContextTab } from '../../../core/types.js';
import { sortByUpdatedAt, toKubeActivityEntry } from './helpers.js';
import type { KubeActivityEntry } from './types.js';

type DashboardKubeSnapshot = {
  activity: KubeActivityEntry[];
  resources: KubeActivityEntry[];
  healthIssues: KubeActivityEntry[];
  error: boolean;
  lastUpdated: string;
};

// Dashboard components are mounted again when the user returns to the home
// view. Keep the last loaded snapshot outside the hook so that remounting does
// not turn into another Kubernetes request.
const snapshotCache = new Map<string, DashboardKubeSnapshot>();

export function useKubernetesDashboardData(contexts: KubeContext[], contextTabs: KubeContextTab[], workspacePath: string) {
  const cacheKey = `${workspacePath}|${contexts.map((context) => context.name).sort().join(',')}`;
  const cached = snapshotCache.get(cacheKey);
  const [activity, setActivity] = useState<KubeActivityEntry[]>(cached?.activity ?? []);
  const [resources, setResources] = useState<KubeActivityEntry[]>(cached?.resources ?? []);
  const [healthIssues, setHealthIssues] = useState<KubeActivityEntry[]>(cached?.healthIssues ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(cached?.error ?? false);
  const [lastUpdated, setLastUpdated] = useState(cached?.lastUpdated ?? '');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fallback = contextTabs
      .filter((tab) => tab.kind === 'pods' || tab.kind === 'deployments')
      .flatMap((tab) => tab.resources.items.map((item) => toKubeActivityEntry(tab.context, tab.kind === 'pods' ? 'Pod' : 'Deployment', item)));

    const previous = snapshotCache.get(cacheKey);
    // A dashboard remount should display the existing snapshot as-is. The
    // explicit refresh key is the only signal that permits a new request once
    // a snapshot already exists.
    if (previous && refreshKey === 0) {
      setActivity(previous.activity);
      setResources(previous.resources ?? previous.activity);
      setHealthIssues(previous.healthIssues);
      setError(previous.error);
      setLastUpdated(previous.lastUpdated);
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    setError(false);
    const load = async () => {
      try {
        const availableContexts = contexts.length > 0 ? contexts : await window.api.k8sContexts();
        if (availableContexts.length === 0) throw new Error('No Kubernetes contexts available.');

        const results = await Promise.all(availableContexts.map(async (context) => {
          const [podsResult, deploymentsResult] = await Promise.allSettled([
            window.api.k8sResources(context.name, '*', 'pods'),
            window.api.k8sResources(context.name, '*', 'deployments'),
          ]);
          const pods = podsResult.status === 'fulfilled' ? podsResult.value.items : [];
          const deployments = deploymentsResult.status === 'fulfilled' ? deploymentsResult.value.items : [];
          return {
            loaded: podsResult.status === 'fulfilled' || deploymentsResult.status === 'fulfilled',
            entries: [
              ...pods.map((item) => toKubeActivityEntry(context.name, 'Pod', item, context.cluster)),
              ...deployments.map((item) => toKubeActivityEntry(context.name, 'Deployment', item, context.cluster)),
            ],
          };
        }));
        const entries = results.flatMap((result) => result.entries);
        if (cancelled) return;
        const snapshot = {
          activity: sortByUpdatedAt(entries).slice(0, 6),
          resources: entries,
          healthIssues: entries.filter((entry) => !entry.healthy && !entry.pending),
          error: !results.some((result) => result.loaded),
          lastUpdated: new Date().toISOString(),
        };
        snapshotCache.set(cacheKey, snapshot);
        setActivity(snapshot.activity);
        setResources(snapshot.resources);
        setHealthIssues(snapshot.healthIssues);
        setError(snapshot.error);
        setLastUpdated(snapshot.lastUpdated);
      } catch {
        if (cancelled) return;
        const snapshot = {
          activity: sortByUpdatedAt(fallback).slice(0, 6),
          resources: fallback,
          healthIssues: fallback.filter((entry) => !entry.healthy && !entry.pending),
          error: true,
          lastUpdated: new Date().toISOString(),
        };
        snapshotCache.set(cacheKey, snapshot);
        setActivity(snapshot.activity);
        setResources(snapshot.resources);
        setHealthIssues(snapshot.healthIssues);
        setError(snapshot.error);
        setLastUpdated(snapshot.lastUpdated);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [cacheKey, contexts, contextTabs, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  return { activity, resources, healthIssues, loading, error, lastUpdated, refresh };
}
