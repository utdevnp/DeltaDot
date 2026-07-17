import React from 'react';
import { program } from 'commander';
import type { AppConfig } from './types.js';
import { loadGlobalConfig, saveGlobalConfig, resolveCliConfig, loadCache, findGitRepos, resolveInitialRepos } from './config.js';
import { Dashboard } from './Dashboard.js';

program
  .name('deltadot')
  .description('Check if local Git repositories are synchronized with their upstream remotes.')
  .version('1.0.0')
  .option('--path <dir>', 'Workspace directory containing Git repositories')
  .option('--base <branch>', 'Base branch to compare against')
  .option('--release <branch>', 'Release branch to inspect')
  .option('--sync-interval <minutes>', 'Auto-sync interval in minutes')
  .option('--token <token>', 'API token for PR fetching (GitHub/Bitbucket/GitLab)')
  .option('--provider <type>', 'Provider type: github, gitlab, or bitbucket')
  .parse(process.argv);

const cliOpts = program.opts<{ path?: string; base?: string; release?: string; syncInterval?: string; token?: string; provider?: string }>();
const savedCfg = await loadGlobalConfig();
const _finalCfg = resolveCliConfig(cliOpts, savedCfg);
if (!_finalCfg) process.exit(1);
const finalCfg: AppConfig = _finalCfg;

await saveGlobalConfig(finalCfg);

const repoPaths = findGitRepos(finalCfg.workspace);
if (repoPaths.length === 0) {
  console.log(`No Git repositories found in ${finalCfg.workspace}`);
  process.exit(0);
}

const cache = await loadCache(finalCfg.workspace);
const { initialRepos, initialLastSync } = resolveInitialRepos(repoPaths, cache, finalCfg);
const initialPRs = cache?.prs ?? [];

if (process.stdout.isTTY) {
  try {
    process.stdout.write('\x1b[3J\x1b[H\x1b[2J');
    process.stdout.write('\x1b[?47h');
    process.stdout.write('\x1b[?1049h');
  } catch (_) { /* best effort */ }
  const restoreScreen = () => {
    try {
      process.stdout.write('\x1b[?1049l');
      process.stdout.write('\x1b[?47l');
    } catch (_) { /* best effort */ }
  };
  process.on('exit', restoreScreen);
  process.on('SIGINT', () => { restoreScreen(); process.exit(130); });
  process.on('SIGTERM', () => { restoreScreen(); process.exit(0); });
  process.on('uncaughtException', (err) => { restoreScreen(); throw err; });

  // Attempt fullscreen (macOS Terminal.app / iTerm2) — best effort
  (async () => {
    try {
      const { execSync } = await import('child_process');
      const term = process.env.TERM_PROGRAM ?? '';
      if (term === 'Apple_Terminal') {
        execSync('osascript -e \'tell application "Terminal" to set bounds of front window to {0, 0, 1920, 1080}\'', { timeout: 2000 });
      } else if (term === 'iTerm.app' || term === 'iTerm2') {
        execSync('osascript -e \'tell application "iTerm2" to tell current window to toggle full screen\'', { timeout: 2000 });
      }
    } catch (_) { /* non-fatal */ }
  })();
}

let _titleInterval: NodeJS.Timeout | undefined;
try {
  const title = 'DeltaDot';
  if (process.stdout.isTTY) {
    const writeTitle = () => {
      try {
        process.stdout.write(`\x1b]0;${title}\x07`);
        process.stdout.write(`\x1b]1;${title}\x07`);
        process.stdout.write(`\x1b]2;${title}\x07`);
        process.stdout.write(`\x1b]0;${title}\x1b\\`);
        process.stdout.write(`\x1b]1;${title}\x1b\\`);
        process.stdout.write(`\x1b]2;${title}\x1b\\`);
      } catch (_) { /* best effort */ }
    };
    writeTitle();
    _titleInterval = setInterval(writeTitle, 500);
    const _clearTitleInterval = () => { if (_titleInterval) { clearInterval(_titleInterval); _titleInterval = undefined; } };
    process.on('exit', _clearTitleInterval);
    process.on('SIGINT', _clearTitleInterval);
    process.on('SIGTERM', _clearTitleInterval);
    process.on('uncaughtException', _clearTitleInterval);
  }
} catch (_) { /* best-effort */ }

export function App() {
  return (
    <Dashboard
      initialConfig={finalCfg}
      initialRepos={initialRepos}
      initialLastSync={initialLastSync}
      initialPRs={initialPRs}
    />
  );
}
