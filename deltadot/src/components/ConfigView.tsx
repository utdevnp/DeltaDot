import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { CONFIG_LABELS } from '../types.js';
import type { AppConfig, ConfigField } from '../types.js';
import { pad } from '../utils.js';

export function ConfigView({
  draft, focusedField, validationError, width,
  onChange, onSave, onCancel,
}: {
  draft: Record<ConfigField, string>;
  focusedField: ConfigField;
  validationError: string;
  width: number;
  onChange: (field: ConfigField, val: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const indent = 3;
  const labelW = 22;
  const taskProvider = (draft.taskProvider || 'none') as AppConfig['taskProvider'];
  const aiProvider = (draft.aiProvider || 'none') as AppConfig['aiProvider'];

  const renderField = (field: ConfigField, labelWidth = labelW) => {
    const isFocused = field === focusedField;
    return (
      <Box key={field} paddingLeft={indent} height={1} minHeight={1} marginTop={1}>
        <Text color={isFocused ? 'cyanBright' : 'white'} bold wrap="truncate-end">
          {isFocused ? '▸ ' : '  '}{pad(CONFIG_LABELS[field], labelWidth)}:
        </Text>
        {isFocused ? (
          <Box flexGrow={1} paddingLeft={1}>
            <TextInput
              value={draft[field]}
              onChange={(val) => onChange(field, val)}
              onSubmit={onSave}
              focus={true}
            />
          </Box>
        ) : (
          <Text color="whiteBright" wrap="truncate-end"> {draft[field]}</Text>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" width={width} paddingBottom={1}>
      <Box paddingLeft={indent} height={1} minHeight={1}>
        <Text color="whiteBright" bold>Edit Configuration</Text>
      </Box>
      <Box height={1}>
        <Text dimColor>{'─'.repeat(width)}</Text>
      </Box>
      <Box paddingLeft={indent} marginTop={1}>
        <Text color="whiteBright" bold>Workspace &amp; Sync</Text>
      </Box>
      {(['workspace', 'base', 'release', 'syncInterval'] as ConfigField[]).map((field) => renderField(field))}

      <Box paddingLeft={indent} marginTop={1}>
        <Text color="whiteBright" bold>Git API Config</Text>
      </Box>
      {(['token', 'provider'] as ConfigField[]).map((field) => renderField(field))}

      <Box paddingLeft={indent} marginTop={1}>
        <Text color="whiteBright" bold>Issue / Task Providers</Text>
      </Box>
      {renderField('taskProvider')}
      {taskProvider === 'jira' && (
        <>
          {renderField('jiraUrl', 16)}
          {renderField('jiraEmail', 16)}
          {renderField('jiraApiToken', 16)}
        </>
      )}
      <Box paddingLeft={indent} marginTop={1}>
        <Text color="whiteBright" bold>AI Code Review</Text>
      </Box>
      {renderField('aiProvider')}
      {aiProvider !== 'none' && (
        <>
          {renderField('aiApiKey', 16)}
          {renderField('aiApiUrl', 16)}
          {renderField('aiModel', 16)}
          {renderField('aiSystemPrompt', 16)}
        </>
      )}
      {validationError && (
        <Box marginTop={1} paddingLeft={indent}>
          <Text color="redBright" bold>⚠  {validationError}</Text>
        </Box>
      )}
    </Box>
  );
}
