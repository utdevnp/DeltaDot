import { execFile } from 'child_process';
import { lstat, mkdtemp, rename, rm } from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { promisify } from 'util';
import { analyzeRepo, run } from './git.js';
import type { ForceFetchProgress, RepoState } from './types.js';

const execFileAsync = promisify(execFile);

function errorText(error: unknown): string {
  const failure = error as NodeJS.ErrnoException & { stderr?: string | Buffer };
  return failure.stderr?.toString().trim() || failure.message || String(error);
}

export async function forceReplaceRepo(
  repoPath: string,
  approvedRemote: string,
  base: string,
  release: string,
  onProgress: (progress: ForceFetchProgress) => void,
): Promise<RepoState> {
  let tempRoot: string | null = null;
  let preserveRecovery = false;
  let activeStep: ForceFetchProgress['step'] = 'check';
  const report = (step: ForceFetchProgress['step'], status: ForceFetchProgress['status'], message: string) => {
    activeStep = step;
    onProgress({ step, status, message });
  };

  try {
    report('check', 'running', 'Rechecking that the current repository folder is present…');
    const target = resolve(repoPath);
    const info = await lstat(target);
    if (!info.isDirectory()) throw new Error('The repository path is not a directory.');
    await run('git rev-parse --is-inside-work-tree', target);
    report('check', 'success', 'Repository folder exists and is a Git working tree.');
    report('remote', 'running', 'Rechecking the approved origin URL…');
    const remote = (await run('git remote get-url origin', target)).trim();
    if (!remote) throw new Error('The repository has no origin remote.');
    if (remote !== approvedRemote.trim()) throw new Error('The origin URL changed after confirmation. Reopen Force Fetch and review the updated remote.');
    report('remote', 'success', `Origin confirmed: ${remote}`);

    const parent = dirname(target);
    const name = basename(target);
    report('clone', 'running', 'Preparing a temporary folder for the fresh clone…');
    tempRoot = await mkdtemp(join(parent, `.deltadot-force-${name}-`));
    const freshClone = join(tempRoot, 'fresh-clone');

    report('clone', 'running', `Cloning ${remote} into a temporary folder…`);
    const gitSshCmd = process.env.GIT_SSH_COMMAND || 'ssh -o StrictHostKeyChecking=accept-new';
    await execFileAsync('git', ['clone', remote, freshClone], {
      cwd: parent,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, GIT_SSH_COMMAND: gitSshCmd },
    });
    report('clone', 'success', 'Fresh clone completed. The current repository is still untouched.');

    report('sync', 'running', `Fetching tags and comparing ${release} with ${base}…`);
    const refreshed = await analyzeRepo(freshClone, base, release, 'all');
    if (refreshed.status === 'error') throw new Error(refreshed.error || 'Branch comparison failed on the fresh clone.');
    report('sync', 'success', refreshed.missingRelease
      ? `Repository refreshed; release branch “${release}” is not present on the remote.`
      : `Fetched remote refs and compared ${release} with ${base}.`);

    report('replace', 'running', 'Replacing the local repository with the validated fresh clone…');
    const recoveryPath = join(tempRoot, 'previous-repository');
    await rename(target, recoveryPath);
    try {
      await rename(freshClone, target);
    } catch (swapError) {
      try { await rename(recoveryPath, target); }
      catch (restoreError) {
        preserveRecovery = true;
        throw new Error(`Could not install the fresh clone, and the previous repository could not be restored. It is preserved at ${recoveryPath}. ${errorText(restoreError)}`);
      }
      throw swapError;
    }

    const result: RepoState = {
      ...refreshed,
      name,
      path: target,
      lastSyncedAt: new Date().toISOString(),
    };
    report('replace', 'success', 'Clean clone is now in place.');
    return result;
  } catch (error) {
    const message = errorText(error);
    onProgress({ step: activeStep, status: 'error', message });
    throw new Error(message);
  } finally {
    if (tempRoot && !preserveRecovery) await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
