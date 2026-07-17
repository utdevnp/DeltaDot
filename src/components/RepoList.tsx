import React, { useState, useEffect } from 'react';
import type { RepoState } from '../../core/types.js';
import { SPINNER, truncate } from '../../core/utils.js';

interface RepoListProps {
  repos: RepoState[];
  selected: number;
  onSelect: (i: number) => void;
  isSyncing: boolean;
  syncProgress: { done: number; total: number };
}

function formatAge(repo: RepoState): string {
  if (repo.lastCommitAge) return repo.lastCommitAge;
  return '';
}

function statusText(repo: RepoState, frame: number): { text: string; color: string } {
  const spin = SPINNER[frame % SPINNER.length];
  switch (repo.status) {
    case 'loading':
    case 'stale':
    case 'syncing':
      return { text: `${spin} syncing`, color: 'var(--accent-cyan)' };
    case 'error':
      return { text: '⚠ error', color: 'var(--accent-yellow)' };
    case 'behind':
      return { text: repo.missingRelease ? 'no release' : `${repo.diffCommits.length} behind`, color: repo.missingRelease ? 'var(--text-dim)' : 'var(--accent-red)' };
    case 'synced':
      return { text: 'synced', color: 'var(--accent-green)' };
    default:
      return { text: '', color: 'var(--text-dim)' };
  }
}

export function RepoList({ repos, selected, onSelect, isSyncing, syncProgress }: RepoListProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => f + 1), 120);
    return () => clearInterval(timer);
  }, []);

  if (repos.length === 0) {
    return (
      <div className="empty-state">
        <div className="text" style={{ color: 'var(--text-dim)' }}>
          {isSyncing ? 'Scanning repositories...' : 'No repositories found'}
        </div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <div className="table-header">
        <div className="cell" style={{ width: 30, flexShrink: 0 }}>#</div>
        <div className="cell" style={{ flex: 2, minWidth: 140 }}>REPO</div>
        <div className="cell" style={{ width: 80, flexShrink: 0 }}>DIFF</div>
        <div className="cell" style={{ width: 90, flexShrink: 0 }}>VERSION</div>
        <div className="cell" style={{ width: 90, flexShrink: 0 }}>AUTHOR</div>
        <div className="cell" style={{ width: 70, flexShrink: 0 }}>AGE</div>
        <div className="cell" style={{ flex: 2, minWidth: 120 }}>LAST COMMIT</div>
      </div>

      {repos.map((repo, i) => {
        const isSelected = i === selected;
        const dim = repo.missingRelease && repo.status !== 'loading' && repo.status !== 'syncing';
        const st = statusText(repo, frame + i * 2); // per-repo offset so spinners aren't in sync
        const hasSpinner = repo.status === 'loading' || repo.status === 'stale' || repo.status === 'syncing';
        const showAuthor = !hasSpinner && repo.lastCommitAuthor;
        const lastMsg = repo.error
          ? truncate(repo.error, 60)
          : truncate(repo.lastCommitMsg, 60);

        return (
          <div
            key={repo.path}
            className={`table-row ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelect(i)}
            style={dim ? { opacity: 0.5 } : undefined}
          >
            {/* # */}
            <div className="cell" style={{
              width: 30, flexShrink: 0,
              fontFamily: 'var(--font-mono)', fontSize: 12,
              color: 'var(--text-dim)',
            }}>
              {i + 1}
            </div>

            {/* REPO name */}
            <div className="cell" style={{
              flex: 2, minWidth: 140,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: hasSpinner ? 'var(--accent-cyan)' : st.color,
                width: 14,
                textAlign: 'center',
                display: 'inline-block',
              }}>
                {hasSpinner ? SPINNER[(frame + i * 2) % SPINNER.length] : '●'}
              </span>
              <span style={{
                color: isSelected ? 'var(--accent-yellow)' : 'var(--text-primary)',
                fontWeight: isSelected ? 600 : 400,
              }}>
                {repo.name}
              </span>
            </div>

            {/* DIFF */}
            <div className="cell" style={{
              width: 80, flexShrink: 0,
              fontFamily: 'var(--font-mono)', fontSize: 12,
              color: st.color,
            }}>
              {st.text}
            </div>

            {/* VERSION */}
            <div className="cell" style={{
              width: 90, flexShrink: 0,
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: dim ? 'var(--text-dim)' : 'var(--text-secondary)',
            }}>
              {hasSpinner ? '' : (repo.latestVersion || '-')}
            </div>

            {/* AUTHOR */}
            <div className="cell" style={{
              width: 90, flexShrink: 0,
              color: dim ? 'var(--text-dim)' : 'var(--text-secondary)',
              fontSize: 12,
            }}>
              {showAuthor || ''}
            </div>

            {/* AGE */}
            <div className="cell" style={{
              width: 70, flexShrink: 0,
              color: dim ? 'var(--text-dim)' : 'var(--text-dim)',
              fontFamily: 'var(--font-mono)', fontSize: 11,
            }}>
              {hasSpinner ? '' : (formatAge(repo) || repo.lastCommitAge || '')}
            </div>

            {/* LAST COMMIT */}
            <div className="cell" style={{
              flex: 2, minWidth: 120,
              color: repo.error ? 'var(--accent-yellow)' : (dim ? 'var(--text-dim)' : 'var(--text-secondary)'),
              fontSize: 12,
            }}>
              {lastMsg}
            </div>
          </div>
        );
      })}
    </div>
  );
}
