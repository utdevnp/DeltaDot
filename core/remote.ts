import { run } from './git.js';

export async function getRemoteUrl(repoPath: string): Promise<string> {
  try {
    return await run('git remote get-url origin', repoPath);
  } catch { return ''; }
}

export function parseRemoteUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const httpsMatch = s.match(/^https:\/\/([^/]+)\/([^/]+)\/([^/.]+)(?:\.git)?\/?$/);
  if (httpsMatch) {
    const [, host, owner, repo] = httpsMatch;
    return `https://${host}/${owner}/${repo}`;
  }
  const sshMatch = s.match(/^git@([^:]+):([^/]+)\/([^/.]+)(?:\.git)?\/?$/);
  if (sshMatch) {
    const [, host, owner, repo] = sshMatch;
    return `https://${host}/${owner}/${repo}`;
  }
  return '';
}

export function getCommitUrl(remoteUrl: string, hash: string): string {
  const base = parseRemoteUrl(remoteUrl);
  if (!base) return '';
  return `${base}/commit/${hash}`;
}

export async function openInBrowser(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const { execSync } = await import('child_process');
    execSync(`open "${url}"`, { timeout: 5000 });
    return true;
  } catch { return false; }
}

export function getCompareUrl(remoteUrl: string, baseBranch: string, releaseBranch: string): string {
  const base = parseRemoteUrl(remoteUrl);
  if (!base) return '';
  const host = base.replace('https://', '').split('/')[0] ?? '';
  if (host.includes('bitbucket')) {
    return `${base}/pull-requests/new?source=${releaseBranch}&dest=${baseBranch}`;
  }
  if (host.includes('gitlab')) {
    return `${base}/-/compare/${baseBranch}...${releaseBranch}`;
  }
  return `${base}/compare/${baseBranch}...${releaseBranch}`;
}

export function getPRsUrl(remoteUrl: string): string {
  const base = parseRemoteUrl(remoteUrl);
  if (!base) return '';
  return `${base}/pulls`;
}
