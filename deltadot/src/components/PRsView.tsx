import React from 'react';
import { Box, Text } from 'ink';
import type { PR } from '../types.js';
import { SPINNER, pad, truncate } from '../utils.js';
import { Table } from './Table.js';
import type { ColDef } from './Table.js';

export function PRsView({ prs, syncingRepoNames, selectedIdx, loading, error, frame, width }: {
  prs: PR[]; syncingRepoNames: string[]; selectedIdx: number; loading: boolean; error: string; frame: number; width: number;
}) {
  const indent = 3;
  const sep = ' │ ';
  const syncingRepos = new Set(syncingRepoNames);
  const snW = 3;
  const numW = 4;
  const repoW = prs.length > 0 
    ? Math.min(Math.max(10, ...prs.map(p => (p.repoName ?? '').length)), 36)
    : 10;
  const stateW = 6;
  const aprvdW = 5;
  const branchW = prs.length > 0
    ? Math.min(Math.max(12, ...prs.map(p => (p.sourceBranch ?? '').length)), 32)
    : 18;
  const authorW = prs.length > 0
    ? Math.min(Math.max(10, ...prs.map(p => (p.author ?? '').length)), 28)
    : 10;
  const ageW = 8;
  const titleW = Math.max(10, width - indent - snW - ageW - numW - repoW - stateW - aprvdW - branchW - authorW - sep.length * 8);

  const columns: ColDef[] = [
    { label: '#', width: snW },
    { label: 'TITLE', width: titleW },
    { label: 'AGE', width: ageW },
    { label: 'PR #', width: numW },
    { label: 'REPO', width: repoW },
    { label: 'STATE', width: stateW },
    { label: 'APRVD', width: aprvdW },
    { label: 'BRANCH', width: branchW },
    { label: 'AUTHOR', width: authorW },
  ];

  if (loading && prs.length === 0) {
    const spin = SPINNER[frame % SPINNER.length]!;
    return (
      <Box paddingLeft={indent} paddingTop={1} gap={2} height={1}>
        <Text color="cyanBright">{spin}</Text>
        <Text color="yellowBright">Loading PR…</Text>
      </Box>
    );
  }

  if (error && prs.length === 0) {
    return (
      <Box paddingLeft={indent} paddingTop={1} flexGrow={1}>
        <Text color="redBright" wrap="truncate-end">⚠ {error}</Text>
      </Box>
    );
  }

  const distinctRepos = [...new Set(prs.map((p) => p.repoName).filter(Boolean))];
  const subtitle = distinctRepos.length <= 3 ? distinctRepos.join(', ') : `${distinctRepos.length} repos`;

  return (
    <Box flexDirection="column">
      <Box paddingLeft={indent} paddingTop={1} height={1} gap={1}>
        <Text color="whiteBright" bold>PR — {subtitle}</Text>
        {loading && (
          <Text color="yellowBright" bold>({SPINNER[frame % SPINNER.length]} syncing…)</Text>
        )}
      </Box>
      {error && prs.length > 0 && (
        <Box paddingLeft={indent} minHeight={1}>
          <Text color="redBright" wrap="truncate-end">⚠ {error}</Text>
        </Box>
      )}
      <Table columns={columns} width={width}>
        {prs.length === 0 ? (
          <Box flexGrow={1} paddingLeft={indent} paddingTop={1}>
            <Text color="yellowBright">No open PR found</Text>
          </Box>
        ) : (
          prs.map((pr, i) => {
            const isSel = i === selectedIdx;
            const isSyncing = syncingRepos.has(pr.repoName);
            const age = pr.createdAt ? formatAge(pr.createdAt) : '';
            const stateColor = pr.state === 'open' ? 'greenBright' : pr.state === 'merged' ? 'magentaBright' : 'redBright';

            const snCol = pad(String(i + 1), snW);
            const ageCol = pad(age, ageW);
            const numCol = pad(String(pr.number), numW);
            const repoCol = pad(truncate(pr.repoName, repoW), repoW);
            const stateCol = pad(pr.state, stateW);
            const aprvdCol = pad(pr.approved ? 'true' : 'false', aprvdW);
            const branchCol = pad(truncate(pr.sourceBranch, branchW), branchW);
            const authorCol = pad(truncate(pr.author, authorW), authorW);

            if (isSel) {
              return (
                <Box key={`${pr.repoName}-${pr.number}`} paddingLeft={indent} flexDirection="row" alignItems="flex-start">
                  <Text color="yellowBright" bold>{snCol}</Text>
                  <Text color="cyanBright">{sep}</Text>
                  <Box width={titleW} marginRight={0}>
                    <Text color="yellowBright" bold wrap="wrap">{isSyncing ? `${SPINNER[frame % SPINNER.length]} ` : ''}{pr.title}</Text>
                  </Box>
                  <Text color="cyanBright">{sep}</Text>
                  <Text color="white">{ageCol}</Text>
                  <Text color="cyanBright">{sep}</Text>
                  <Text color="yellowBright" bold>{numCol}</Text>
                  <Text color="cyanBright">{sep}</Text>
                  <Text color="magentaBright">{repoCol}</Text>
                  <Text color="cyanBright">{sep}</Text>
                  <Text color={stateColor as any}>{stateCol}</Text>
                  <Text color="cyanBright">{sep}</Text>
                  <Text color="yellowBright" bold>{aprvdCol}</Text>
                  <Text color="cyanBright">{sep}</Text>
                  <Text color="whiteBright">{branchCol}</Text>
                  <Text color="cyanBright">{sep}</Text>
                  <Text color="cyanBright">{authorCol}</Text>
                </Box>
              );
            }

            return (
              <Box key={`${pr.repoName}-${pr.number}`} paddingLeft={indent} flexDirection="row" alignItems="flex-start">
                <Text color="cyan">{snCol}</Text>
                <Text color="cyanBright">{sep}</Text>
                <Box width={titleW}>
                  <Text color="white" wrap="wrap">{isSyncing ? `${SPINNER[frame % SPINNER.length]} ` : ''}{pr.title}</Text>
                </Box>
                <Text color="cyanBright">{sep}</Text>
                <Text color="white">{ageCol}</Text>
                <Text color="cyanBright">{sep}</Text>
                <Text color="cyan">{numCol}</Text>
                <Text color="cyanBright">{sep}</Text>
                <Text color="magentaBright">{repoCol}</Text>
                <Text color="cyanBright">{sep}</Text>
                <Text color={stateColor as any}>{stateCol}</Text>
                <Text color="cyanBright">{sep}</Text>
                <Text color={pr.approved ? 'greenBright' : 'redBright'}>{aprvdCol}</Text>
                <Text color="cyanBright">{sep}</Text>
                <Text color="whiteBright">{branchCol}</Text>
                <Text color="cyanBright">{sep}</Text>
                <Text color="cyanBright">{authorCol}</Text>
              </Box>
            );
          })
        )}
      </Table>
    </Box>
  );
}

function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 0) return 'now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
