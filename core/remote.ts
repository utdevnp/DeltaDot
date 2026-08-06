import { parseRemoteUrl, getCommitUrl, getCompareUrl, getPRsUrl } from './urls.js';

export { parseRemoteUrl, getCommitUrl, getCompareUrl, getPRsUrl } from './urls.js';

export async function getRemoteUrl(repoPath: string): Promise<string> {
  try {
    // Lazy import so the renderer never pulls in the Node-only git module
    const { run } = await import('./git.js');
    return await run('git remote get-url origin', repoPath);
  } catch { return ''; }
}

export async function openInBrowser(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const { execSync } = await import('child_process');
    execSync(`open "${url}"`, { timeout: 5000 });
    return true;
  } catch { return false; }
}
