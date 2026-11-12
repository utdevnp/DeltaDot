import { database } from './sqlite-storage.js';
import type { KubeContextSettings } from './types.js';

function normalize(settings: KubeContextSettings): KubeContextSettings {
  return Object.fromEntries(Object.entries(settings).map(([name, setting]) => [name, {
    displayName: setting.displayName?.trim() || undefined,
    environment: setting.environment === 'prod' ? 'prod' : 'non-prod',
    enabled: setting.enabled !== false,
    color: ['red', 'orange', 'yellow', 'green', 'blue', 'purple'].includes(setting.color ?? '') ? setting.color : undefined,
  }]));
}

export async function loadKubeContextSettings(): Promise<KubeContextSettings> {
  return normalize(database().loadKubeContextSettings());
}

export async function saveKubeContextSettings(settings: KubeContextSettings): Promise<void> {
  database().saveKubeContextSettings(settings);
}
