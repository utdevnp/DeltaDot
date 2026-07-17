import React from 'react';
import { Box, Text } from 'ink';
import type { RepoState } from '../types.js';
import { pad, truncate, statusIcon, timeAgo } from '../utils.js';
import { Table } from './Table.js';
import type { ColDef } from './Table.js';

export function RepoList({ repos, allRepos, selectedIdx, searchQuery, showBranch, frame, width }: {
  repos: RepoState[]; allRepos: RepoState[]; selectedIdx: number; searchQuery: string; showBranch: boolean; frame: number; width: number;
}) {
  const indent = 3;
  const sep = ' │ ';
  const numW = 3;
  const nameW = Math.max(14, Math.floor(width * 0.2));

  const contentWidths = allRepos.map((repo) => {
    const behindCount = repo.status === 'behind' ? repo.diffCommits.length : 0;
    let diffStr: string;
    if (repo.status === 'loading' || repo.status === 'stale' || repo.status === 'syncing') diffStr = 'syncing';
    else if (repo.status === 'error') diffStr = 'error';
    else if (repo.missingRelease) diffStr = 'no release';
    else if (repo.status === 'behind') diffStr = `${behindCount} behind`;
    else diffStr = 'synced';
    const versionDisplay = repo.latestVersion && repo.latestVersionDate
      ? `${repo.latestVersion} (${timeAgo(repo.latestVersionDate)})`
      : (repo.latestVersion ?? '');
    return {
      diff: diffStr.length,
      version: versionDisplay.length,
      author: repo.lastCommitAuthor.length,
      age: repo.lastCommitAge.length,
    };
  });

  const diffW   = Math.min(Math.max(4, ...contentWidths.map(c => c.diff),   1), 12);
  const versionW = Math.min(Math.max(7, ...contentWidths.map(c => c.version), 1), 28);
  const authorW  = Math.min(Math.max(6, ...contentWidths.map(c => c.author),  1), 24);
  const ageW     = Math.min(Math.max(3, ...contentWidths.map(c => c.age),     1), 14);
  const msgW = Math.max(8, width - indent - numW - nameW - diffW - versionW - authorW - ageW - sep.length * 6);

  if (repos.length === 0) {
    return (
      <Box paddingLeft={indent} paddingTop={1}>
        <Text color="yellowBright">No repos match filter{searchQuery ? `: "${searchQuery}"` : ''}</Text>
      </Box>
    );
  }

  const columns: ColDef[] = [
    { label: '#', width: numW },
    { label: 'NAME', width: nameW },
    { label: 'DIFF', width: diffW },
    { label: 'VERSION', width: versionW },
    { label: 'AUTHOR', width: authorW },
    { label: 'AGE', width: ageW },
    { label: 'LAST COMMIT', width: msgW },
  ];

  return (
    <Box flexDirection="column">
      <Table columns={columns} width={width}>
        {repos.map((repo) => {
          const origIdx = allRepos.indexOf(repo);
          const isSel = origIdx === selectedIdx;
          const icon = statusIcon(repo.status, frame + origIdx * 2);
          const behindCount = repo.status === 'behind' ? repo.diffCommits.length : 0;

          let diffStr: string;
          if (repo.status === 'loading' || repo.status === 'stale' || repo.status === 'syncing') diffStr = 'syncing';
          else if (repo.status === 'error') diffStr = 'error';
          else if (repo.missingRelease) diffStr = 'no release';
          else if (repo.status === 'behind') diffStr = `${behindCount} behind`;
          else diffStr = 'synced';

          const lastMsg = repo.error
            ? truncate(repo.error, msgW)
            : truncate(repo.lastCommitMsg || repo.lastCommitMsg, msgW);
          const age = repo.lastCommitAge || '';
          const author = repo.status === 'loading' || repo.status === 'stale' || repo.status === 'syncing'
            ? '' : repo.lastCommitAuthor;

          const branchStr = showBranch && repo.currentBranch ? ` (${repo.currentBranch})` : '';
          const nameDisplay = repo.name + branchStr;

          const nameCol = pad(icon.char + ' ' + truncate(nameDisplay, Math.max(1, nameW - 2)), nameW);
          const versionDisplay = repo.latestVersion && repo.latestVersionDate
            ? `${repo.latestVersion} (${timeAgo(repo.latestVersionDate)})`
            : (repo.latestVersion ?? '');

          if (isSel) {
            return (
              <Box key={repo.name} paddingLeft={indent} height={1} minHeight={1}>
                <Text color="yellowBright" bold wrap="truncate-end">
                  {pad(String(origIdx + 1), numW)}{sep}{nameCol}{sep}{pad(diffStr, diffW)}{sep}{pad(versionDisplay, versionW)}{sep}{pad(author, authorW)}{sep}{pad(age, ageW)}{sep}{lastMsg}
                </Text>
              </Box>
            );
          }

          const isDim = repo.missingRelease;
          let diffColor: string;
          if (repo.status === 'behind') diffColor = 'redBright';
          else if (repo.status === 'error') diffColor = 'yellowBright';
          else diffColor = 'greenBright';
          const diffEl = <Text color={diffColor as any} dimColor={isDim || undefined}>{pad(diffStr, diffW)}</Text>;

          return (
            <Box key={repo.name} paddingLeft={indent} height={1} minHeight={1}>
              <Text color="cyan" dimColor={isDim || undefined}>{pad(String(origIdx + 1), numW)}</Text>
              <Text color="cyanBright" dimColor={isDim || undefined}>{sep}</Text>
              <Text color={icon.color as any} dimColor={isDim || undefined}>{icon.char}</Text>
              <Text dimColor={isDim || undefined}>{' '}</Text>
              <Box width={nameW - 2} height={1}>
                <Text color="whiteBright" bold dimColor={isDim || undefined} wrap="truncate-end">{repo.name}</Text>
                {showBranch && repo.currentBranch && <Text color="greenBright" dimColor={isDim || undefined}> ({repo.currentBranch})</Text>}
              </Box>
              <Text color="cyanBright" dimColor={isDim || undefined}>{sep}</Text>
              {diffEl}
              <Text color="cyanBright" dimColor={isDim || undefined}>{sep}</Text>
              <Text color="greenBright" dimColor={isDim || undefined}>{pad(versionDisplay, versionW)}</Text>
              <Text color="cyanBright" dimColor={isDim || undefined}>{sep}</Text>
              <Text color="cyanBright" dimColor={isDim || undefined}>{pad(author, authorW)}</Text>
              <Text color="cyanBright" dimColor={isDim || undefined}>{sep}</Text>
              <Text color="white" dimColor={isDim || undefined}>{pad(age, ageW)}</Text>
              <Text color="cyanBright" dimColor={isDim || undefined}>{sep}</Text>
              {repo.error
                ? <Text color="yellowBright" dimColor={isDim || undefined}>{lastMsg}</Text>
                : <Text color="white" dimColor={isDim || undefined}>{lastMsg}</Text>}
            </Box>
          );
        })}
      </Table>
    </Box>
  );
}
