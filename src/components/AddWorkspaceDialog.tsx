import React, { useState } from 'react';
import type { Workspace } from '../../core/types.js';

interface AddWorkspaceDialogProps {
  editWorkspace?: Workspace;
  onSave?: (folder: string, base: string, release: string, syncInterval: number) => void;
  onEditSave?: (id: string, name: string, folder: string, base: string, release: string, syncInterval: number) => void;
  onClose: () => void;
  onBrowse: () => Promise<string | null>;
  defaultBase?: string;
  defaultRelease?: string;
  defaultSyncInterval?: number;
}

export function AddWorkspaceDialog({
  editWorkspace, onSave, onEditSave, onClose, onBrowse,
  defaultBase = 'main', defaultRelease = 'R10', defaultSyncInterval = 30,
}: AddWorkspaceDialogProps) {
  const isEdit = !!editWorkspace;
  const [folder, setFolder] = useState(editWorkspace?.path ?? '');
  const [name, setName] = useState(editWorkspace?.displayName ?? editWorkspace?.name ?? '');
  const [base, setBase] = useState(editWorkspace?.config?.base ?? defaultBase);
  const [release, setRelease] = useState(editWorkspace?.config?.release ?? defaultRelease);
  const [syncInterval, setSyncInterval] = useState(String(editWorkspace?.config?.syncInterval ?? defaultSyncInterval));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit && onEditSave) {
      onEditSave(
        editWorkspace!.id,
        name.trim() || editWorkspace!.name,
        folder.trim() || editWorkspace!.path,
        base.trim(),
        release.trim(),
        Math.max(1, parseFloat(syncInterval) || 30),
      );
    } else if (!isEdit && onSave) {
      if (!folder.trim()) return;
      onSave(folder.trim(), base.trim(), release.trim(), Math.max(1, parseFloat(syncInterval) || 30));
    }
  };

  return (
    <div className="command-overlay" onClick={onClose}>
      <div
        style={{
          width: 480,
          maxWidth: '90vw',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {isEdit ? 'Edit Workspace' : 'Add Workspace'}
          </h2>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Workspace path */}
          <div className="config-field">
            <label>Workspace Path</label>
            <div style={{ display: 'flex', gap: 8 }}>
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

          {/* Workspace name */}
          <div className="config-field">
            <label>Workspace Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={editWorkspace?.name ?? 'My Workspace'}
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
            />
          </div>

          {/* Base branch */}
          <div className="config-field">
            <label>Base Branch</label>
            <input
              type="text"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="main"
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
            />
          </div>

          {/* Release branch */}
          <div className="config-field">
            <label>Release Branch</label>
            <input
              type="text"
              value={release}
              onChange={(e) => setRelease(e.target.value)}
              placeholder="R10"
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
            />
          </div>

          {/* Sync interval */}
          <div className="config-field">
            <label>Sync Interval (min)</label>
            <input
              type="number"
              value={syncInterval}
              onChange={(e) => setSyncInterval(e.target.value)}
              placeholder="30"
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
            />
          </div>

          {/* Footer actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
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
                background: 'var(--accent-blue)',
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
                if (isEdit || folder.trim()) e.currentTarget.style.background = '#4a90e2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent-blue)';
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
