import type { PR, PRDetail, Provider } from '../../types.js';
import { fetchGitHubPRs, fetchGitHubPRDetail, createGitHubPRComment } from './github.js';
import { fetchGitLabPRs, fetchGitLabPRDetail, createGitLabPRComment } from './gitlab.js';
import { fetchBitbucketPRs, fetchBitbucketPRDetail, createBitbucketPRComment } from './bitbucket.js';

export async function fetchPRsByProvider(
  owner: string,
  repo: string,
  provider: Provider,
  token: string,
  repoName?: string,
  state: string = 'open'
): Promise<PR[]> {
  switch (provider) {
    case 'gitlab':
      return fetchGitLabPRs(owner, repo, token, repoName, state);
    case 'bitbucket':
      return fetchBitbucketPRs(owner, repo, token, repoName, state);
    case 'github':
    default:
      return fetchGitHubPRs(owner, repo, token, repoName, state);
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

export async function createPRCommentByProvider(
  owner: string,
  repo: string,
  prNumber: number,
  provider: Provider,
  token: string,
  body: string
): Promise<string> {
  switch (provider) {
    case 'gitlab':
      return createGitLabPRComment(owner, repo, prNumber, token, body);
    case 'bitbucket':
      return createBitbucketPRComment(owner, repo, prNumber, token, body);
    case 'github':
    default:
      return createGitHubPRComment(owner, repo, prNumber, token, body);
  }
}
