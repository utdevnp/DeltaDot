import { exec } from 'child_process';
import type { CommitEntry, CommitDetail, CommitFile, LatestCommit, RepoGitInfo, RepoState } from './types.js';
import { toUsername } from './utils.js';
import { getLocalChanges } from './local-changes.js';

export function run(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve((stdout ?? '').toString().trim());
    });
  });
}

function parseOneline(logOutput: string): CommitEntry[] {
  if (!logOutput) return [];
  return logOutput.split('\n').map((line) => {
    const [hash = '', message = '', author = '', age = '', date = ''] = line.split('|||');
    return { hash, message, author: author ? toUsername(author) : '', age, date };
  });
}

async function fetchLatestCommits(repoPath: string, release: string): Promise<LatestCommit[]> {
  try {
    const out = await run(`git log -5 origin/${release} --format="%h|||%s|||%ae|||%ar|||%cI"`, repoPath);
    if (!out) return [];
    return out.split('\n').map((line) => {
      const [hash = '', subject = '', author = '', age = '', date = ''] = line.split('|||');
      return { hash, subject, author: toUsername(author), age, date };
    });
  } catch { return []; }
}

export async function fetchBranchCommits(repoPath: string, branch: string): Promise<LatestCommit[]> {
  return fetchLatestCommits(repoPath, branch);
}

export async function countCommitsSinceTag(repoPath: string, branch: string): Promise<{ tag: string; count: number } | null> {
  const safeBranch = branch.trim().replace(/^refs\/heads\//, '');
  if (!safeBranch || safeBranch.startsWith('-')) return null;
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  await run('git fetch origin --tags --quiet', repoPath).catch(() => '');
  try {
    const branchRef = `origin/${safeBranch}`;
    const tags = await run(`git for-each-ref --merged=${quote(branchRef)} --sort=-version:refname --format='%(refname:short)' refs/tags`, repoPath);
    const latestTag = tags.split('\n')[0]?.trim();
    if (!latestTag) return null;
    const count = await run(`git rev-list --count ${quote(`${latestTag}..${branchRef}`)}`, repoPath);
    return { tag: latestTag, count: Number.parseInt(count, 10) };
  } catch { return null; }
}

export async function getRepoGitInfo(repoPath: string): Promise<RepoGitInfo> {
  // Refresh tags even when the configured release branch is missing.
  await run('git fetch --all --tags --quiet', repoPath).catch(() => '');
  const [currentBranch, localBranchesOut, remoteBranchesOut, headOut, tagsOut] = await Promise.all([
    getCurrentBranch(repoPath),
    run("git for-each-ref --format='%(refname:short)' refs/heads", repoPath),
    run("git for-each-ref --format='%(refname:short)' refs/remotes", repoPath),
    run('git log -1 --format="%h%x09%s%x09%cI" HEAD', repoPath).catch(() => ''),
    run("git for-each-ref --sort=-version:refname --format='%(refname:short)%09%(objectname:short)%09%(creatordate:iso-strict)%09%(subject)' refs/tags", repoPath).catch(() => ''),
  ]);
  const localBranches = localBranchesOut.split('\n').map((branch) => branch.trim()).filter(Boolean);
  const remoteBranches = remoteBranchesOut.split('\n').map((branch) => branch.trim()).filter((branch) => branch && branch !== 'origin/HEAD');
  const [headCommit = '', headSubject = '', headDate = ''] = headOut.split('\t');
  const tags = tagsOut.split('\n').filter(Boolean).map((line) => {
    const [name = '', commit = '', date = '', subject = ''] = line.split('\t');
    return { name, commit, date, subject };
  });
  return {
    currentBranch,
    localBranches, remoteBranches,
    headCommit, headSubject, headDate, tags,
  };
}

async function getLatestTag(repoPath: string): Promise<{ tag: string | null; date: string | null }> {
  try {
    const out = await run("git for-each-ref --sort=-creatordate --format='%(refname:short)%09%(creatordate:iso-strict)' refs/tags", repoPath);
    const [tag, date] = out.split('\n')[0]?.split('\t') ?? [];
    return { tag: tag?.trim() || null, date: date?.trim() || null };
  } catch { return { tag: null, date: null }; }
}

async function getCurrentBranch(repoPath: string): Promise<string> {
  try {
    const out = await run('git branch --show-current', repoPath);
    return out || 'HEAD';
  } catch { return ''; }
}

export async function analyzeRepo(repoPath: string, base: string, release: string, fetchMode: 'all' | 'origin' = 'all'): Promise<RepoState> {
  const name = repoPath.split('/').pop() ?? repoPath;
  let localChangesCount = 0;
  let localCommitsCount: number | null = null;
  try {
    const localChanges = await getLocalChanges(repoPath);
    localChangesCount = localChanges.files.length;
    localCommitsCount = localChanges.commitsAhead;
    // Every repo sync refreshes tags, regardless of release branch or sync mode.
    // Attempt the tag fetch for every repo. A fetch error should not prevent
    // us from reading tags already present locally or comparing branches.
    await run('git fetch --all --tags --quiet', repoPath).catch(() => '');
    const { tag: latestVersion, date: latestVersionDate } = await getLatestTag(repoPath);
    let hasRelease = true;
    try {
      await run(`git show-ref --verify --quiet refs/remotes/origin/${release}`, repoPath);
    } catch {
      hasRelease = false;
    }
    if (!hasRelease) {
      const baseCommits = await fetchLatestCommits(repoPath, base);
      const currentBranch = await getCurrentBranch(repoPath);
      const first = baseCommits[0];
      return {
        name, path: repoPath, status: 'synced', diffCommits: [], latestCommits: baseCommits, baseCommits,
        latestVersion, latestVersionDate, currentBranch,
        lastCommitMsg: first?.subject ?? '', lastCommitAge: first?.age ?? '',
        lastCommitAuthor: first?.author ?? '', error: null, missingRelease: true, localChangesCount,
        localCommitsCount, fetchMode, baseAheadCount: null, releaseAheadCount: 0,
        lastSyncedAt: new Date().toISOString(),
      };
    }
    const logOut = await run(`git log origin/${base}..origin/${release} --format="%h|||%s|||%ae|||%ar|||%cI"`, repoPath);
    const diffCommits = parseOneline(logOut);
    let baseAheadCount: number | null = null;
    try {
      const ahead = await run(`git rev-list --count origin/${release}..origin/${base}`, repoPath);
      baseAheadCount = Number.parseInt(ahead, 10) || 0;
    } catch { /* keep the normal sync result if only the reverse comparison is unavailable */ }
    const latestCommits = await fetchLatestCommits(repoPath, release);
    const baseCommits = await fetchLatestCommits(repoPath, base);
    const currentBranch = await getCurrentBranch(repoPath);
    const first = latestCommits[0];
    return {
      name, path: repoPath,
      status: diffCommits.length === 0 ? 'synced' : 'behind',
      diffCommits, latestCommits, baseCommits,
      latestVersion, latestVersionDate, currentBranch,
      lastCommitMsg: first?.subject ?? '',
      lastCommitAge: first?.age ?? '',
      lastCommitAuthor: first?.author ?? '',
      error: null,
      localChangesCount,
      localCommitsCount,
      fetchMode,
      baseAheadCount,
      releaseAheadCount: diffCommits.length,
      lastSyncedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    const msg = raw.split('\n').find((l) => /fatal|error/i.test(l)) ?? raw.split('\n')[0] ?? raw;
    const trimmed = msg.trim();
    const missingBranchPattern = /(couldn'?t find remote ref|could not find remote ref|couldn'?t find|ambiguous argument|bad revision|unknown revision|no such ref|does not have any commits yet)/i;
    if (missingBranchPattern.test(trimmed) && trimmed.includes(`origin/${release}`)) {
      const { tag: latestVersion, date: latestVersionDate } = await getLatestTag(repoPath);
      return { name, path: repoPath, status: 'synced', diffCommits: [], latestCommits: [], baseCommits: [], latestVersion, latestVersionDate, currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: null, missingRelease: true, localChangesCount, localCommitsCount, fetchMode, lastSyncedAt: new Date().toISOString() };
    }
    const { tag: latestVersion, date: latestVersionDate } = await getLatestTag(repoPath);
    return { name, path: repoPath, status: 'error', diffCommits: [], latestCommits: [], localChangesCount, localCommitsCount, fetchMode, latestVersion, latestVersionDate, currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: trimmed };
  }
}

export async function fetchCommitDetail(repoPath: string, hash: string): Promise<CommitDetail> {
  try {
    // Get metadata + stat
    const meta = await run(`git show ${hash} --stat --format="fuller"`, repoPath);
    const lines = meta.split('\n');
    let author = '', date = '', subject = '';
    const bodyLines: string[] = [], statLines: string[] = [];
    let headerDone = false, inBody = false, inStat = false;
    for (const line of lines) {
      if (line.startsWith('commit ')) continue;
      if (line.startsWith('Author:     ')) { 
        author = toUsername(line.slice(12).trim());
        continue;
      }
      if (line.startsWith('AuthorDate:') || line.startsWith('CommitDate:')) {
        if (!date) date = line.replace(/^(AuthorDate:|CommitDate:)\s*/, '').trim();
        continue;
      }
      if (line.startsWith('Commit:     ') || line.startsWith('Merge:')) continue;
      if (!headerDone && line === '') { headerDone = true; inBody = true; continue; }
      if (inBody && !inStat) {
        if (/^\s+\S.*\|\s+\d/.test(line) || /^\s+\d+ file/.test(line)) { inStat = true; inBody = false; statLines.push(line); }
        else bodyLines.push(line);
        continue;
      }
      if (inStat) { statLines.push(line); continue; }
    }
    const allBody = bodyLines.join('\n').trim().split('\n');
    subject = allBody[0] ?? '';
    const body = allBody.slice(1).join('\n').trim();

    // Get file list + status via diff-tree
    const fileListRaw = await run(`git diff-tree --no-commit-id -r --name-status ${hash}`, repoPath);
    const files: CommitFile[] = [];

    if (fileListRaw) {
      const fileLines = fileListRaw.split('\n').filter(Boolean);
      for (const fl of fileLines) {
        const parts = fl.split('\t');
        const statusRaw = parts[0] ?? '';
        const filePath = parts.slice(1).join('\t') || '';
        let status: CommitFile['status'] = 'modified';
        if (statusRaw === 'A') status = 'added';
        else if (statusRaw === 'D') status = 'deleted';
        else if (statusRaw === 'R' || statusRaw.startsWith('R')) status = 'renamed';

        // Get per-file diff/patch
        try {
          const patch = await run(`git show ${hash} --format="" -- "${filePath}"`, repoPath);
          // Count additions/deletions from the diff
          let additions = 0, deletions = 0;
          for (const pl of patch.split('\n')) {
            if (pl.startsWith('+') && !pl.startsWith('+++')) additions++;
            else if (pl.startsWith('-') && !pl.startsWith('---')) deletions++;
          }
          files.push({ path: filePath, status, additions, deletions, patch });
        } catch {
          files.push({ path: filePath, status, additions: 0, deletions: 0 });
        }
      }
    }

    // Get raw unified patch for reference
    let rawPatch = '';
    try {
      rawPatch = await run(`git show ${hash} --format=""`, repoPath);
    } catch { /* optional */ }

    return { hash, author, date, subject, body, stat: statLines.join('\n').trim(), files, rawPatch };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { hash, author: '', date: '', subject: 'Could not load commit detail', body: msg, stat: '', files: [], rawPatch: '' };
  }
}
