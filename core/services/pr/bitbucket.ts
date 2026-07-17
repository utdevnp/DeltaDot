import type { PR, PRDetail, PRCommit, PRFile } from '../../types.js';
import { bearerHeaders } from './shared.js';

export async function fetchBitbucketPRs(
  owner: string,
  repo: string,
  token: string,
  repoName?: string
): Promise<PR[]> {
  const headers = bearerHeaders(token);
  const url = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/pullrequests?state=OPEN&pagelen=50`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Bitbucket API error ${res.status}: ${res.statusText} - ${errorBody}`);
  }

  const json = await res.json() as { values: unknown[] };
  const data = json.values;
  if (!Array.isArray(data)) {
    throw new Error('Unexpected Bitbucket API response: Expected array');
  }

  const prs = data.map((item: any) => {
    const authorObj = item.author;
    const sourceObj = item.source;
    const destObj = item.destination;
    const linksObj = item.links;
    const htmlLinks = linksObj?.html;
    return {
      number: item.id as number,
      title: item.title as string,
      author: (authorObj?.display_name ?? authorObj?.nickname ?? '') as string,
      state: (item.state as string) === 'OPEN' ? 'open' : ((item.state as string)?.toLowerCase() ?? ''),
      sourceBranch: ((sourceObj?.branch as any)?.name ?? '') as string,
      targetBranch: ((destObj?.branch as any)?.name ?? '') as string,
      createdAt: item.created_on as string,
      url: (htmlLinks?.href as string) ?? '',
      repoName: repoName ?? '',
      approved: false,
    };
  });

  return Promise.all(prs.map(async (pr) => {
    try {
      const aUrl = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/pullrequests/${pr.number}/approvals`;
      const aRes = await fetch(aUrl, { headers });
      if (aRes.ok) {
        const approvalData = await aRes.json() as { values: unknown[] };
        pr.approved = Array.isArray(approvalData.values) && approvalData.values.length > 0;
      }
    } catch { /* ignore — treat as unapproved */ }
    return pr;
  }));
}

export async function fetchBitbucketPRDetail(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<PRDetail> {
  const headers = bearerHeaders(token);

  const url = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/pullrequests/${prNumber}`;
  const commitsUrl = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/pullrequests/${prNumber}/commits`;
  const diffstatUrl = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/pullrequests/${prNumber}/diffstat?limit=100`;
  const diffUrl = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/pullrequests/${prNumber}/diff`;

  const [res, commitsRes, diffstatRes, diffRes] = await Promise.all([
    fetch(url, { headers }),
    fetch(commitsUrl, { headers }).catch(() => null),
    fetch(diffstatUrl, { headers }).catch(() => null),
    fetch(diffUrl, { headers }).catch(() => null)
  ]);

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Bitbucket API error ${res.status}: ${res.statusText} - ${errorBody}`);
  }

  const item = await res.json() as any;

  let commits: PRCommit[] = [];
  if (commitsRes && commitsRes.ok) {
    try {
      const commitData = await commitsRes.json() as any;
      if (commitData && typeof commitData === 'object' && Array.isArray(commitData.values)) {
        commits = commitData.values.map((c: any) => ({
          hash: (c.hash as string)?.slice(0, 7) ?? '',
          message: (c.message as string)?.split('\n')[0] ?? '',
          author: (c.author?.raw as string)?.split(' <')[0] ?? (c.author?.user?.display_name as string) ?? '',
          date: (c.date as string) ?? '',
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

  if (diffstatRes && diffstatRes.ok) {
    try {
      const diffstatData = await diffstatRes.json() as any;
      const values = diffstatData.values ?? [];

      let patches: Record<string, string> = {};
      if (diffRes && diffRes.ok) {
        const diffText = await diffRes.text();
        patches = parseBitbucketDiff(diffText);
      }

      if (Array.isArray(values)) {
        changedFiles = values.length;
        files = values.map((val: any) => {
          const path = val.new?.path ?? val.old?.path ?? '';
          const status = val.status === 'removed' ? 'deleted' : val.status === 'added' ? 'added' : val.status === 'renamed' ? 'renamed' : 'modified';
          const fileAdd = val.lines_added ?? 0;
          const fileDel = val.lines_removed ?? 0;
          additions += fileAdd;
          deletions += fileDel;
          return {
            path,
            additions: fileAdd,
            deletions: fileDel,
            status,
            previousPath: val.old?.path !== path ? val.old?.path : undefined,
            patch: patches[path],
          };
        });
      }
    } catch {
      // Ignore
    }
  }

  const authorObj = item.author;
  const sourceObj = item.source;
  const destObj = item.destination;
  const linksObj = item.links;
  const htmlLinks = linksObj?.html;

  return {
    number: item.id as number,
    title: item.title as string,
    description: item.description as string,
    author: (authorObj?.display_name ?? authorObj?.nickname ?? '') as string,
    state: (item.state as string) === 'OPEN' ? 'open' : ((item.state as string)?.toLowerCase() ?? ''),
    sourceBranch: ((sourceObj?.branch as any)?.name ?? '') as string,
    targetBranch: ((destObj?.branch as any)?.name ?? '') as string,
    createdAt: item.created_on as string,
    updatedAt: item.updated_on as string,
    url: (htmlLinks?.href as string) ?? '',
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

function parseBitbucketDiff(diffText: string): Record<string, string> {
  const filePatches: Record<string, string> = {};
  if (!diffText) return filePatches;
  const sections = diffText.split(/^diff --git /m);
  for (const sec of sections) {
    if (!sec.trim()) continue;
    const match = sec.match(/^a\/(.+?)\s+b\/(.+?)(?:\n|$)/);
    if (match && match[2]) {
      const path = match[2].trim();
      filePatches[path] = sec;
    }
  }
  return filePatches;
}
