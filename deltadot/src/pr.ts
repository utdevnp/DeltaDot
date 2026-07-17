import { run } from './git.js';
import type { PR, PRDetail, Provider } from './types.js';
import { timeAgo } from './utils.js';
import { fetchPRsByProvider, fetchPRDetailByProvider } from './services/api.js';

export async function getRemoteOwnerRepo(repoPath: string): Promise<{ owner: string; repo: string } | null> {
  try {
    const raw = await run('git remote get-url origin', repoPath);
    const s = raw.trim();
    const httpsMatch = s.match(/^https:\/\/[^/]+\/([^/]+)\/([^/.]+)/);
    if (httpsMatch) return { owner: httpsMatch[1]!, repo: httpsMatch[2]! };
    const sshMatch = s.match(/^git@[^:]+:([^/]+)\/([^/.]+)/);
    if (sshMatch) return { owner: sshMatch[1]!, repo: sshMatch[2]! };
    return null;
  } catch { return null; }
}

export function getProvider(remoteUrl: string): Provider {
  const s = remoteUrl.toLowerCase();
  if (s.includes('bitbucket')) return 'bitbucket';
  if (s.includes('gitlab')) return 'gitlab';
  return 'github';
}

export async function fetchPRs(
  owner: string,
  repo: string,
  provider: Provider,
  token: string,
  repoName?: string
): Promise<PR[]> {
  return fetchPRsByProvider(owner, repo, provider, token, repoName);
}

export async function fetchPRDetail(
  owner: string,
  repo: string,
  prNumber: number,
  provider: Provider,
  token: string
): Promise<PRDetail> {
  return fetchPRDetailByProvider(owner, repo, prNumber, provider, token);
}

export function detectProviderFromRemote(remoteUrl: string): Provider {
  const s = remoteUrl.toLowerCase();
  if (s.includes('bitbucket')) return 'bitbucket';
  if (s.includes('gitlab')) return 'gitlab';
  return 'github';
}

export function formatPRDate(dateStr: string): string {
  if (!dateStr) return '';
  return timeAgo(dateStr);
}
