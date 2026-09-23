import type { KubeResourceItem } from '../../../core/types.js';
import type { KubeActivityEntry } from './types.js';

const CONTEXT_COLORS = ['var(--accent-blue)', 'var(--accent-purple)', 'var(--accent-cyan)', 'var(--accent-green)', 'var(--accent-orange)', 'var(--accent-yellow)'];

export function contextColor(context: string): string {
  let hash = 0;
  for (const character of context) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return CONTEXT_COLORS[hash % CONTEXT_COLORS.length] ?? 'var(--text-secondary)';
}

function healthFor(kind: KubeActivityEntry['kind'], item: KubeResourceItem): { healthy: boolean; reason: string } {
  if (kind === 'Pod') {
    const status = item.cells.status || 'Unknown';
    const ready = item.cells.ready || '';
    const [readyCount, containerCount] = ready.split('/').map(Number);
    const healthy = status === 'Running' && (!containerCount || readyCount === containerCount);
    return { healthy, reason: healthy ? 'Healthy' : status === 'Running' ? `${ready || 'Unknown'} containers ready` : status };
  }

  const ready = item.cells.ready || '0/0';
  const [readyCount, replicaCount] = ready.split('/').map(Number);
  const healthy = Number.isFinite(readyCount) && Number.isFinite(replicaCount) && readyCount === replicaCount;
  return { healthy, reason: healthy ? 'Healthy' : `${ready} replicas ready` };
}

export function toKubeActivityEntry(context: string, kind: KubeActivityEntry['kind'], item: KubeResourceItem): KubeActivityEntry {
  const health = healthFor(kind, item);
  return {
    context,
    kind,
    name: item.name,
    namespace: item.namespace,
    updatedAt: item.updatedAt || item.cells.age || '',
    ...health,
  };
}

export function sortByUpdatedAt(entries: KubeActivityEntry[]): KubeActivityEntry[] {
  return [...entries].filter((entry) => entry.updatedAt).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
