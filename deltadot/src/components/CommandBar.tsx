import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { InputMode } from '../types.js';

export function CommandBar({ mode, query, onChange, onSubmit, onCancel, width }: {
  mode: InputMode; query: string; onChange: (v: string) => void; onSubmit: () => void; onCancel: () => void; width: number;
}) {
  const prefix = mode === 'command' ? ':' : '/';
  return (
    <Box width={width} height={3} minHeight={3}>
      <Box flexGrow={1} borderStyle="single" borderColor="dimColor" paddingLeft={1} height={3} minHeight={3}>
        <Text color="cyanBright" bold>{prefix}</Text>
        <TextInput
          value={query}
          onChange={onChange}
          onSubmit={onSubmit}
          focus={true}
        />
        {!query && mode === 'search' && <Text color="white">type to filter, Esc to clear</Text>}
      </Box>
    </Box>
  );
}
