import React from 'react';
import { Box, Text } from 'ink';
import type { RepoState } from '../types.js';
import { SPINNER, pad, truncate } from '../utils.js';
import { Table } from './Table.js';
import type { ColDef } from './Table.js';

export function CommitsView({ repo, base, release, selectedCommitIdx, frame, width }: {
  repo: RepoState; base: string; release: string; selectedCommitIdx: number; frame: number; width: number;
}) {
  const indent = 3;
  const hashW = 9, authorW = 16, ageW = 10;
  const msgW = Math.max(20, width - hashW - authorW - ageW - indent - 8);
  const isLive = repo.status === 'stale' || repo.status === 'syncing' || repo.status === 'loading';
  const spin = SPINNER[frame % SPINNER.length]!;

  const sep = ' │ ';
  const sectionDivider = (label: string) => (
    <Box paddingLeft={indent} height={1}>
      <Text dimColor bold>{'── '}{label}</Text>
    </Box>
  );

  const commitCols: ColDef[] = [
    { label: 'HASH', width: hashW },
    { label: 'AUTHOR', width: authorW },
    { label: 'AGE', width: ageW },
    { label: 'MESSAGE', width: msgW },
  ];

  const diffSection = (
    <Box flexDirection="column">
      <Box paddingTop={1}>{sectionDivider(`DIFF (origin/${base} .. origin/${release})`)}</Box>
      {isLive ? (
        <Box paddingLeft={indent} paddingTop={1} gap={2} height={1}>
          <Text color="cyanBright">{spin}</Text>
          <Text color="yellowBright">Syncing…</Text>
        </Box>
      ) : repo.status === 'synced' || repo.diffCommits.length === 0 ? (
        <Box paddingLeft={indent} paddingTop={1} gap={1} height={1}>
          <Text color="greenBright" bold>✓</Text>
          <Text color="greenBright">origin/{release} is caught up with origin/{base}</Text>
        </Box>
      ) : (
        <Table columns={commitCols} width={width}>
          {repo.diffCommits.map((c) => (
            <Box key={c.hash} paddingLeft={indent} height={1}>
              <Text color="yellowBright">{pad(c.hash, hashW)}</Text>
              <Text color="cyanBright">{sep}</Text>
              <Text color="white">{pad('', authorW)}</Text>
              <Text color="cyanBright">{sep}</Text>
              <Text color="white">{pad('', ageW)}</Text>
              <Text color="cyanBright">{sep}</Text>
              <Text color="whiteBright">{truncate(c.message, msgW)}</Text>
            </Box>
          ))}
        </Table>
      )}
    </Box>
  );

  const latestSection = (
    <Box flexDirection="column" marginTop={0}>
      <Box paddingTop={1}>{sectionDivider(`LATEST 5 (origin/${release})`)}</Box>
      {isLive ? (
        <Box paddingLeft={indent} paddingTop={1} gap={2} height={1}>
          <Text color="cyanBright">{spin}</Text>
          <Text color="yellowBright">Syncing…</Text>
        </Box>
      ) : repo.latestCommits.length === 0 ? (
        <Box paddingLeft={indent} paddingTop={1} height={1}>
          <Text color="yellowBright">No commits found on origin/{release}</Text>
        </Box>
      ) : (
        <Table columns={commitCols} width={width}>
          {repo.latestCommits.map((c, i) => {
            const isSel = i === selectedCommitIdx;
            if (isSel) {
              return (
                <Box key={c.hash} paddingLeft={indent} height={1}>
                  <Text color="yellowBright" bold wrap="truncate-end">
                    {pad(c.hash, hashW)}{sep}{pad(truncate(c.author, authorW), authorW)}{sep}{pad(c.age, ageW)}{sep}{truncate(c.subject, msgW)}
                  </Text>
                </Box>
              );
            }
            return (
              <Box key={c.hash} paddingLeft={indent} height={1}>
                <Text color="yellowBright">{pad(c.hash, hashW)}</Text>
                <Text color="cyanBright">{sep}</Text>
                <Text color="cyanBright">{pad(truncate(c.author, authorW), authorW)}</Text>
                <Text color="cyanBright">{sep}</Text>
                <Text color="whiteBright">{pad(c.age, ageW)}</Text>
                <Text color="cyanBright">{sep}</Text>
                <Text color="white">{truncate(c.subject, msgW)}</Text>
              </Box>
            );
          })}
        </Table>
      )}
    </Box>
  );

  return <Box flexDirection="column">{diffSection}{latestSection}</Box>;
}
