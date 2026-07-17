import type { PR, PRComment, PRDetail, PRCommit, PRFile } from '../../types.js';
import { githubHeaders, uniqueStrings } from './shared.js';

export async function fetchGitHubPRs(
  owner: string,
  repo: string,
  token: string,
  repoName?: string
): Promise<PR[]> {
  const headers = githubHeaders(token);
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=50`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${res.statusText} - ${errorBody}`);
  }

  const data = await res.json() as unknown[];
  if (!Array.isArray(data)) {
    throw new Error('Unexpected GitHub API response: Expected array');
  }

  const prs = data.map((item: any) => ({
    number: item.number as number,
    title: item.title as string,
    author: (item.user as any)?.login as string ?? '',
    state: item.state as string,
    sourceBranch: (item.head as any)?.ref as string ?? '',
    targetBranch: (item.base as any)?.ref as string ?? '',
    createdAt: item.created_at as string,
    url: item.html_url as string,
    repoName: repoName ?? '',
    approved: false,
  }));

  return Promise.all(prs.map(async (pr) => {
    try {
      const revUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}/reviews?per_page=100`;
      const revRes = await fetch(revUrl, { headers });
      if (revRes.ok) {
        const reviews = await revRes.json() as any[];
        pr.approved = Array.isArray(reviews) && reviews.some((r: any) => r.state === 'APPROVED');
      }
    } catch { /* ignore — treat as unapproved */ }
    return pr;
  }));
}

export async function fetchGitHubPRDetail(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<PRDetail> {
  const headers = githubHeaders(token);

  const detailUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
  const commitsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/commits`;
  const reviewsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`;
  const issueCommentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`;
  const reviewCommentsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=100`;
  const filesUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`;

  const [res, commitsRes, reviewsRes, issueCommentsRes, reviewCommentsRes, filesRes] = await Promise.all([
    fetch(detailUrl, { headers }),
    fetch(commitsUrl, { headers }).catch(() => null),
    fetch(reviewsUrl, { headers }).catch(() => null),
    fetch(issueCommentsUrl, { headers }).catch(() => null),
    fetch(reviewCommentsUrl, { headers }).catch(() => null),
    fetch(filesUrl, { headers }).catch(() => null),
  ]);

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${res.statusText} - ${errorBody}`);
  }

  const item = await res.json() as any;

  let commits: PRCommit[] = [];
  if (commitsRes && commitsRes.ok) {
    try {
      const commitData = await commitsRes.json() as any[];
      if (Array.isArray(commitData)) {
        commits = commitData.map((c: any) => ({
          hash: (c.sha as string)?.slice(0, 7) ?? '',
          message: (c.commit?.message as string)?.split('\n')[0] ?? '',
          author: (c.commit?.author?.name as string) ?? (c.author?.login as string) ?? '',
          date: (c.commit?.author?.date as string) ?? '',
        }));
      }
    } catch {
      // Ignore commits parse failures to prevent detail page crashes
    }
  }

  let files: PRFile[] = [];
  if (filesRes && filesRes.ok) {
    try {
      const fileData = await filesRes.json() as any[];
      if (Array.isArray(fileData)) {
        files = fileData.map((f: any) => ({
          path: (f.filename as string) ?? '',
          additions: (f.additions as number) ?? 0,
          deletions: (f.deletions as number) ?? 0,
          status: (f.status as any) === 'removed' ? 'deleted' : (f.status as any) === 'renamed' ? 'renamed' : (f.status as any) === 'added' ? 'added' : 'modified',
          previousPath: (f.previous_filename as string) ?? undefined,
          patch: (f.patch as string) ?? undefined,
        }));
      }
    } catch {
      // Ignore files parse failures
    }
  }

  let requestedReviewers: string[] = [];
  let approvedBy: string[] = [];
  let changesRequestedBy: string[] = [];
  let commentedBy: string[] = [];
  const reviewTimelineComments: PRComment[] = [];
  if (reviewsRes && reviewsRes.ok) {
    try {
      const reviewData = await reviewsRes.json() as any[];
      if (Array.isArray(reviewData)) {
        requestedReviewers = uniqueStrings(((item.requested_reviewers as any[]) ?? []).map((r: any) => r?.login ?? r?.name ?? '').filter(Boolean));
        approvedBy = uniqueStrings(reviewData.filter((r: any) => r?.state === 'APPROVED').map((r: any) => r?.user?.login ?? '').filter(Boolean));
        changesRequestedBy = uniqueStrings(reviewData.filter((r: any) => r?.state === 'CHANGES_REQUESTED').map((r: any) => r?.user?.login ?? '').filter(Boolean));
        commentedBy = uniqueStrings(reviewData.filter((r: any) => r?.state === 'COMMENTED').map((r: any) => r?.user?.login ?? '').filter(Boolean));
        reviewTimelineComments.push(...reviewData.flatMap((r: any, i: number) => {
          const state = (r?.state as string) ?? '';
          if (state !== 'PENDING' && state !== 'COMMENTED' && state !== 'APPROVED' && state !== 'CHANGES_REQUESTED') return [];
          const createdAt = (r?.submitted_at as string) ?? (r?.created_at as string) ?? '';
          if (!createdAt && state !== 'PENDING') return [];
          const kind: PRComment['type'] = state === 'PENDING' ? 'pending' : 'review';
          return [{
            id: `review-${state.toLowerCase()}-${r?.id ?? r?.node_id ?? createdAt ?? i}`,
            type: kind,
            author: (r?.user as any)?.login ?? '',
            body: (r?.body as string) ?? '',
            createdAt,
            updatedAt: (r?.submitted_at as string) ?? (r?.updated_at as string) ?? undefined,
          } satisfies PRComment];
        }));
      }
    } catch {
      // Ignore review parse failures to keep the detail page responsive.
    }
  }

  const assignees = uniqueStrings(((item.assignees as any[]) ?? []).map((a: any) => a?.login ?? a?.name ?? '').filter(Boolean));
  const labels = uniqueStrings(((item.labels as any[]) ?? []).map((l: any) => l?.name ?? '').filter(Boolean));
  const { comments, issueCount, reviewCount } = await loadGitHubComments(issueCommentsRes, reviewCommentsRes, reviewTimelineComments);

  return {
    number: item.number as number,
    title: item.title as string,
    description: (item.body as string) ?? '',
    author: (item.user as any)?.login as string ?? '',
    state: item.state as string,
    draft: Boolean(item.draft),
    sourceBranch: (item.head as any)?.ref as string ?? '',
    targetBranch: (item.base as any)?.ref as string ?? '',
    createdAt: item.created_at as string,
    updatedAt: item.updated_at as string,
    url: item.html_url as string,
    mergedBy: (item.merged_by as any)?.login ?? '',
    mergedAt: (item.merged_at as string) ?? '',
    mergeCommitSha: (item.merge_commit_sha as string) ?? '',
    commentsCount: issueCount,
    reviewCommentsCount: reviewCount,
    requestedReviewers,
    approvedBy,
    changesRequestedBy,
    commentedBy,
    assignees,
    comments,
    reviewers: requestedReviewers,
    labels,
    additions: (item.additions as number) ?? 0,
    deletions: (item.deletions as number) ?? 0,
    changedFiles: (item.changed_files as number) ?? 0,
    commitsCount: (item.commits as number) ?? commits.length,
    commits,
    files,
  };
}

function loadGitHubComments(
  issueCommentsRes: Response | null,
  reviewCommentsRes: Response | null,
  reviewTimelineComments: PRComment[] = [],
): Promise<{ comments: PRComment[]; issueCount: number; reviewCount: number; }> {
  const issueComments: PRComment[] = [];
  const reviewComments: PRComment[] = [];

  return Promise.all([
    (async () => {
      if (issueCommentsRes && issueCommentsRes.ok) {
        try {
          const data = await issueCommentsRes.json() as any[];
          if (Array.isArray(data)) {
            issueComments.push(...data.map((c: any, i: number) => ({
              id: `issue-${c.id ?? c.node_id ?? c.created_at ?? i}`,
              type: 'issue' as const,
              author: (c.user as any)?.login ?? '',
              body: (c.body as string) ?? '',
              createdAt: (c.created_at as string) ?? '',
              updatedAt: (c.updated_at as string) ?? '',
            })));
          }
        } catch {
          // Ignore issue comment parse failures.
        }
      }
    })(),
    (async () => {
      if (reviewCommentsRes && reviewCommentsRes.ok) {
        try {
          const data = await reviewCommentsRes.json() as any[];
          if (Array.isArray(data)) {
            reviewComments.push(...data.map((c: any, i: number) => ({
              id: `review-${c.id ?? c.node_id ?? c.created_at ?? i}`,
              type: 'review' as const,
              author: (c.user as any)?.login ?? '',
              body: (c.body as string) ?? '',
              createdAt: (c.created_at as string) ?? '',
              updatedAt: (c.updated_at as string) ?? '',
              path: (c.path as string) ?? '',
              line: c.line != null ? String(c.line) : undefined,
            })));
          }
        } catch {
          // Ignore review comment parse failures.
        }
      }
    })(),
  ]).then(() => {
    const comments = [...issueComments, ...reviewComments, ...reviewTimelineComments].sort((a, b) => {
      const at = new Date(a.createdAt).getTime();
      const bt = new Date(b.createdAt).getTime();
      return bt - at;
    });

    return {
      comments,
      issueCount: issueComments.length,
      reviewCount: reviewComments.length,
    };
  });
}
