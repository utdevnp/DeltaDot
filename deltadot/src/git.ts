import { exec } from 'child_process';
import type { CommitEntry, CommitDetail, LatestCommit, RepoState } from './types.js';
import { toUsername } from './utils.js';

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
    const idx = line.indexOf(' ');
    return { hash: idx !== -1 ? line.slice(0, idx) : line, message: idx !== -1 ? line.slice(idx + 1) : '' };
  });
}

async function fetchLatestCommits(repoPath: string, release: string): Promise<LatestCommit[]> {
  try {
    const out = await run(`git log -5 origin/${release} --format="%h|||%s|||%ae|||%ar"`, repoPath);
    if (!out) return [];
    return out.split('\n').map((line) => {
      const [hash = '', subject = '', author = '', age = ''] = line.split('|||');
      return { hash, subject, author: toUsername(author), age };
    });
  } catch { return []; }
}

async function getLatestTag(repoPath: string, base: string): Promise<{ tag: string | null; date: string | null }> {
  try {
    const out = await run(`git tag --merged origin/${base} --sort=-version:refname`, repoPath);
    const first = out.split('\n')[0]?.trim();
    if (!first) return { tag: null, date: null };
    const dateOut = await run(`git log -1 --format="%cI" ${first}`, repoPath);
    return { tag: first, date: dateOut || null };
  } catch { return { tag: null, date: null }; }
}

async function getCurrentBranch(repoPath: string): Promise<string> {
  try {
    const out = await run('git branch --show-current', repoPath);
    return out || 'HEAD';
  } catch { return ''; }
}

export async function analyzeRepo(repoPath: string, base: string, release: string): Promise<RepoState> {
  const name = repoPath.split('/').pop() ?? repoPath;
  try {
    await run('git fetch --all --quiet', repoPath);
    const logOut = await run(`git log origin/${base}..origin/${release} --oneline`, repoPath);
    const diffCommits = parseOneline(logOut);
    const latestCommits = await fetchLatestCommits(repoPath, release);
    const { tag: latestVersion, date: latestVersionDate } = await getLatestTag(repoPath, base);
    const currentBranch = await getCurrentBranch(repoPath);
    const first = latestCommits[0];
    return {
      name, path: repoPath,
      status: diffCommits.length === 0 ? 'synced' : 'behind',
      diffCommits, latestCommits,
      latestVersion, latestVersionDate, currentBranch,
      lastCommitMsg: first?.subject ?? '',
      lastCommitAge: first?.age ?? '',
      lastCommitAuthor: first?.author ?? '',
      error: null,
    };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    const msg = raw.split('\n').find((l) => /fatal|error/i.test(l)) ?? raw.split('\n')[0] ?? raw;
    const trimmed = msg.trim();
    const missingBranchPattern = /(couldn'?t find remote ref|could not find remote ref|couldn'?t find|ambiguous argument|bad revision|unknown revision|no such ref|does not have any commits yet)/i;
    if (missingBranchPattern.test(trimmed) && trimmed.includes(`origin/${release}`)) {
      return { name, path: repoPath, status: 'synced', diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null, currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: null, missingRelease: true };
    }
    return { name, path: repoPath, status: 'error', diffCommits: [], latestCommits: [], latestVersion: null, latestVersionDate: null, currentBranch: '', lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', error: trimmed };
  }
}

export async function fetchCommitDetail(repoPath: string, hash: string): Promise<CommitDetail> {
  try {
    const raw = await run(`git show ${hash} --stat --format="fuller"`, repoPath);
    const lines = raw.split('\n');
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
    return { hash, author, date, subject, body, stat: statLines.join('\n').trim() };
  } catch (err: unknown) {
    return { hash, author: '', date: '', subject: 'Could not load commit detail', body: err instanceof Error ? err.message : String(err), stat: '' };
  }
}
