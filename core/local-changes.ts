import { execFile } from 'child_process';
import { promisify } from 'util';
import type { LocalAheadCommit, LocalChangeFile, LocalChangesSnapshot } from './types.js';

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string, allowDiffExit = false): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    return stdout.trimEnd();
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    if (allowDiffExit && failure.code === 1) return failure.stdout ?? '';
    throw new Error((failure.stderr || failure.message || 'Git command failed').trim());
  }
}

function countLines(patch: string) {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }
  return { additions, deletions };
}

export async function getLocalChanges(repoPath: string): Promise<LocalChangesSnapshot> {
  const status = await git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], repoPath);
  const entries = status.split('\0').filter(Boolean);
  const changes = new Map<string, { code: string; staged: boolean; unstaged: boolean; untracked: boolean }>();
  for (const entry of entries) {
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!path) continue;
    changes.set(path, {
      code,
      staged: code[0] !== ' ' && code[0] !== '?',
      unstaged: code[1] !== ' ',
      untracked: code === '??',
    });
  }

  const files: LocalChangeFile[] = await Promise.all([...changes].map(async ([path, state]) => {
    const patch = state.untracked
      ? await git(['--no-pager', 'diff', '--no-index', '--no-color', '--no-ext-diff', '/dev/null', path], repoPath, true).catch(() => '')
      : await git(['--no-pager', 'diff', '--no-color', '--no-ext-diff', 'HEAD', '--', path], repoPath).catch(() => '');
    return { path, status: state.code, staged: state.staged, unstaged: state.unstaged, untracked: state.untracked, ...countLines(patch), patch };
  }));
  files.sort((a, b) => a.path.localeCompare(b.path));

  let commitsAhead: number | null = null;
  let aheadCommits: LocalAheadCommit[] = [];
  try {
    const upstream = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], repoPath);
    const range = `${upstream}..HEAD`;
    const count = await git(['rev-list', '--count', range], repoPath);
    commitsAhead = Number.parseInt(count, 10) || 0;
    const log = await git(['log', '--max-count=25', '--format=%h%x09%s%x09%cI', range], repoPath);
    aheadCommits = log ? log.split('\n').map((line) => {
      const [hash = '', subject = '', date = ''] = line.split('\t');
      return { hash, subject, date };
    }) : [];
  } catch { /* repositories without an upstream have no comparable ahead count */ }
  return { files, commitsAhead, aheadCommits };
}

export async function discardLocalFile(repoPath: string, path: string, untracked: boolean): Promise<void> {
  if (untracked) await git(['clean', '-f', '--', path], repoPath);
  else await git(['restore', '--source=HEAD', '--staged', '--worktree', '--', path], repoPath);
}

export async function discardAllLocalChanges(repoPath: string): Promise<void> {
  await git(['restore', '--source=HEAD', '--staged', '--worktree', '--', ':/'], repoPath);
  await git(['clean', '-fd', '--', ':/'], repoPath);
  await git(['fetch', '--all', '--tags', '--quiet'], repoPath);
}

export async function fetchRepoTags(repoPath: string): Promise<void> {
  await git(['fetch', '--all', '--tags', '--quiet'], repoPath);
}

export async function commitLocalChanges(repoPath: string, paths: string[], message: string): Promise<string> {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) throw new Error('Enter a commit message.');
  if (paths.length === 0) throw new Error('There are no local changes to commit.');
  await git(['--literal-pathspecs', 'add', '-A', '--', ...paths], repoPath);
  await git(['--literal-pathspecs', 'commit', '-m', trimmedMessage, '--', ...paths], repoPath);
  return git(['rev-parse', '--short', 'HEAD'], repoPath);
}
