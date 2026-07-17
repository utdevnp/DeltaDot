import React from 'react';
import { Box, Text } from 'ink';
import type { CommitDetail } from '../types.js';
import { SPINNER, pad } from '../utils.js';

export function DetailView({ detail, frame, width }: { detail: CommitDetail | null; frame: number; width: number }) {
  const indent = 3;
  if (!detail) {
    const spin = SPINNER[frame % SPINNER.length]!;
    return (
      <Box paddingLeft={indent} paddingTop={2} gap={2} height={1}>
        <Text color="cyanBright">{spin}</Text>
        <Text color="yellow">Loading commit detail…</Text>
      </Box>
    );
  }
  const labelW = 10;
  const statLines = detail.stat.split('\n').filter(Boolean);
  return (
    <Box flexDirection="column" paddingTop={0}>
      <Box paddingLeft={indent} paddingTop={1} height={1}>
        <Text color="cyanBright" bold>{pad('Hash:', labelW)}</Text>
        <Text color="yellowBright">{detail.hash}</Text>
      </Box>
      <Box paddingLeft={indent} height={1}>
        <Text color="cyanBright" bold>{pad('Author:', labelW)}</Text>
        <Text color="cyanBright">{detail.author}</Text>
      </Box>
      <Box paddingLeft={indent} height={1}>
        <Text color="cyanBright" bold>{pad('Date:', labelW)}</Text>
        <Text color="whiteBright">{detail.date}</Text>
      </Box>
      <Box paddingLeft={indent} paddingTop={1} height={1}>
        <Text color="whiteBright" bold>{detail.subject}</Text>
      </Box>
      {detail.body ? (
        <Box paddingLeft={indent} paddingTop={1} flexDirection="column">
          {detail.body.split('\n').map((line: string, i: number) => (
            <Box key={i} height={1}><Text color="white" wrap="wrap">{line}</Text></Box>
          ))}
        </Box>
      ) : null}
      {statLines.length > 0 && (
        <Box flexDirection="column" paddingTop={1}>
          <Box paddingLeft={indent} height={1}>
            <Text dimColor bold>{'── Changed Files'}</Text>
          </Box>
          {statLines.map((line: string, i: number) => {
            const parts = line.split(/(\+[\d,]+|-[\d,]+)/g);
            return (
              <Box key={i} paddingLeft={indent + 1} height={1}>
                {parts.map((part: string, j: number) =>
                  /^\+\d/.test(part) ? <Text key={j} color="greenBright" bold>{part}</Text>
                  : /^-\d/.test(part) ? <Text key={j} color="redBright" bold>{part}</Text>
                  : <Text key={j} color="whiteBright">{part}</Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
