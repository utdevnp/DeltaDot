import React from 'react';
import { Box, Text } from 'ink';
import type { JiraIssue, PRDetail } from '../types.js';
import { SPINNER, pad } from '../utils.js';

export function JiraDescription({
  jira,
  descriptionScroll,
  collapsed,
  terminalHeight,
  width,
  pr,
  reviewTab,
  aiReviewLoading,
  aiReviewError,
  aiScroll,
}: {
  jira: JiraIssue | null;
  descriptionScroll: number;
  collapsed: boolean;
  terminalHeight: number;
  width: number;
  pr: PRDetail | null;
  reviewTab: 'jira' | 'ai';
  aiReviewLoading: boolean;
  aiReviewError: string;
  aiScroll: number;
}) {
  const tabW = Math.floor((width - 4) / 2);

  return (
    <Box flexDirection="column">
      {/* Tab bar */}
      <Box>
        <Box width={tabW} paddingLeft={1}>
          <Text bold color={reviewTab === 'jira' ? 'white' : 'dimColor'}>
            {reviewTab === 'jira' ? '■' : ' '}
            {' '}Jira Task
          </Text>
        </Box>
        <Box width={tabW}>
          <Text bold color={reviewTab === 'ai' ? 'white' : 'dimColor'}>
            {reviewTab === 'ai' ? '■' : ' '}
            {' '}AI Code Review
          </Text>
        </Box>
      </Box>

      {reviewTab === 'jira' ? (
        <JiraTabContent
          jira={jira}
          descriptionScroll={descriptionScroll}
          collapsed={collapsed}
          terminalHeight={terminalHeight}
          width={width}
        />
      ) : (
        <AITabContent
          pr={pr}
          loading={aiReviewLoading}
          error={aiReviewError}
          aiScroll={aiScroll}
          terminalHeight={terminalHeight}
          width={width}
        />
      )}
    </Box>
  );
}

function JiraTabContent({
  jira,
  descriptionScroll,
  collapsed,
  terminalHeight,
  width,
}: {
  jira: JiraIssue | null;
  descriptionScroll: number;
  collapsed: boolean;
  terminalHeight: number;
  width: number;
}) {
  const jiraDesc = (jira?.description || '').trim();
  const jiraLines = wrapText(jiraDesc || 'No Jira description available.', Math.max(20, width - 4));
  const jiraViewport = Math.max(6, terminalHeight - 18);
  const jiraMaxScroll = Math.max(0, jiraLines.length - jiraViewport);
  const clampedJiraScroll = Math.min(descriptionScroll, jiraMaxScroll);
  const visibleJiraLines = jiraLines.slice(clampedJiraScroll, clampedJiraScroll + jiraViewport);
  const showProgress = jiraLines.length > jiraViewport;
  const progressText = showProgress ? ` [${clampedJiraScroll + 1}/${jiraMaxScroll + 1}]` : '';
  const descTitle = collapsed ? '+Description' : `-Description${progressText}`;

  return (
    <>
      <Section title="Jira Task">
        {jira ? (
          <>
            <Field label="Summary:" value={jira.summary || 'n/a'} labelW={10} valueColor="whiteBright" />
            <Field label="Status:" value={jira.status || 'n/a'} labelW={10} valueColor="greenBright" />
            <Field label="Type:" value={jira.issueType || 'n/a'} labelW={10} valueColor="magentaBright" />
            <Field label="Assignee:" value={jira.assignee || 'unassigned'} labelW={10} valueColor="cyanBright" />
            <Field label="Reporter:" value={jira.reporter || 'unknown'} labelW={10} valueColor="cyanBright" />
            <Field label="URL:" value={jira.url || 'n/a'} labelW={10} valueColor="blueBright" wrap="truncate-end" />
          </>
        ) : (
          <Text dimColor>No Jira issue found or task provider is disabled.</Text>
        )}
      </Section>

      {jira ? (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text color="whiteBright" bold>{descTitle}</Text>
          </Box>
          {!collapsed && (
            <Box flexDirection="column">
              {visibleJiraLines.map((line, i) => (
                <Text key={`${clampedJiraScroll}-${i}`} color="white" wrap="wrap">{line || ' '}</Text>
              ))}
            </Box>
          )}
        </Box>
      ) : null}
    </>
  );
}

function AITabContent({
  pr,
  loading,
  error,
  aiScroll,
  terminalHeight,
  width,
}: {
  pr: PRDetail | null;
  loading: boolean;
  error: string;
  aiScroll: number;
  terminalHeight: number;
  width: number;
}) {
  if (loading) {
    const spin = SPINNER[0]!;
    return (
      <Box paddingTop={1}>
        <Text color="cyanBright">{spin}</Text>
        <Text>  </Text>
        <Text color="yellowBright">Generating AI review…</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box paddingTop={1}>
        <Text color="redBright">⚠ {error}</Text>
      </Box>
    );
  }

  const reviewText = pr?.aiReview;

  if (!reviewText) {
    return (
      <Box paddingTop={1}>
        <Text dimColor>Press 'r' to generate an AI code review.</Text>
      </Box>
    );
  }

  const lines = wrapText(reviewText, Math.max(20, width - 2));
  const viewport = Math.max(6, terminalHeight - 14);
  const maxScroll = Math.max(0, lines.length - viewport);
  const clampedScroll = Math.min(aiScroll, maxScroll);
  const visible = lines.slice(clampedScroll, clampedScroll + viewport);
  const showProgress = lines.length > viewport;
  const progressText = showProgress ? ` [${clampedScroll + 1}/${maxScroll + 1}]` : '';

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box>
        <Text color="whiteBright" bold>AI Code Review{progressText}</Text>
      </Box>
      <Box flexDirection="column">
        {visible.map((line, i) => (
          <Text key={`${clampedScroll}-${i}`} color="white" wrap="wrap">{line || ' '}</Text>
        ))}
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

function Field({
  label,
  value,
  labelW,
  valueColor = 'whiteBright',
  wrap = 'truncate-end',
}: {
  label: string;
  value: string;
  labelW: number;
  valueColor?: string;
  wrap?: 'wrap' | 'truncate-end' | 'truncate-middle' | 'truncate-start';
}) {
  return (
    <Box>
      <Text color="cyanBright" bold>{pad(label, labelW)}</Text>
      <Text color={valueColor} wrap={wrap}>{value}</Text>
    </Box>
  );
}

function wrapText(text: string, width: number): string[] {
  if (!text) return [];
  const out: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      out.push('');
      continue;
    }

    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      if (word.length > width) {
        if (line) {
          out.push(line);
          line = '';
        }
        let rest = word;
        while (rest.length > width) {
          out.push(rest.slice(0, width));
          rest = rest.slice(width);
        }
        line = rest;
        continue;
      }

      if (!line) {
        line = word;
      } else if ((line + ' ' + word).length <= width) {
        line += ` ${word}`;
      } else {
        out.push(line);
        line = word;
      }
    }

    if (line) out.push(line);
  }

  return out;
}
