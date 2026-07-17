import React from 'react';
import { Box, Text } from 'ink';
import { pad } from '../utils.js';

const INDENT = 3;
const SEP = ' │ ';

export interface ColDef {
  label: string;
  width: number;
}

export function Table({ columns, width, children }: {
  columns: ColDef[];
  width: number;
  children: React.ReactNode;
}) {
  const line = columns.map(c => pad(c.label, c.width)).join(SEP);
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingLeft={INDENT} height={1}>
        <Text color="whiteBright" bold>{line}</Text>
      </Box>
      <Box height={1}>
        <Text dimColor>{'─'.repeat(width)}</Text>
      </Box>
      {children}
    </Box>
  );
}
