import type { PR, PRDetail, PRCommit, PRFile, PRPage } from '../../types.js';
import { apiDelay, bearerHeaders } from './shared.js';

export async function fetchGitLabPRs(
  owner: string,
  repo: string,
  token: string,
  repoName?: string,
  state: string = 'opened',
  page = 1,
  pageSize = 10,
): Promise<PRPage> {
  const headers = bearerHeaders(token);
  const projectId = encodeURIComponent(`${owner}/${repo}`);
  const exhaustive = state === 'all-search';
  const apiState = state === 'closed' ? 'closed' : (state === 'all' || exhaustive) ? 'all' : 'opened';
  const data: unknown[] = [];
  const pageCount = exhaustive ? 10 : 1;
  const requestSize = exhaustive ? 100 : pageSize;
  for (let apiPage = 1; apiPage <= pageCount; apiPage++) {
    if (apiPage > 1) await apiDelay(exhaustive ? 1000 : 120);
    const pageParam = `&page=${exhaustive ? apiPage : page}`;
    const url = `https://gitlab.com/api/v4/projects/${projectId}/merge_requests?state=${apiState}&per_page=${requestSize}${pageParam}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`GitLab API error ${res.status}: ${res.statusText} - ${errorBody}`);
    }
    const pageData = await res.json() as unknown[];
    if (!Array.isArray(pageData)) throw new Error('Unexpected GitLab API response: Expected array');
    data.push(...pageData);
    if (pageData.length < requestSize) break;
  }
  if (!Array.isArray(data)) {
    throw new Error('Unexpected GitLab API response: Expected array');
  }

  const mrs = data.map((item: any) => ({
    number: item.iid as number,
    title: item.title as string,
    author: (item.author as any)?.username as string ?? '',
    state: (item.state as string) === 'opened' ? 'open' : (item.state as string),
    sourceBranch: item.source_branch as string,
    targetBranch: item.target_branch as string,
    createdAt: item.created_at as string,
    url: item.web_url as string,
    repoName: repoName ?? '',
    approved: false,
  }));

  if (exhaustive) return { prs: mrs, page: 1, pageSize: requestSize, hasMore: false };

  const enriched = await Promise.all(mrs.map(async (mr) => {
    try {
      const aUrl = `https://gitlab.com/api/v4/projects/${projectId}/merge_requests/${mr.number}/approvals`;
      const aRes = await fetch(aUrl, { headers });
      if (aRes.ok) {
        const approvalData = await aRes.json() as any;
        mr.approved = Boolean(approvalData.approved);
      }
    } catch { /* ignore — treat as unapproved */ }
    return mr;
  }));
  return { prs: enriched, page, pageSize: requestSize, hasMore: mrs.length === requestSize };
}

export async function fetchGitLabPRDetail(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<PRDetail> {
  const headers = bearerHeaders(token);
  const projectId = encodeURIComponent(`${owner}/${repo}`);

  const url = `https://gitlab.com/api/v4/projects/${projectId}/merge_requests/${prNumber}`;
  const commitsUrl = `https://gitlab.com/api/v4/projects/${projectId}/merge_requests/${prNumber}/commits`;
  const changesUrl = `https://gitlab.com/api/v4/projects/${projectId}/merge_requests/${prNumber}/changes`;

  const [res, commitsRes, changesRes] = await Promise.all([
    fetch(url, { headers }),
    fetch(commitsUrl, { headers }).catch(() => null),
    fetch(changesUrl, { headers }).catch(() => null)
  ]);

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`GitLab API error ${res.status}: ${res.statusText} - ${errorBody}`);
  }

  const item = await res.json() as any;

  let commits: PRCommit[] = [];
  if (commitsRes && commitsRes.ok) {
    try {
      const commitData = await commitsRes.json() as any[];
      if (Array.isArray(commitData)) {
        commits = commitData.map((c: any) => ({
          hash: (c.short_id as string) ?? (c.id as string)?.slice(0, 7) ?? '',
          message: (c.title as string) ?? '',
          author: (c.author_name as string) ?? '',
          date: (c.created_at as string) ?? '',
        }));
      }
    } catch {
      // Ignore
    }
  }

  let files: PRFile[] = [];
  let additions = 0;
  let deletions = 0;
  let changedFiles = 0;
  if (changesRes && changesRes.ok) {
    try {
      const changesData = await changesRes.json() as any;
      const changesList = changesData.changes ?? [];
      if (Array.isArray(changesList)) {
        changedFiles = changesList.length;
        files = changesList.map((c: any) => {
          const patch = c.diff || '';
          const stats = parseDiffPatch(patch);
          additions += stats.additions;
          deletions += stats.deletions;
          const status = c.new_file ? 'added' : c.deleted_file ? 'deleted' : c.renamed_file ? 'renamed' : 'modified';
          return {
            path: c.new_path || c.old_path || '',
            additions: stats.additions,
            deletions: stats.deletions,
            status,
            previousPath: c.renamed_file ? c.old_path : undefined,
            patch,
          };
        });
      }
    } catch {
      // Ignore
    }
  }

  return {
    number: item.iid as number,
    title: item.title as string,
    description: item.description as string,
    author: (item.author as any)?.username as string ?? '',
    state: (item.state as string) === 'opened' ? 'open' : (item.state as string),
    sourceBranch: item.source_branch as string,
    targetBranch: item.target_branch as string,
    createdAt: item.created_at as string,
    updatedAt: item.updated_at as string,
    url: item.web_url as string,
    comments: [],
    reviewers: [],
    labels: [],
    additions,
    deletions,
    changedFiles,
    commitsCount: commits.length,
    commits,
    files,
  };
}

function parseDiffPatch(patch: string) {
  let additions = 0;
  let deletions = 0;
  if (!patch) return { additions, deletions };
  const lines = patch.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }
  return { additions, deletions };
}

// ─── Comment creation ──────────────────────────────────────────────────────

/**
 * Creates a note (comment) on a merge request. Returns the note URL when available.
 */
export async function createGitLabPRComment(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  body: string,
): Promise<string> {
  const headers = { ...bearerHeaders(token), 'Content-Type': 'application/json' };
  const projectId = encodeURIComponent(`${owner}/${repo}`);
  const url = `https://gitlab.com/api/v4/projects/${projectId}/merge_requests/${prNumber}/notes`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`GitLab API error ${res.status}: ${res.statusText} - ${errorBody}`);
  }
  const data = await res.json().catch(() => null) as { web_url?: string } | null;
  return data?.web_url ?? '';
}
