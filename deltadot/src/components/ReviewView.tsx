import React from 'react';
import { Box, Text } from 'ink';
import type { PRDetail, JiraIssue } from '../types.js';
import { SPINNER } from '../utils.js';
import { JiraDescription } from './JiraDescription.js';
import { PRChanges } from './PRChanges.js';

export function ReviewView({
  pr,
  jira,
  loading,
  error,
  frame,
  width,
  descriptionScroll,
  collapsed,
  terminalHeight,
  reviewFocus,
  reviewFileFocusIdx,
  reviewExpandedFiles,
  reviewFilesCollapsed,
  reviewTab,
  aiReviewLoading,
  aiReviewError,
  aiScroll,
}: {
  pr: PRDetail | null;
  jira: JiraIssue | null;
  loading: boolean;
  error: string;
  frame: number;
  width: number;
  descriptionScroll: number;
  collapsed: boolean;
  terminalHeight: number;
  reviewFocus: 'description' | 'files';
  reviewFileFocusIdx: number;
  reviewExpandedFiles: string[];
  reviewFilesCollapsed: boolean;
  reviewTab: 'jira' | 'ai';
  aiReviewLoading: boolean;
  aiReviewError: string;
  aiScroll: number;
}) {
  const indent = 3;

  if (!pr) {
    if (error) {
      return (
        <Box paddingLeft={indent} paddingTop={2} flexGrow={1}>
          <Text color="redBright">⚠ Review error: {error}</Text>
        </Box>
      );
    }
    const spin = SPINNER[frame % SPINNER.length]!;
    return (
      <Box paddingLeft={indent} paddingTop={2} flexGrow={1} flexDirection="column">
        <Box>
          <Text color="cyanBright">{spin}</Text>
          <Text>  </Text>
          <Text color="yellowBright">Loading review view…</Text>
        </Box>
      </Box>
    );
  }

  if (loading) {
    const spin = SPINNER[frame % SPINNER.length]!;
    return (
      <Box paddingLeft={indent} paddingTop={2} flexGrow={1} flexDirection="column">
        <Box>
          <Text color="cyanBright">{spin}</Text>
          <Text>  </Text>
          <Text color="yellowBright">Loading review view…</Text>
        </Box>
      </Box>
    );
  }

  const contentWidth = Math.max(60, width - indent * 2);
  const stacked = contentWidth < 110;
  const gap = 2;
  const leftWidth = stacked ? contentWidth : Math.floor(contentWidth * 0.45);
  const rightWidth = stacked ? contentWidth : contentWidth - leftWidth - gap;

  return (
    <Box flexDirection="column">
      {error ? (
        <Box paddingLeft={indent} paddingTop={1}>
          <Text color="redBright">⚠ Review error: {error}</Text>
        </Box>
      ) : null}
      <Box paddingLeft={indent} paddingTop={1} flexDirection="column">
        <Box>
          <Text color="cyanBright" bold>{`Review #${pr.number}`}</Text>
          <Text>  </Text>
          <Text color="whiteBright" bold wrap="wrap">{jira?.key ?? 'no jira key found'}</Text>
        </Box>
        <Box>
          <Text color="whiteBright" bold wrap="wrap">{pr.title || '(no title)'}</Text>
        </Box>
      </Box>

      <Box paddingLeft={indent} height={1}>
        <Text dimColor>{'─'.repeat(Math.max(10, width - indent * 2))}</Text>
      </Box>

      <Box paddingLeft={indent} flexDirection={stacked ? 'column' : 'row'}>
        <Box width={leftWidth} marginRight={stacked ? 0 : gap} flexDirection="column">
          <JiraDescription
            jira={jira}
            descriptionScroll={descriptionScroll}
            collapsed={collapsed}
            terminalHeight={terminalHeight}
            width={leftWidth}
            pr={pr}
            reviewTab={reviewTab}
            aiReviewLoading={aiReviewLoading}
            aiReviewError={aiReviewError}
            aiScroll={aiScroll}
          />
        </Box>

        <Box width={rightWidth} flexDirection="column">
          <PRChanges
            pr={pr}
            width={rightWidth}
            reviewFocus={reviewFocus}
            reviewFileFocusIdx={reviewFileFocusIdx}
            reviewExpandedFiles={reviewExpandedFiles}
            reviewFilesCollapsed={reviewFilesCollapsed}
          />
        </Box>
      </Box>
    </Box>
  );
}
