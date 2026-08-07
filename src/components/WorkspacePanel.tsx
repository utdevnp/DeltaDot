import React, { useState, useRef, useEffect } from 'react';
import type { Workspace } from '../../core/types.js';
import { WORKSPACE_COLORS } from '../../core/types.js';

interface WorkspacePanelProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  collapsed: boolean;
  onSwitch: (ws: Workspace) => void;
  onAdd: () => void;
  onToggleCollapse: () => void;
  onUpdate: (ws: Workspace) => void;
}

export function WorkspacePanel({
  workspaces, activeWorkspaceId, collapsed,
  onSwitch, onAdd, onToggleCollapse, onUpdate, onEdit,
}: WorkspacePanelProps & { onEdit?: (ws: Workspace) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) inputRef.current.focus();
  }, [editingId]);

  const startRename = (ws: Workspace) => {
    setEditingId(ws.id);
    setEditName(ws.displayName || ws.name);
  };

  const commitRename = (ws: Workspace) => {
    if (editName.trim()) {
      onUpdate({ ...ws, name: editName.trim(), displayName: editName.trim() });
    }
    setEditingId(null);
  };

  const getDisplayName = (ws: Workspace) => ws.displayName || ws.name;
  const getInitial = (ws: Workspace) => getDisplayName(ws).charAt(0).toUpperCase();

  return (
    <div style={{
      width: collapsed ? 40 : 200,
      minWidth: collapsed ? 40 : 200,
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s, min-width 0.2s',
      overflow: 'hidden',
    }}>
      {/* Collapse toggle */}
      <div style={{
        padding: '10px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-end',
        borderBottom: '1px solid var(--border)',
      }}>
        {!collapsed && (
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginRight: 'auto',
          }}>
            Workspaces
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          style={{
            width: 24, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 12,
            padding: 0,
          }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>

      {/* Workspace list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            onClick={() => onSwitch(ws)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: collapsed ? 0 : 10,
              padding: collapsed ? '10px 0' : '8px 12px',
              cursor: 'pointer',
              background: ws.id === activeWorkspaceId ? 'var(--selection-bg)' : 'transparent',
              borderLeft: ws.id === activeWorkspaceId ? '3px solid var(--accent-blue)' : '3px solid transparent',
              transition: 'background 0.1s',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
            onMouseEnter={(e) => {
              if (ws.id !== activeWorkspaceId) e.currentTarget.style.background = 'var(--tint-blue)';
            }}
            onMouseLeave={(e) => {
              if (ws.id !== activeWorkspaceId) e.currentTarget.style.background = 'transparent';
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: 28, height: 28, minWidth: 28,
                borderRadius: 7,
                background: ws.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
              }}
              title={getDisplayName(ws)}
            >
              {getInitial(ws)}
            </div>

            {!collapsed && (
              <>
                {/* Name / Edit */}
                {editingId === ws.id ? (
                  <input
                    ref={inputRef}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => commitRename(ws)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(ws);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1,
                      padding: '2px 6px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--accent-blue)',
                      borderRadius: 4,
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <span style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: ws.id === activeWorkspaceId ? 600 : 400,
                    color: ws.id === activeWorkspaceId ? 'var(--text-primary)' : 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {getDisplayName(ws)}
                  </span>
                )}

                {/* Actions (hover) */}
                {ws.id === activeWorkspaceId && (
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    {/* Edit (opens dialog) */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit?.(ws); }}
                      style={{
                        width: 22, height: 22,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'none', border: 'none',
                        cursor: 'pointer', borderRadius: 4,
                        color: 'var(--text-dim)', fontSize: 12, padding: 0,
                      }}
                      title="Edit workspace"
                    >
                      ✎
                    </button>
                    {/* Color */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowColorPicker(showColorPicker === ws.id ? null : ws.id); }}
                      style={{
                        width: 22, height: 22,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'none', border: 'none',
                        cursor: 'pointer', borderRadius: 4,
                        color: 'var(--text-dim)', fontSize: 12, padding: 0,
                      }}
                      title="Change color"
                    >
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: ws.color }} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {/* Color picker */}
        {showColorPicker && !collapsed && (
          <div style={{
            padding: '6px 12px',
            display: 'flex',
            gap: 4,
            flexWrap: 'wrap',
            borderTop: '1px solid var(--border)',
          }}>
            {WORKSPACE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  const ws = workspaces.find((w) => w.id === showColorPicker);
                  if (ws) onUpdate({ ...ws, color: c });
                  setShowColorPicker(null);
                }}
                style={{
                  width: 20, height: 20,
                  borderRadius: 4,
                  background: c,
                  border: c === (workspaces.find((w) => w.id === showColorPicker)?.color ?? '') ? '2px solid var(--text-primary)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add workspace button */}
      <div style={{
        padding: '8px',
        borderTop: '1px solid var(--border)',
      }}>
        <button
          onClick={onAdd}
          style={{
            width: '100%',
            padding: collapsed ? '6px 0' : '6px 12px',
            borderRadius: 6,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            fontSize: collapsed ? 14 : 12,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: collapsed ? 0 : 6,
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
          title="Add workspace"
        >
          <span>+</span>
          {!collapsed && <span>Add workspace</span>}
        </button>
      </div>
    </div>
  );
}
