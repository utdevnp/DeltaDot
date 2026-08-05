import { run } from './git.js';
import type { PR, PRDetail, Provider } from './types.js';
import { timeAgo } from './utils.js';
import { fetchPRsByProvider, fetchPRDetailByProvider, createPRCommentByProvider } from './services/api.js';

export async function getRemoteOwnerRepo(repoPath: string): Promise<{ owner: string; repo: string } | null> {
  try {
    const raw = await run('git remote get-url origin', repoPath);
    const s = raw.trim();
    // Strip trailing .git suffix for consistent parsing
    const normalized = s.replace(/\.git$/, '');
    // HTTPS: https://github.com/owner/repo
    const httpsMatch = normalized.match(/^https:\/\/[^/]+\/([^/]+)\/([^/]+)/);
    if (httpsMatch) return { owner: httpsMatch[1]!, repo: httpsMatch[2]! };
    // SSH (git@): git@github.com:owner/repo
    const sshMatch = normalized.match(/^git@[^:]+:([^/]+)\/([^/]+)/);
    if (sshMatch) return { owner: sshMatch[1]!, repo: sshMatch[2]! };
    // SSH (ssh://): ssh://git@github.com/owner/repo
    const sshUrlMatch = normalized.match(/^ssh:\/\/(?:[^@]+@)?([^/]+)\/([^/]+)\/([^/]+)/);
    if (sshUrlMatch) return { owner: sshUrlMatch[2]!, repo: sshUrlMatch[3]! };
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
  repoName?: string,
  state?: string
): Promise<PR[]> {
  return fetchPRsByProvider(owner, repo, provider, token, repoName, state);
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

export async function createPRComment(
  owner: string,
  repo: string,
  prNumber: number,
  provider: Provider,
  token: string,
  body: string
): Promise<string> {
  return createPRCommentByProvider(owner, repo, prNumber, provider, token, body);
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
