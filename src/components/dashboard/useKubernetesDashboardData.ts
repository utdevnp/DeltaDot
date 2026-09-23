import { useCallback, useEffect, useState } from 'react';
import type { KubeContext, KubeContextTab } from '../../../core/types.js';
import { sortByUpdatedAt, toKubeActivityEntry } from './helpers.js';
import type { KubeActivityEntry } from './types.js';

export function useKubernetesDashboardData(contexts: KubeContext[], contextTabs: KubeContextTab[]) {
  const [activity, setActivity] = useState<KubeActivityEntry[]>([]);
  const [healthIssues, setHealthIssues] = useState<KubeActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fallback = contextTabs
      .filter((tab) => tab.kind === 'pods' || tab.kind === 'deployments')
      .flatMap((tab) => tab.resources.items.map((item) => toKubeActivityEntry(tab.label || tab.context, tab.kind === 'pods' ? 'Pod' : 'Deployment', item)));

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
              ...pods.map((item) => toKubeActivityEntry(context.name, 'Pod', item)),
              ...deployments.map((item) => toKubeActivityEntry(context.name, 'Deployment', item)),
            ],
          };
        }));
        const entries = results.flatMap((result) => result.entries);
        if (cancelled) return;
        setActivity(sortByUpdatedAt(entries).slice(0, 6));
        setHealthIssues(entries.filter((entry) => !entry.healthy));
        setError(!results.some((result) => result.loaded));
        setLastUpdated(new Date().toISOString());
      } catch {
        if (cancelled) return;
        setActivity(sortByUpdatedAt(fallback).slice(0, 6));
        setHealthIssues([]);
        setError(true);
        setLastUpdated(new Date().toISOString());
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [contexts, contextTabs, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  return { activity, healthIssues, loading, error, lastUpdated, refresh };
}
