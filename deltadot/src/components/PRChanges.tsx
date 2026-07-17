import React from 'react';
import { Box, Text } from 'ink';
import type { PRDetail, PRCommit, PRFile } from '../types.js';
import { pad, timeAgo } from '../utils.js';

export function PRChanges({
  pr,
  width,
  reviewFocus,
  reviewFileFocusIdx,
  reviewExpandedFiles,
  reviewFilesCollapsed,
}: {
  pr: PRDetail;
  width: number;
  reviewFocus: 'description' | 'files';
  reviewFileFocusIdx: number;
  reviewExpandedFiles: string[];
  reviewFilesCollapsed: boolean;
}) {
  const commits = [...(pr.commits ?? [])].sort((a, b) => dateValue(b.date) - dateValue(a.date));
  const commitSummary = `${pr.additions ?? 0} additions · ${pr.deletions ?? 0} deletions · ${pr.changedFiles ?? 0} files · ${pr.commitsCount ?? commits.length} commits`;

  const files = [...(pr.files ?? [])].sort((a, b) => a.path.localeCompare(b.path));
  const isFilesFocused = reviewFocus === 'files';

  const filesTitle = reviewFilesCollapsed
    ? `+Changed Files (${files.length})`
    : `-Changed Files (${files.length})`;

  const helpText = isFilesFocused && !reviewFilesCollapsed
    ? ' [a:expand all | A:collapse all | j/k:nav | ↵:toggle]'
    : '';

  return (
    <Box flexDirection="column">
      <Section title="PR Changes">
        <Text dimColor>{commitSummary}</Text>
        <Box marginTop={1}>
          <Text color="whiteBright">{`Source: ${pr.sourceBranch || 'n/a'} -> Target: ${pr.targetBranch || 'n/a'}`}</Text>
        </Box>
        <Box>
          <Text color="whiteBright">{`Author: ${pr.author || 'n/a'} · State: ${pr.state}`}</Text>
        </Box>
      </Section>

      <Section title={`Commits (${commits.length})`}>
        {commits.length > 0 ? commits.map((commit) => <CommitCard key={commit.hash + commit.date} commit={commit} width={width} />) : <EmptyState text="No commits" />}
      </Section>

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color="whiteBright" bold>{filesTitle}</Text>
          <Text dimColor>{helpText}</Text>
        </Box>

        {!reviewFilesCollapsed && (
          <Box flexDirection="column" marginTop={0}>
            {files.length > 0 ? (
              files.map((file, idx) => {
                const isSelected = isFilesFocused && idx === reviewFileFocusIdx;
                const isExpanded = reviewExpandedFiles.includes(file.path);
                const indicator = isExpanded ? '▼' : '▶';

                // Status formatting
                let statusChar = 'M';
                let statusColor = 'yellowBright';
                if (file.status === 'added') {
                  statusChar = 'A';
                  statusColor = 'greenBright';
                } else if (file.status === 'deleted') {
                  statusChar = 'D';
                  statusColor = 'redBright';
                } else if (file.status === 'renamed') {
                  statusChar = 'R';
                  statusColor = 'cyanBright';
                }

                // Row colors
                const rowColor = isSelected ? 'yellowBright' : 'white';
                const additionText = `+${file.additions}`;
                const deletionText = `-${file.deletions}`;

                // Render diff patch lines if expanded
                const diffLines = isExpanded && file.patch
                  ? file.patch.split('\n')
                  : [];

                return (
                  <Box key={file.path} flexDirection="column" marginBottom={0}>
                    <Box gap={1}>
                      <Text color={isSelected ? 'yellowBright' : 'dimColor'}>{indicator}</Text>
                      <Box width={Math.max(20, width - 24)}>
                        <Text color={rowColor} bold={isSelected} wrap="truncate-start">
                          {file.path}
                        </Text>
                      </Box>
                      <Text color="greenBright">{pad(additionText, 5)}</Text>
                      <Text color="redBright">{pad(deletionText, 5)}</Text>
                      <Text color={statusColor} bold>{statusChar}</Text>
                    </Box>

                    {isExpanded && (
                      <Box flexDirection="column" paddingLeft={2} marginTop={0} marginBottom={1}>
                        {diffLines.length > 0 ? (
                          diffLines.map((line, li) => {
                            let lineColor = 'white';
                            if (line.startsWith('+') && !line.startsWith('+++')) {
                              lineColor = 'green';
                            } else if (line.startsWith('-') && !line.startsWith('---')) {
                              lineColor = 'red';
                            } else if (line.startsWith('@@')) {
                              lineColor = 'cyanBright';
                            } else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- a/') || line.startsWith('+++ b/')) {
                              lineColor = 'dimColor';
                            }
                            return (
                              <Text key={`${file.path}-diff-${li}`} color={lineColor} wrap="wrap">
                                {line || ' '}
                              </Text>
                            );
                          })
                        ) : (
                          <Text dimColor>No diff content available</Text>
                        )}
                      </Box>
                    )}
                  </Box>
                );
              })
            ) : (
              <EmptyState text="No changed files" />
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" marginBottom={0}>
      <Box>
        <Text dimColor bold>{`── ${title}`}</Text>
      </Box>
      <Box flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}

function CommitCard({ commit, width }: { commit: PRCommit; width: number }) {
  const hashW = 8;
  const messageWidth = Math.max(16, width - hashW - 2);
  return (
    <Box flexDirection="column" marginBottom={0}>
      <Box>
        <Text color="yellowBright" bold>{pad(commit.hash, hashW)}</Text>
        <Text>  </Text>
        <Box width={messageWidth}>
          <Text color="white" wrap="wrap">{commit.message || '(empty)'}</Text>
        </Box>
      </Box>
      <Box paddingLeft={hashW + 2}>
        <Text dimColor>{`by ${commit.author}${commit.date ? ` · ${relativeTimeLabel(commit.date)}` : ''}`}</Text>
      </Box>
    </Box>
  );
}

function EmptyState({ text }: { text: string }) {
  return <Text dimColor>{text}</Text>;
}

function dateValue(dateStr: string): number {
  const value = new Date(dateStr).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function relativeTimeLabel(dateStr: string): string {
  const label = timeAgo(dateStr);
  return label === 'now' ? 'now' : `${label} ago`;
}
