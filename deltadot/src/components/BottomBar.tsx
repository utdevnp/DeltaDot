import React from 'react';
import { Box, Text } from 'ink';
import type { View } from '../types.js';

export function BottomBar({ view, syncingCount, browserError, showBranch, width }: {
  view: View; syncingCount: number; browserError: string; showBranch: boolean; width: number;
}) {
  const modeLabel = view === 'list' ? 'REPO' : view === 'commits' ? 'COMMITS' : view === 'detail' ? 'DETAIL' : view === 'prs' ? 'PR' : view === 'prdetail' ? 'PR' : view === 'review' ? 'REVIEW' : 'CONFIG';

  const binds: [string, string][] =
    view === 'list'    ? [['↑↓/j:k', 'nav'], ['g/G', 'top/bot'], [':', 'cmd'], ['/', 'filter'], ['↵', 'open'], ['P', 'PR'], ['o', 'PR'], ['s', 'sync'], ['S', 'sync all'], ['b', showBranch ? 'hide br' : 'branch'], ['e', 'cfg'], ['q', 'quit']]
    : view === 'commits' ? [['↑↓/j:k', 'nav'], [':', 'cmd'], ['↵', 'detail'], ['o', 'browse'], ['s', 'sync'], ['b/Esc', 'back'], ['q', 'quit']]
    : view === 'detail'  ? [[':', 'cmd'], ['b/Esc', 'back'], ['q', 'quit']]
    : view === 'prs' ? [['↑↓/j:k', 'nav'], [':', 'cmd'], ['↵', 'detail'], ['R', 'review'], ['o', 'browse'], ['S', 'sync'], ['b/Esc', 'back'], ['q', 'quit']]
    : view === 'prdetail' ? [[':', 'cmd'], ['R', 'review'], ['o', 'browse'], ['b/Esc', 'back'], ['q', 'quit']]
    : view === 'review' ? [[':', 'cmd'], ['Tab', 'focus panes'], ['t', 'tab'], ['r', 'ai review'], ['j/k', 'scroll'], ['d/↵', 'toggle desc'], ['o', 'browse'], ['b/Esc', 'back'], ['q', 'quit']]
    : view === 'config' ? [['Tab', 'next'], ['↑↓', 'move'], ['↵', 'save'], ['Esc', 'cancel'], ['q', 'quit']]
    : [];

  return (
    <Box width={width} height={1} minHeight={1} paddingLeft={3} paddingRight={2} gap={3}>
      <Text color="blueBright" bold>{modeLabel}</Text>
      <Text color="dimColor">│</Text>
      {binds.map(([key, label]) => (
        <Box key={key} gap={1}>
          <Text color="cyanBright" bold>{key}</Text>
          <Text color="white">{label}</Text>
        </Box>
      ))}
      {browserError && (
        <>
          <Text color="dimColor">│</Text>
          <Text color="redBright">! {browserError}</Text>
        </>
      )}
      {syncingCount > 0 && !browserError && (
        <>
          <Text color="dimColor">│</Text>
          <Text color="yellowBright">syncing {syncingCount} repo(s)</Text>
        </>
      )}
    </Box>
  );
}
