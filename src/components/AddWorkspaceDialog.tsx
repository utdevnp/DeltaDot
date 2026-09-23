import React, { useState } from 'react';
import type { Workspace } from '../../core/types.js';
import { WORKSPACE_COLORS } from '../../core/types.js';

interface AddWorkspaceDialogProps {
  editWorkspace?: Workspace;
  onSave?: (name: string, folder: string, base: string, release: string, syncInterval: number, color: string) => void;
  onEditSave?: (id: string, name: string, folder: string, base: string, release: string, syncInterval: number, color: string) => void;
  onClose: () => void;
  onBrowse: () => Promise<string | null>;
  defaultBase?: string;
  defaultRelease?: string;
  defaultSyncInterval?: number;
}

export function AddWorkspaceDialog({
  editWorkspace, onSave, onEditSave, onClose, onBrowse,
  defaultBase = 'main', defaultRelease = 'R10', defaultSyncInterval = 10,
}: AddWorkspaceDialogProps) {
  const isEdit = !!editWorkspace;
  const [folder, setFolder] = useState(editWorkspace?.path ?? '');
  const [name, setName] = useState(editWorkspace?.displayName ?? editWorkspace?.name ?? '');
  const [base, setBase] = useState(editWorkspace?.config?.base ?? defaultBase);
  const [release, setRelease] = useState(editWorkspace?.config?.release ?? defaultRelease);
  const [syncInterval, setSyncInterval] = useState(String(editWorkspace?.config?.syncInterval ?? defaultSyncInterval));
  const [color, setColor] = useState(editWorkspace?.color ?? WORKSPACE_COLORS[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit && onEditSave) {
      onEditSave(
        editWorkspace!.id,
        name.trim() || editWorkspace!.name,
        folder.trim() || editWorkspace!.path,
        base.trim(),
        release.trim(),
        Math.max(1, parseFloat(syncInterval) || 10),
        color,
      );
    } else if (!isEdit && onSave) {
      if (!folder.trim()) return;
      onSave(name.trim() || folder.trim().split(/[\\/]/).pop() || 'Workspace', folder.trim(), base.trim(), release.trim(), Math.max(1, parseFloat(syncInterval) || 10), color);
    }
  };

  return (
    <div className="command-overlay workspace-dialog-overlay" onClick={onClose}>
      <div
        className="workspace-dialog"
        style={{
          width: 840,
          maxWidth: '90vw',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-pop)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="workspace-dialog-header" style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div className="workspace-dialog-eyebrow">{isEdit ? 'WORKSPACE SETTINGS' : 'NEW WORKSPACE'}</div>
          <h2 style={{ fontSize: 22, fontWeight: 650, color: 'var(--text-primary)', margin: 0 }}>
            {isEdit ? 'Edit Workspace' : 'Create Workspace'}
          </h2>
          <p className="workspace-dialog-description">
            {isEdit ? 'Update how DeltaDot compares branches and keeps this workspace in sync.' : 'Define how DeltaDot compares branches and keeps your workspace in sync.'}
          </p>
        </div>

        {/* Form */}
        <form className="workspace-dialog-form" onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Workspace path */}
          <div className="config-field workspace-form-row">
            <label>Workspace name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My workspace"
              style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
            />
            <small>Choose a clear, descriptive name for this workspace.</small>
          </div>

          <div className="config-field workspace-form-row">
            <label>Folder path</label>
            <div className="workspace-path-control" style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="/path/to/workspace/folder"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              />
              <button
                type="button"
                onClick={async () => {
                  const p = await onBrowse();
                  if (p) setFolder(p);
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                Browse
              </button>
            </div>
          </div>

          {/* Base branch */}
          <div className="config-field workspace-form-row">
            <label>Base branch <span className="field-info" title="The target branch that changes will be compared against.">ⓘ</span></label>
            <div className="workspace-select-control"><span className="branch-glyph">⑂</span><input
              type="text"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="base"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 14,
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            /><span className="select-chevron">⌄</span></div>
            <small>The target branch that changes will be compared against.</small>
          </div>

          {/* Release branch */}
          <div className="config-field workspace-form-row">
            <label>Release branch <span className="field-info" title="The branch that will be compared to the base branch.">ⓘ</span></label>
            <div className="workspace-select-control"><span className="branch-glyph">⑂</span><input
              type="text"
              value={release}
              onChange={(e) => setRelease(e.target.value)}
              placeholder="release"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 14,
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            /><span className="select-chevron">⌄</span></div>
            <small>The branch that will be compared to the base branch.</small>
          </div>

          {/* Sync interval */}
          <div className="config-field workspace-form-row">
            <label>Sync interval <span className="field-info" title="How often DeltaDot fetches and updates this workspace.">ⓘ</span></label>
            <div className="workspace-select-control"><span className="branch-glyph">◷</span><select
              value={syncInterval}
              onChange={(e) => setSyncInterval(e.target.value)}
            >{[5, 10, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select><span className="select-chevron">⌄</span></div>
            <small>How often DeltaDot fetches and updates this workspace.</small>
          </div>

          <div className="config-field workspace-form-row">
            <label>Color</label>
            <div className="workspace-select-control color-picker-control"><span className="color-swatch" style={{ background: color }} /><select value={color} onChange={(e) => setColor(e.target.value)}>
              {WORKSPACE_COLORS.map((workspaceColor, index) => <option key={workspaceColor} value={workspaceColor}>{['Indigo', 'Emerald', 'Amber', 'Ruby', 'Violet', 'Cyan', 'Orange', 'Pink', 'Purple', 'Teal'][index] ?? 'Custom'}</option>)}
            </select><span className="select-chevron">⌄</span></div>
            <small>Color used to identify this workspace across DeltaDot.</small>
          </div>

          <div className="workspace-diff-preview">
            <div><span className="diff-scope-label">DIFF SCOPE</span><strong>{release || 'release'}</strong><span className="arrow">→</span><strong>{base || 'base'}</strong><span className="lock-glyph">⌕</span></div>
            <small>Commits on release not in base.</small>
          </div>
          {/* Legacy numeric input intentionally replaced by the compact interval selector. */}
          <div style={{ display: 'none' }}><input
              type="number"
              value={syncInterval}
              onChange={(e) => setSyncInterval(e.target.value)}
              min="1"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 14,
                fontFamily: 'inherit',
                outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            /></div>

          {/* Footer actions */}
          <div className="workspace-dialog-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 20px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 24px',
                borderRadius: 6,
                background: 'linear-gradient(135deg, var(--btn-blue), var(--btn-blue-dark))',
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                opacity: isEdit || folder.trim() ? 1 : 0.5,
                transition: 'background 0.15s',
              }}
              disabled={!isEdit && !folder.trim()}
              onMouseEnter={(e) => {
                if (isEdit || folder.trim()) e.currentTarget.style.background = 'color-mix(in srgb, var(--btn-blue) 88%, #fff)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, var(--btn-blue), var(--btn-blue-dark))';
              }}
            >
              {isEdit ? 'Save Changes' : 'Add Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
