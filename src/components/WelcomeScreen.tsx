import React from 'react';
import type { Workspace } from '../../core/types.js';

interface WelcomeScreenProps {
  workspaces: Workspace[];
  onSelectWorkspace: () => void;
  onSwitchWorkspace: (ws: Workspace) => void;
  onOpenConfig: () => void;
  statusMessage: string;
  statusTone?: 'success' | 'error' | 'warning';
}

export function WelcomeScreen({ workspaces, onSelectWorkspace, onSwitchWorkspace, onOpenConfig, statusMessage, statusTone = 'error' }: WelcomeScreenProps) {
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
          background: 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-cyan) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--bg-primary)',
          boxShadow: '0 8px 32px var(--glow-blue)',
        }}>
          D
        </div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            DeltaDot
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
            Git Workspace Sync Manager
          </div>
        </div>
      </div>

      {/* Status / Error message */}
      {statusMessage && (
        <div style={{
          padding: '10px 16px',
          borderRadius: 8,
          background: statusTone === 'error' ? 'var(--tint-red)' : statusTone === 'warning' ? 'var(--tint-yellow)' : 'var(--tint-green)',
          border: statusTone === 'error' ? '1px solid var(--border-red)' : statusTone === 'warning' ? '1px solid var(--border-yellow)' : '1px solid var(--border-green)',
          color: statusTone === 'error' ? 'var(--accent-red)' : statusTone === 'warning' ? 'var(--accent-yellow)' : 'var(--accent-green)',
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
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Existing Workspaces</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => onSwitchWorkspace(ws)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-blue)';
                  e.currentTarget.style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }}
              >
                <span style={{ fontWeight: 600 }}>{ws.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{ws.path}</span>
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
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            textAlign: 'center',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            color: 'inherit',
            transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)';
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px var(--glow-blue)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-secondary)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Select Workspace</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Choose a folder containing Git repositories to monitor and sync
          </div>
          <div style={{
            marginTop: 4,
            padding: '8px 24px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, var(--btn-green-dark), var(--btn-green))',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 4px 14px color-mix(in srgb, var(--btn-green) 35%, transparent)',
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
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            textAlign: 'center',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            color: 'inherit',
            transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-yellow)';
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px color-mix(in srgb, var(--accent-yellow) 25%, transparent)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-secondary)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent-yellow)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Configure Settings</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Set up branches, API tokens, and provider preferences
          </div>
          <div style={{
            marginTop: 4,
            padding: '8px 24px',
            borderRadius: 8,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-primary)',
            fontSize: 14,
            fontWeight: 600,
          }}>
            Open Config
          </div>
        </button>
      </div>

      {/* Keyboard hints */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Press <span style={{ padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, border: '1px solid var(--border-strong)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>:</span> for commands
          {' '}·{' '}
          <span style={{ padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, border: '1px solid var(--border-strong)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>e</span> for settings
        </div>
      </div>
    </div>
  );
}
