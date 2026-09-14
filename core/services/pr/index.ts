import type { PRDetail, PRPage, Provider } from '../../types.js';
import { fetchGitHubPRs, fetchGitHubPRDetail, createGitHubPRComment, approveGitHubPR } from './github.js';
import { fetchGitLabPRs, fetchGitLabPRDetail, createGitLabPRComment, approveGitLabPR } from './gitlab.js';
import { fetchBitbucketPRs, fetchBitbucketPRDetail, createBitbucketPRComment, approveBitbucketPR } from './bitbucket.js';

export async function fetchPRsByProvider(
  owner: string,
  repo: string,
  provider: Provider,
  token: string,
  repoName?: string,
  state: string = 'open',
  page = 1,
  pageSize = 10,
): Promise<PRPage> {
  switch (provider) {
    case 'gitlab':
      return fetchGitLabPRs(owner, repo, token, repoName, state, page, pageSize);
    case 'bitbucket':
      return fetchBitbucketPRs(owner, repo, token, repoName, state, page, pageSize);
    case 'github':
    default:
      return fetchGitHubPRs(owner, repo, token, repoName, state, page, pageSize);
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

export async function approvePRByProvider(
  owner: string, repo: string, prNumber: number, provider: Provider, token: string, body: string,
): Promise<void> {
  if (provider === 'gitlab') {
    await approveGitLabPR(owner, repo, prNumber, token);
    if (body.trim()) await createGitLabPRComment(owner, repo, prNumber, token, body);
    return;
  }
  if (provider === 'bitbucket') {
    await approveBitbucketPR(owner, repo, prNumber, token);
    if (body.trim()) await createBitbucketPRComment(owner, repo, prNumber, token, body);
    return;
  }
  await approveGitHubPR(owner, repo, prNumber, token, body);
}
