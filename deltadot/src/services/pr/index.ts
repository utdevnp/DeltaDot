import type { PR, PRDetail, Provider } from '../../types.js';
import { fetchGitHubPRs, fetchGitHubPRDetail } from './github.js';
import { fetchGitLabPRs, fetchGitLabPRDetail } from './gitlab.js';
import { fetchBitbucketPRs, fetchBitbucketPRDetail } from './bitbucket.js';

export async function fetchPRsByProvider(
  owner: string,
  repo: string,
  provider: Provider,
  token: string,
  repoName?: string
): Promise<PR[]> {
  switch (provider) {
    case 'gitlab':
      return fetchGitLabPRs(owner, repo, token, repoName);
    case 'bitbucket':
      return fetchBitbucketPRs(owner, repo, token, repoName);
    case 'github':
    default:
      return fetchGitHubPRs(owner, repo, token, repoName);
  }
}

export async function fetchPRDetailByProvider(
  owner: string,
  repo: string,
  prNumber: number,
  provider: Provider,
  token: string
): Promise<PRDetail> {
  switch (provider) {
    case 'gitlab':
      return fetchGitLabPRDetail(owner, repo, prNumber, token);
    case 'bitbucket':
      return fetchBitbucketPRDetail(owner, repo, prNumber, token);
    case 'github':
    default:
      return fetchGitHubPRDetail(owner, repo, prNumber, token);
  }
}
