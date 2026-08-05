import React from 'react';
import type { Workspace } from '../../core/types.js';

interface WelcomeScreenProps {
  workspaces: Workspace[];
  onSelectWorkspace: () => void;
  onSwitchWorkspace: (ws: Workspace) => void;
  onOpenConfig: () => void;
  statusMessage: string;
}

export function WelcomeScreen({ workspaces, onSelectWorkspace, onSwitchWorkspace, onOpenConfig, statusMessage }: WelcomeScreenProps) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 40,
      padding: 40,
    }}>
      {/* Logo + Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: 'linear-gradient(135deg, #58a6ff 0%, #39d2c0 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 700,
          color: '#0d1117',
          boxShadow: '0 8px 32px rgba(88, 166, 255, 0.2)',
        }}>
          D
        </div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#e6edf3', letterSpacing: '-0.5px' }}>
            DeltaDot
          </div>
          <div style={{ fontSize: 14, color: '#8b949e', marginTop: 4 }}>
            Git Workspace Sync Manager
          </div>
        </div>
      </div>

      {/* Status / Error message */}
      {statusMessage && (
        <div style={{
          padding: '10px 16px',
          borderRadius: 8,
          background: 'rgba(248, 81, 73, 0.1)',
          border: '1px solid rgba(248, 81, 73, 0.3)',
          color: '#f85149',
          fontSize: 13,
          maxWidth: 400,
          textAlign: 'center',
        }}>
          {statusMessage}
        </div>
      )}

      {/* Existing workspaces */}
      {workspaces.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#8b949e', fontWeight: 600 }}>Existing Workspaces</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => onSwitchWorkspace(ws)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: '#161b22',
                  border: '1px solid #30363d',
                  cursor: 'pointer',
                  color: '#e6edf3',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#58a6ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
              >
                <span style={{ fontWeight: 600 }}>{ws.name}</span>
                <span style={{ fontSize: 11, color: '#484f58' }}>{ws.path}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action Cards */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Select Workspace */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelectWorkspace();
          }}
          style={{
            width: 260,
            padding: '24px 20px',
            borderRadius: 12,
            background: '#161b22',
            border: '1px solid #30363d',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            textAlign: 'center',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            color: 'inherit',
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#58a6ff';
            (e.currentTarget as HTMLButtonElement).style.background = '#1c2333';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#30363d';
            (e.currentTarget as HTMLButtonElement).style.background = '#161b22';
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#e6edf3' }}>Select Workspace</div>
          <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5 }}>
            Choose a folder containing Git repositories to monitor and sync
          </div>
          <div style={{
            marginTop: 4,
            padding: '8px 24px',
            borderRadius: 8,
            background: '#238636',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
          }}>
            Browse Folders
          </div>
        </button>

        {/* Configure */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenConfig();
          }}
          style={{
            width: 260,
            padding: '24px 20px',
            borderRadius: 12,
            background: '#161b22',
            border: '1px solid #30363d',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            textAlign: 'center',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            color: 'inherit',
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#d29922';
            (e.currentTarget as HTMLButtonElement).style.background = '#1c2333';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#30363d';
            (e.currentTarget as HTMLButtonElement).style.background = '#161b22';
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d29922" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#e6edf3' }}>Configure Settings</div>
          <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5 }}>
            Set up branches, API tokens, and provider preferences
          </div>
          <div style={{
            marginTop: 4,
            padding: '8px 24px',
            borderRadius: 8,
            background: '#21262d',
            border: '1px solid #30363d',
            color: '#e6edf3',
            fontSize: 14,
            fontWeight: 600,
          }}>
            Open Config
          </div>
        </button>
      </div>

      {/* Keyboard hints */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#484f58', lineHeight: 1.6 }}>
          Press <span style={{ padding: '2px 6px', background: '#21262d', borderRadius: 4, border: '1px solid #30363d', fontFamily: 'SF Mono, monospace', fontSize: 12 }}>:</span> for commands
          {' '}·{' '}
          <span style={{ padding: '2px 6px', background: '#21262d', borderRadius: 4, border: '1px solid #30363d', fontFamily: 'SF Mono, monospace', fontSize: 12 }}>e</span> for settings
        </div>
      </div>
    </div>
  );
}
