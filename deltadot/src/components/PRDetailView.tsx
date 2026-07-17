import React from 'react';
import { Box, Text } from 'ink';
import type { PRComment, PRDetail, PRCommit } from '../types.js';
import { SPINNER, pad, timeAgo, truncate } from '../utils.js';

export function PRDetailView({
  pr,
  loading,
  error,
  frame,
  width,
  descriptionScroll,
}: {
  pr: PRDetail | null;
  loading: boolean;
  error: string;
  frame: number;
  width: number;
  descriptionScroll: number;
}) {
  const indent = 3;

  if (error) {
    return (
      <Box paddingLeft={indent} paddingTop={2} flexGrow={1}>
        <Text color="redBright">⚠ Error loading PR details: {error}</Text>
      </Box>
    );
  }

  if (loading || !pr) {
    const spin = SPINNER[frame % SPINNER.length]!;
    return (
      <Box paddingLeft={indent} paddingTop={2} flexGrow={1} flexDirection="column">
        <Box>
          <Text color="cyanBright">{spin}</Text>
          <Text>  </Text>
          <Text color="yellowBright">Syncing PR detail…</Text>
        </Box>
      </Box>
    );
  }

  const contentWidth = Math.max(60, width - indent * 2);
  const stacked = contentWidth < 110;
  const gap = 2;
  const leftWidth = stacked ? contentWidth : Math.floor(contentWidth * 0.4);
  const rightWidth = stacked ? contentWidth : contentWidth - leftWidth - gap;
  const columnGap = 1;
  const overviewWidth = stacked ? leftWidth : Math.max(18, Math.floor(leftWidth * 0.42));
  const metaWidth = stacked ? leftWidth : Math.max(14, Math.floor(leftWidth * 0.25));
  const reviewersWidth = stacked ? leftWidth : Math.max(16, leftWidth - overviewWidth - metaWidth - columnGap * 2);

  const stateColor = pr.state === 'open' ? 'greenBright' : pr.state === 'merged' ? 'magentaBright' : 'redBright';
  const commits = [...(pr.commits ?? [])].sort((a, b) => dateValue(b.date) - dateValue(a.date));
  const comments = [...(pr.comments ?? [])].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  const descriptionText = normalizeDescription(pr.description ?? '');
  const descriptionLines = wrapText(descriptionText, Math.max(20, leftWidth - 4));
  const descriptionWordCount = descriptionText.trim().split(/\s+/).filter(Boolean).length;
  const descriptionViewport = stacked ? 8 : 10;
  const descriptionMaxScroll = Math.max(0, descriptionLines.length - descriptionViewport);
  const clampedDescriptionScroll = Math.min(descriptionScroll, descriptionMaxScroll);
  const visibleDescriptionLines = descriptionLines.slice(clampedDescriptionScroll, clampedDescriptionScroll + descriptionViewport);

  const overviewFields = (labelW: number) => (
    <>
      <Field label="Repo:" value={pr.repoName ?? 'n/a'} labelW={labelW} valueColor="magentaBright" />
      <Field label="Author:" value={pr.author || 'n/a'} labelW={labelW} valueColor="cyanBright" />
      <Field label="State:" value={pr.state} labelW={labelW} valueColor={stateColor} />
      <Field label="Draft:" value={pr.draft ? 'yes' : 'no'} labelW={labelW} valueColor={pr.draft ? 'yellowBright' : 'whiteBright'} />
      <Field label="Source:" value={pr.sourceBranch || 'n/a'} labelW={labelW} valueColor="whiteBright" />
      <Field label="Target:" value={pr.targetBranch || 'n/a'} labelW={labelW} valueColor="whiteBright" />
      <Field label="Created:" value={formatDate(pr.createdAt)} labelW={labelW} valueColor="whiteBright" />
      <Field label="Updated:" value={formatDate(pr.updatedAt)} labelW={labelW} valueColor="whiteBright" />
    </>
  );

  const metaFields = (labelW: number) => (
    <>
      <ListField label="Labels:" values={pr.labels ?? []} labelW={labelW} valueColor="magentaBright" />
      <Field label="Merged by:" value={pr.mergedBy || (pr.state === 'merged' ? 'unknown' : 'not merged')} labelW={labelW} valueColor="whiteBright" />
      <Field label="Merged at:" value={pr.mergedAt ? formatDate(pr.mergedAt) : (pr.state === 'merged' ? 'unknown' : 'n/a')} labelW={labelW} valueColor="whiteBright" />
      <Field label="Merge sha:" value={pr.mergeCommitSha ? truncate(pr.mergeCommitSha, 12) : 'n/a'} labelW={labelW} valueColor="whiteBright" />
    </>
  );

  const reviewerFields = (labelW: number) => (
    <>
      <ListField label="Req:" values={pr.requestedReviewers ?? pr.reviewers ?? []} labelW={labelW} valueColor="whiteBright" />
      <ListField label="Appr:" values={pr.approvedBy ?? []} labelW={labelW} valueColor="greenBright" />
      <ListField label="Chg:" values={pr.changesRequestedBy ?? []} labelW={labelW} valueColor="redBright" />
      <ListField label="Cmt:" values={pr.commentedBy ?? []} labelW={labelW} valueColor="yellowBright" />
      <ListField label="Assg:" values={pr.assignees ?? []} labelW={labelW} valueColor="cyanBright" />
    </>
  );

  return (
    <Box flexDirection="column" paddingTop={0}>
      <Box paddingLeft={indent} paddingTop={1} flexDirection="column">
        <Box>
          <Text color="cyanBright" bold>{`PR #${pr.number}`}</Text>
          <Text>  </Text>
          <Text color={stateColor as any} bold>{pr.state}</Text>
          {pr.draft ? (
            <>
              <Text>  </Text>
              <Text color="yellowBright" bold>draft</Text>
            </>
          ) : null}
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
          {stacked ? (
            <>
              <Section title="Overview">{overviewFields(10)}</Section>
              <Section title="Meta">{metaFields(10)}</Section>
              <Section title="Reviewers">{reviewerFields(8)}</Section>
            </>
          ) : (
            <Box flexDirection="row">
              <Box width={overviewWidth} marginRight={columnGap} flexDirection="column">
                <Section title="Overview">{overviewFields(8)}</Section>
              </Box>
              <Box width={metaWidth} marginRight={columnGap} flexDirection="column">
                <Section title="Meta">{metaFields(10)}</Section>
              </Box>
              <Box width={reviewersWidth} flexDirection="column">
                <Section title="Reviewers">{reviewerFields(6)}</Section>
              </Box>
            </Box>
          )}

          <Box>
            <Field label="URL:" value={pr.url || 'n/a'} labelW={8} valueColor="blueBright" wrap="truncate-end" />
          </Box>

          <Box marginTop={1}>
            <Text dimColor bold>{'── Stats '}</Text>
            <Text color="greenBright" bold>{`+${pr.additions ?? 0}`}</Text>
            <Text>  </Text>
            <Text color="redBright" bold>{`-${pr.deletions ?? 0}`}</Text>
            <Text>  </Text>
            <Text color="whiteBright">{`${pr.changedFiles ?? 0} files`}</Text>
            <Text>  </Text>
            <Text color="whiteBright">{`${pr.commitsCount ?? pr.commits?.length ?? 0} commits`}</Text>
            <Text>  </Text>
            <Text color="whiteBright">{`${pr.commentsCount ?? 0} comments`}</Text>
            <Text>  </Text>
            <Text color="whiteBright">{`${pr.reviewCommentsCount ?? 0} review comments`}</Text>
          </Box>

          {descriptionText ? (
            <Section title={descriptionWordCount > 500 ? `Description [${clampedDescriptionScroll + 1}/${descriptionMaxScroll + 1}]` : 'Description'}>
              <Box flexDirection="column" height={descriptionViewport}>
                {visibleDescriptionLines.length > 0 ? visibleDescriptionLines.map((line, i) => (
                  <Text key={`${clampedDescriptionScroll}-${i}`} color="white" wrap="truncate-end">{line}</Text>
                )) : <Text color="white"> </Text>}
              </Box>
            </Section>
          ) : null}
        </Box>

        <Box width={rightWidth} flexDirection="column">
          <Section title={`Commits (${commits.length})`}>
            {commits.length > 0 ? commits.map((commit) => <CommitCard key={commit.hash + commit.date} commit={commit} width={rightWidth} />) : <EmptyState text="No commits" />}
          </Section>

          <Section title={`Comments (${comments.length})`}>
            {comments.length > 0 ? comments.map((comment) => <CommentCard key={comment.id} comment={comment} width={rightWidth} />) : <EmptyState text="No comments" />}
          </Section>
        </Box>
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
  valueColor?: any;
  wrap?: 'wrap' | 'truncate-end' | 'truncate-middle' | 'truncate-start';
}) {
  return (
    <Box>
      <Text color="cyanBright" bold>{pad(label, labelW)}</Text>
      <Text color={valueColor} wrap={wrap}>{value}</Text>
    </Box>
  );
}

function ListField({
  label,
  values,
  labelW,
  valueColor = 'whiteBright',
}: {
  label: string;
  values: string[];
  labelW: number;
  valueColor?: any;
}) {
  return <Field label={label} value={values.length > 0 ? values.join(', ') : 'none'} labelW={labelW} valueColor={valueColor} />;
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

function CommentCard({ comment, width }: { comment: PRComment; width: number }) {
  const label = comment.type === 'pending' ? 'pending' : comment.type === 'review' ? 'review' : 'comment';
  const labelColor = comment.type === 'pending' ? 'yellowBright' : comment.type === 'review' ? 'magentaBright' : 'cyanBright';
  const labelW = 8;
  const contentWidth = Math.max(16, width - labelW - 2);
  const commentLines = wrapText(comment.body || '(empty)', contentWidth);
  const firstLine = commentLines[0] ?? '(empty)';
  const remainingLines = commentLines.slice(1);
  return (
    <Box marginBottom={0}>
      <Box flexDirection="column">
        <Box>
          <Text color={labelColor as any} bold>{pad(label, labelW)}</Text>
          <Text color="white" wrap="wrap">{firstLine}</Text>
        </Box>
        {remainingLines.map((line, i) => (
          <Box key={`cmt-wrap-${comment.id}-${i}`} paddingLeft={labelW}>
            <Text>{'  '}</Text>
            <Text color="white" wrap="wrap">{line}</Text>
          </Box>
        ))}
        {comment.path ? (
          <Box paddingLeft={labelW}>
            <Text>{'  '}</Text>
            <Text dimColor wrap="truncate-end">{comment.path}</Text>
          </Box>
        ) : null}
        <Box paddingLeft={labelW}>
          <Text>{'  '}</Text>
          <Text dimColor>{relativeTimeLabel(comment.createdAt)}</Text>
        </Box>
      </Box>
    </Box>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Text dimColor>{text}</Text>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function relativeTimeLabel(dateStr: string): string {
  if (!dateStr) return '';
  const label = timeAgo(dateStr);
  return label === 'now' ? 'now' : `${label} ago`;
}

function normalizeDescription(text: string): string {
  if (!text) return '';

  let out = text.replace(/\r\n/g, '\n');
  if (looksLikeHtml(out)) {
    out = out
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|section|article|header|footer|tr|ul|ol|li|blockquote|pre|h[1-6])\s*>/gi, '\n')
      .replace(/<\s*(p|div|section|article|header|footer|tr|ul|ol|li|blockquote|pre|h[1-6])[^>]*>/gi, '')
      .replace(/<\s*li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '');
  }

  return decodeHtmlEntities(out)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeHtml(text: string): boolean {
  return /<[^>]+>/.test(text);
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
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

function dateValue(dateStr: string): number {
  const value = new Date(dateStr).getTime();
  return Number.isNaN(value) ? 0 : value;
}
