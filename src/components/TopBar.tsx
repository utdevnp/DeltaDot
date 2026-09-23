import React, { useEffect, useState } from 'react';
import { SPINNER } from '../../core/utils.js';
import { timeAgo } from '../../core/utils.js';
import type { ThemeMode, Workspace } from '../../core/types.js';

interface TopBarProps {
  workspacePath: string;
  base: string;
  release: string;
  repoCount: number;
  isSyncing: boolean;
  syncProgress: { done: number; total: number };
  lastSync: string;
  onEditWorkspace: () => void;
  onOpenConfig: () => void;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSwitchWorkspace: (workspace: Workspace) => void;
  onAddWorkspace: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

function folderName(p: string): string {
  const normalized = p.replace(/[\\/]+$/, '');
  return normalized.split(/[\\/]/).pop() || normalized;
}

export function TopBar({ workspacePath, base, release, repoCount, isSyncing, syncProgress, lastSync, onEditWorkspace, onOpenConfig, workspaces, activeWorkspaceId, onSwitchWorkspace, onAddWorkspace, theme, onToggleTheme }: TopBarProps) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [appInfo, setAppInfo] = useState<{ version: string; name: string } | null>(null);
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const activeWorkspaceName = activeWorkspace?.displayName || activeWorkspace?.name || folderName(workspacePath);
  const frame = Math.floor(Date.now() / 120) % SPINNER.length;
  const spinner = SPINNER[frame] ?? '?';

  useEffect(() => {
    window.api.getAppInfo().then(setAppInfo).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!aboutOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAboutOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aboutOpen]);

  return (
    <div className="top-bar">
      <div className="app-title">
        <span className="dot" aria-hidden="true" />
        <span>DeltaDot</span>
      </div>
      <span className="separator">│</span>
      <div className="workspace-switcher">
        <div className="workspace-switcher-heading">
          <span className="workspace-switcher-label">Workspace</span>
          {workspaces.length > 0 && <span className="workspace-switcher-count">{workspaces.length}</span>}
        </div>
        <div className="workspace-select-shell">
          <span className="workspace-select-copy">
            <span className="workspace-select-name">{activeWorkspaceName}</span>
          </span>
          <svg className="workspace-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
          <select
            aria-label="Active workspace"
            value={activeWorkspaceId ?? ''}
            onChange={(e) => {
              const workspace = workspaces.find((item) => item.id === e.target.value);
              if (workspace) onSwitchWorkspace(workspace);
            }}
          >
            {workspaces.length === 0 && <option value="">{folderName(workspacePath)}</option>}
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.displayName || workspace.name}</option>)}
          </select>
        </div>
        <button type="button" className="workspace-action-button" onClick={onEditWorkspace} aria-label="Edit workspace" title="Edit workspace">✎</button>
        <button type="button" className="workspace-add-button" onClick={onAddWorkspace} aria-label="Add workspace" title="Add workspace">+</button>
      </div>
      <span className="separator">│</span>
      <div className="diff-scope" title="Commits on release not in base">
        <span className="diff-scope-label">DIFF SCOPE</span>
        <span className="value">{release}</span>
        <span className="arrow">→</span>
        <span className="value">{base}</span>
      </div>
      <span className="separator">│</span>
      <div className="info-group">
        <span className="value">{repoCount} {repoCount === 1 ? 'repo' : 'repos'}</span>
      </div>
      <div className={`sync-status ${isSyncing ? 'syncing' : lastSync ? 'synced' : ''}`}>
        {isSyncing ? (
          <>{spinner} syncing {syncProgress.done}/{syncProgress.total}</>
        ) : lastSync ? (
          <>✓ synced {timeAgo(lastSync)} ago</>
        ) : null}
        <span
          onClick={onToggleTheme}
          className="icon-action"
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
        <button
          type="button"
          onClick={onOpenConfig}
          className="icon-action"
          aria-label="Settings"
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
        </button>
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className="icon-action"
          aria-label="About DeltaDot"
          title="About DeltaDot"
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
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 8h.01" />
          </svg>
        </button>
      </div>
      {aboutOpen && (
        <>
          <button type="button" className="about-drawer-backdrop" aria-label="Close About drawer" onClick={() => setAboutOpen(false)} />
          <aside className="about-drawer" aria-label="About DeltaDot">
            <div className="about-drawer-header">
              <div>
                <div className="about-drawer-eyebrow">About</div>
                <h2>DeltaDot</h2>
              </div>
              <button type="button" className="about-drawer-close" onClick={() => setAboutOpen(false)} aria-label="Close About drawer">×</button>
            </div>
            <div className="about-drawer-body">
              <div className="about-app-mark" aria-hidden="true"><span className="dot" /></div>
              <p className="about-description">Git workspace sync checker for comparing branches, reviewing pull requests, and keeping repository status in one place.</p>
              <div className="about-detail-row"><span>Version</span><strong>{appInfo?.version ? `v${appInfo.version.replace(/^v/, '')}` : 'Loading…'}</strong></div>
              <div className="about-detail-row"><span>Developer</span><strong>Ut Dev</strong></div>
              <div className="about-detail-row"><span>Role</span><strong>Web Developer</strong></div>
              <div className="about-detail-row"><span>Product</span><strong>DeltaDot</strong></div>
              <button type="button" className="about-profile-link" onClick={() => window.api.openUrl('https://github.com/utdevnp')}>View GitHub profile ↗</button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
