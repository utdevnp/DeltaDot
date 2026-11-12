import type { AppConfig, BranchPair, CacheFile } from './types.js';

/** A workspace needs a sync if its saved comparison does not cover every current repository. */
export function workspaceNeedsInitialSync(paths: string[], cache: CacheFile | null, config: Pick<AppConfig, 'base' | 'release'>): boolean {
  if (paths.length === 0) return false;
  if (!cache || cache.base !== config.base || cache.release !== config.release) return true;
  const savedRepos = new Map(cache.repos.map((repo) => [repo.path, repo]));
  return paths.some((path) => {
    const repo = savedRepos.get(path);
    return !repo || repo.status === 'stale' || repo.status === 'loading' || repo.status === 'syncing';
  });
}

/** Return the next saved comparison, treating the first pair as active for older configs. */
export function nextBranchPair(pairs: BranchPair[], activeId?: string): BranchPair | null {
  if (pairs.length < 2) return null;
  const index = pairs.findIndex((pair) => pair.id === activeId);
  return pairs[((index < 0 ? 0 : index) + 1) % pairs.length] ?? null;
}
