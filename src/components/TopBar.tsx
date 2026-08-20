import React from 'react';
import { SPINNER } from '../../core/utils.js';
import { timeAgo } from '../../core/utils.js';
import type { ThemeMode } from '../../core/types.js';

interface TopBarProps {
  workspacePath: string;
  base: string;
  release: string;
  repoCount: number;
  isSyncing: boolean;
  syncProgress: { done: number; total: number };
  lastSync: string;
  currentView: 'list' | 'prs' | 'k8s';
  onSyncAll: () => void;
  onSelectWorkspace: () => void;
  onOpenConfig: () => void;
  onChangeView: (view: 'list' | 'prs' | 'k8s') => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

function truncatePath(p: string): string {
  try {
    const home = (window as any).api?.homeDir || '';
    if (home && p.startsWith(home)) return '~' + p.slice(home.length);
  } catch {}
  return p;
}

export function TopBar({ workspacePath, base, release, repoCount, isSyncing, syncProgress, lastSync, currentView, onSyncAll, onSelectWorkspace, onOpenConfig, onChangeView, theme, onToggleTheme }: TopBarProps) {
  const frame = Math.floor(Date.now() / 120) % SPINNER.length;
  const spinner = SPINNER[frame] ?? '?';

  return (
    <div className="top-bar">
      <div className="app-title">
        <span className="dot">■</span>
        <span>DeltaDot</span>
      </div>
      <span className="separator">│</span>
      <div className="info-group">
        <span className="label">path</span>
        <span
          className="value"
          title={workspacePath}
          onClick={onSelectWorkspace}
          style={{ cursor: 'pointer', borderBottom: '1px dashed var(--text-dim)' }}
        >{truncatePath(workspacePath)}</span>
      </div>
      <span className="separator">│</span>
      <div className="info-group">
        <span className="value">{base}</span>
        <span className="arrow">←</span>
        <span className="value">{release}</span>
      </div>
      <span className="separator">│</span>
      <div className="info-group">
        <span className="value">{repoCount} {repoCount === 1 ? 'repo' : 'repos'}</span>
      </div>
      <div className="info-group">
        <select
          value={currentView}
          onChange={(e) => onChangeView(e.target.value as 'list' | 'prs' | 'k8s')}
          style={{
            padding: '2px 6px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            color: 'var(--text-primary)',
            fontSize: 12,
            fontFamily: 'inherit',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="list">Repos</option>
          <option value="prs">Pull Requests</option>
          <option value="k8s">Kubernetes</option>
        </select>
      </div>
      <div className={`sync-status ${isSyncing ? 'syncing' : lastSync ? 'synced' : ''}`}>
        {isSyncing ? (
          <>{spinner} syncing {syncProgress.done}/{syncProgress.total}</>
        ) : lastSync ? (
          <>✓ synced {timeAgo(lastSync)} ago</>
        ) : null}
        <span
          onClick={onToggleTheme}
          style={{
            marginLeft: 12,
            padding: '4px 7px',
            borderRadius: 4,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
            color: 'var(--text-secondary)',
          }}
          title={`Theme: ${theme}`}
        >
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          ) : theme === 'light' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          )}
        </span>
        <span
          onClick={onOpenConfig}
          style={{
            marginLeft: 4,
            padding: '4px 7px',
            borderRadius: 4,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
            color: 'var(--text-secondary)',
          }}
          title="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </span>
      </div>
    </div>
  );
}
