import type { KubeResourceItem } from '../../../core/types.js';
import type { KubeActivityEntry } from './types.js';

const CONTEXT_COLORS = ['var(--accent-blue)', 'var(--accent-purple)', 'var(--accent-cyan)', 'var(--accent-green)', 'var(--accent-orange)', 'var(--accent-yellow)'];

export function contextColor(context: string): string {
  let hash = 0;
  for (const character of context) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return CONTEXT_COLORS[hash % CONTEXT_COLORS.length] ?? 'var(--text-secondary)';
}

function healthFor(kind: KubeActivityEntry['kind'], item: KubeResourceItem): { healthy: boolean; pending: boolean; reason: string } {
  if (kind === 'Pod') {
    const status = item.cells.status || 'Unknown';
    const ready = item.cells.ready || '';
    const [readyCount, containerCount] = ready.split('/').map(Number);
    // Completed Job Pods are intentionally 0/1 because terminated containers
    // are no longer ready. Their lifecycle status still represents success.
    if (status === 'Succeeded') return { healthy: true, pending: false, reason: 'Completed successfully' };
    const pending = status === 'Pending' || status.startsWith('Init:');
    // Missing or invalid container counts must not become a false positive.
    const healthy = status === 'Running'
      && Number.isFinite(readyCount)
      && Number.isFinite(containerCount)
      && containerCount > 0
      && readyCount === containerCount;
    return { healthy, pending, reason: healthy ? 'Healthy' : pending ? status : status === 'Running' ? `${ready || 'Unknown'} containers ready` : status };
  }

  const ready = item.cells.ready || '0/0';
  const [readyCount, replicaCount] = ready.split('/').map(Number);
  const availableCount = Number(item.cells.available);
  const updatedCount = Number(item.cells.updated);
  const hasReplicaTarget = Number.isFinite(replicaCount);
  const healthy = Number.isFinite(readyCount)
    && hasReplicaTarget
    && readyCount === replicaCount
    && (!Number.isFinite(availableCount) || availableCount === replicaCount)
    && (!Number.isFinite(updatedCount) || updatedCount === replicaCount);
  // Deployments with a replica mismatch are health issues, not a separate
  // pending state; keep them visible in the unhealthy list.
  const pending = false;
  const reason = healthy
    ? 'Healthy'
    : `${ready} replicas ready${Number.isFinite(availableCount) && availableCount < replicaCount ? `, ${availableCount} available` : ''}`;
  return { healthy, pending, reason };
}

export function toKubeActivityEntry(context: string, kind: KubeActivityEntry['kind'], item: KubeResourceItem, cluster?: string): KubeActivityEntry {
  const health = healthFor(kind, item);
  return {
    context,
    cluster,
    kind,
    name: item.name,
    namespace: item.namespace,
    updatedAt: item.updatedAt || item.cells.age || '',
    ...health,
    details: {
      ...item.cells,
      ...(item.containerStatuses ? { containers: Object.entries(item.containerStatuses).map(([name, status]) => `${name}: ${status}`).join(', ') } : {}),
    },
  };
}

export function sortByUpdatedAt(entries: KubeActivityEntry[]): KubeActivityEntry[] {
  return [...entries].filter((entry) => entry.updatedAt).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
