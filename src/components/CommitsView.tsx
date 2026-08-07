import React from 'react';
import type { RepoState, CommitEntry, LatestCommit } from '../../core/types.js';

interface CommitsViewProps {
  repo: RepoState;
  selectedCommit: number;
  base: string;
  release: string;
  onSelectCommit: (i: number) => void;
  onBack: () => void;
  onCommitDetail: (hash: string) => void;
}

function CommitRow({ hash, message, author, age, isSelected, onClick }: {
  hash: string; message: string; author?: string; age?: string; isSelected: boolean; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        cursor: 'pointer',
        borderRadius: 4,
        margin: '0 8px',
        background: isSelected ? 'var(--selection-bg)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent-blue)' : '2px solid transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--accent-yellow)',
        flexShrink: 0,
        minWidth: 56,
      }}>
        {hash.slice(0, 7)}
      </span>
      <span style={{
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontSize: 13,
        color: isSelected ? 'var(--accent-yellow)' : 'var(--text-primary)',
        fontWeight: isSelected ? 500 : 400,
      }}>
        {message}
      </span>
      {author && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
          {author}
        </span>
      )}
      {age && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, minWidth: 32, textAlign: 'right' }}>
          {age}
        </span>
      )}
    </div>
  );
}

export function CommitsView({ repo, selectedCommit, base, release, onSelectCommit, onBack, onCommitDetail }: CommitsViewProps) {
  const diffCommits: (CommitEntry & { type: 'diff' })[] = (repo.diffCommits ?? []).map((c) => ({ ...c, type: 'diff' }));
  const latestCommits: (LatestCommit & { type: 'latest' })[] = (repo.latestCommits ?? []).map((c) => ({ ...c, type: 'latest' }));

  const hasDiff = diffCommits.length > 0;
  const hasLatest = latestCommits.length > 0;

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{repo.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {base} ← {release}
        </span>
        {hasDiff && (
          <span style={{
            padding: '2px 10px',
            borderRadius: 10,
            background: 'var(--tint-red)',
            color: 'var(--accent-red)',
            fontSize: 11,
            fontWeight: 600,
          }}>
            {diffCommits.length} commit{diffCommits.length !== 1 ? 's' : ''} behind
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button className="back-btn" onClick={onBack}>←</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 0 }}>
        {/* DIFF panel */}
        <div style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border)',
        }}>
          <div style={{
            padding: '8px 12px',
            background: 'var(--tint-red)',
            borderBottom: '1px solid var(--border)',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--accent-red)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 18 17 12 23 6"/><path d="M1 6h12a4 4 0 0 1 4 4v8"/>
            </svg>
            DIFF — commits on release not in base
            <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none' }}>
              {diffCommits.length} commit{diffCommits.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!hasDiff ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                {repo.missingRelease
                  ? 'Release branch not found for this repository'
                  : 'No differences — branches are in sync'}
              </div>
            ) : (
              diffCommits.map((c, i) => (
                <CommitRow
                  key={c.hash}
                  hash={c.hash}
                  message={c.message}
                  isSelected={selectedCommit === i}
                  onClick={() => { onSelectCommit(i); onCommitDetail(c.hash); }}
                />
              ))
            )}
          </div>
        </div>

        {/* LATEST panel */}
        <div style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            padding: '8px 12px',
            background: 'var(--tint-blue)',
            borderBottom: '1px solid var(--border)',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--accent-blue)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 6 17 12 23 18"/><path d="M17 14H9a4 4 0 0 1-4-4V2"/>
            </svg>
            LATEST — origin/{release}
            <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none' }}>
              last {latestCommits.length}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!hasLatest ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                No commits found on origin/{release}
              </div>
            ) : (
              latestCommits.map((c, i) => {
                const idx = diffCommits.length + i;
                return (
                  <CommitRow
                    key={c.hash}
                    hash={c.hash}
                    message={c.subject}
                    author={c.author}
                    age={c.age}
                    isSelected={selectedCommit === idx}
                    onClick={() => { onSelectCommit(idx); onCommitDetail(c.hash); }}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
