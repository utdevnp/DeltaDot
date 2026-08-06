// ─── Pure URL helpers (no Node dependencies — safe for the renderer) ───────

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
