import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { KubeContextSettings } from './types.js';

const settingsPath = () => join(homedir(), '.deltadot', 'kube-contexts.json');

export async function loadKubeContextSettings(): Promise<KubeContextSettings> {
  try {
    const parsed = JSON.parse(await readFile(settingsPath(), 'utf8')) as KubeContextSettings;
    return Object.fromEntries(Object.entries(parsed).map(([name, setting]) => [name, {
      displayName: setting.displayName?.trim() || undefined,
      environment: setting.environment === 'prod' ? 'prod' : 'non-prod',
      enabled: setting.enabled !== false,
      color: ['red', 'orange', 'yellow', 'green', 'blue', 'purple'].includes(setting.color ?? '') ? setting.color : undefined,
    }]));
  } catch { return {}; }
}

export async function saveKubeContextSettings(settings: KubeContextSettings): Promise<void> {
  const dir = join(homedir(), '.deltadot');
  await mkdir(dir, { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}
