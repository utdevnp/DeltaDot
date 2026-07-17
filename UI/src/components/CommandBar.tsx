import React from 'react';

interface CommandBarProps {
  mode: 'search' | 'command';
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onSubmit: (v: string) => void;
}

const COMMANDS = ['q', 'quit', 'exit', 'config', 'settings', 'sync', 'prs'];

export function CommandBar({ mode, value, onChange, onClose, onSubmit }: CommandBarProps) {
  const filteredCommands = mode === 'command'
    ? COMMANDS.filter((c) => c.startsWith(value.toLowerCase()))
    : [];

  return (
    <div className="command-overlay" onClick={onClose}>
      <div className="command-bar" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type="text"
          placeholder={mode === 'search' ? 'Search repos...' : 'Type command...'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter') {
              if (mode === 'command' && filteredCommands.length > 0) {
                onSubmit(filteredCommands[0]);
              } else {
                onSubmit(value);
              }
            }
          }}
        />
        {filteredCommands.length > 0 && (
          <div className="command-hints">
            {filteredCommands.map((cmd) => (
              <div key={cmd} className="command-hint active" onClick={() => onSubmit(cmd)}>
                :{cmd}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
