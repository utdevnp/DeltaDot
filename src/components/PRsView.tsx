import React from 'react';
import type { PR } from '../../core/types.js';
import { timeAgo } from '../../core/utils.js';

interface PRsViewProps {
  prs: PR[];
  loading: boolean;
  error: string;
  selected: number;
  filter: 'open' | 'closed' | 'all';
  onSelect: (i: number) => void;
  onBack: () => void;
  onSelectPR: () => void;
  onOpenConfig: () => void;
  onFilterChange: (f: 'open' | 'closed' | 'all') => void;
}

function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: 6,
        border: active ? '1px solid var(--accent-blue)' : '1px solid transparent',
        background: active ? 'var(--tint-blue)' : 'transparent',
        color: active ? 'var(--accent-blue)' : 'var(--text-dim)',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}

export function PRsView({ prs, loading, error, selected, filter, onSelect, onBack, onSelectPR, onOpenConfig, onFilterChange }: PRsViewProps) {
  const filterLabel = filter === 'open' ? 'Open' : filter === 'closed' ? 'Closed' : 'All';

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Pull Request</span>
          <div style={{ flex: 1 }} />
          <button className="back-btn" onClick={onBack}>←</button>
        </div>
        <div className="state-message">Loading pull requests...</div>
      </div>
    );
  }

  if (error) {
    const isConfigError = error.toLowerCase().includes('token') ||
      error.toLowerCase().includes('config') ||
      error.toLowerCase().includes('settings');

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Pull Request</span>
          <div style={{ flex: 1 }} />
          <button className="back-btn" onClick={onBack}>←</button>
        </div>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 32,
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div style={{
            color: 'var(--accent-red)',
            fontSize: 14,
            textAlign: 'center',
            lineHeight: 1.6,
            maxWidth: 480,
          }}>
            {error}
          </div>
          {isConfigError && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenConfig(); }}
              style={{
                marginTop: 8,
                padding: '10px 24px',
                borderRadius: 8,
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)'; }}
            >
              Open Settings
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Pull Request</span>
        <div style={{ flex: 1 }} />
        <FilterTab label="Open" active={filter === 'open'} onClick={() => onFilterChange('open')} />
        <FilterTab label="Closed" active={filter === 'closed'} onClick={() => onFilterChange('closed')} />
        <FilterTab label="All" active={filter === 'all'} onClick={() => onFilterChange('all')} />
        <button className="back-btn" onClick={onBack}>←</button>
      </div>
      {prs.length === 0 ? (
        <div className="empty-state">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 15h-6"/>
            <path d="M9 9H3"/>
            <path d="M21 9h-6"/>
            <path d="M15 15H3"/>
          </svg>
          <div className="text" style={{ marginTop: 8 }}>No {filterLabel.toLowerCase()} pull requests</div>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-header">
            <div className="cell" style={{ width: 50, flexShrink: 0 }}>#</div>
            <div className="cell" style={{ flex: 3, minWidth: 0 }}>TITLE</div>
            <div className="cell" style={{ width: 74, flexShrink: 0 }}>STATE</div>
            <div className="cell" style={{ width: 44, flexShrink: 0, textAlign: 'center' }}>APRVD</div>
            <div className="cell" style={{ width: 66, flexShrink: 0, textAlign: 'right', paddingRight: 18 }}>AGE</div>
            <div className="cell" style={{ width: 120, flexShrink: 0 }}>AUTHOR</div>
          </div>
          {prs.map((pr, i) => (
            <div
              key={`${pr.repoName}-${pr.number}`}
              className={`table-row ${i === selected ? 'selected' : ''}`}
              onClick={() => { onSelect(i); onSelectPR(); }}
            >
              <div className="cell pr-number" style={{ width: 50, flexShrink: 0 }}>#{pr.number}</div>
              <div className="cell pr-title" style={{ flex: 3, minWidth: 0, fontWeight: i === selected ? 600 : 400 }}>
                {pr.title}
              </div>
              <div className="cell" style={{ width: 74, flexShrink: 0 }}>
                <span className={`pr-state ${pr.state.toLowerCase()}`}>{pr.state}</span>
              </div>
              <div className="cell" style={{ width: 44, flexShrink: 0, textAlign: 'center' }}>
                <span className="pr-approved">{pr.approved ? '✓' : ''}</span>
              </div>
              <div className="cell pr-age" style={{ width: 66, flexShrink: 0, textAlign: 'right', paddingRight: 18 }}>
                {timeAgo(pr.createdAt)}
              </div>
              <div className="cell" style={{ width: 120, flexShrink: 0, color: 'var(--text-secondary)', fontSize: 12 }}>
                {pr.author}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
