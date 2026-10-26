import React, { useState, useEffect } from 'react';
import type { RepoState } from '../../core/types.js';
import { SPINNER, truncate } from '../../core/utils.js';
import { RepoChangesDrawer } from './RepoChangesDrawer.js';
import { ForceFetchDrawer } from './ForceFetchDrawer.js';
import { RepoDetailDrawer } from './RepoDetailDrawer.js';

interface RepoListProps {
  repos: RepoState[];
  selected: string;
  onSelect: (repo: RepoState) => void;
  isSyncing: boolean;
  syncProgress: { done: number; total: number };
  base: string;
  release: string;
  onSyncAll: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onOpenCommits: (repo: RepoState) => void;
  onRemoveRepo: (repo: RepoState) => Promise<void>;
  onOpenPRs: (repo: RepoState) => void;
  onSyncRepo: (repo: RepoState, fetchMode?: 'all' | 'origin') => Promise<void> | void;
  onForceFetchComplete: (repo: RepoState) => Promise<{ openPRCount: number | string | null; error?: string }>;
  onOpenCompare: (repo: RepoState) => void;
  onOpenRemote: (repo: RepoState) => void;
  onCopyPath: (repo: RepoState) => void;
  onCopyRemote: (repo: RepoState) => void;
  ignoredRepoPaths: string[];
  onToggleIgnoreRepo: (repo: RepoState) => void;
  openPRCounts: Record<string, number | string | null>;
  statusFilter: RepoStatusFilter;
  onStatusFilterChange: (filter: RepoStatusFilter) => void;
}

export type RepoStatusFilter = 'all' | 'synced' | 'notSynced' | 'notInRelease' | 'error';

type MenuIconName = 'details' | 'commits' | 'pulls' | 'sync' | 'forceFetch' | 'compare' | 'external' | 'copy' | 'ignore' | 'workingTree' | 'remove';

function MenuIcon({ name }: { name: MenuIconName }) {
  const paths: Record<MenuIconName, React.ReactNode> = {
    details: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /><path d="M11 8v3l2 1" /></>,
    commits: <><path d="M6 3v18" /><circle cx="6" cy="6" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="6" cy="18" r="2" /><path d="M8 6h7a3 3 0 0 1 3 3v9" /></>,
    pulls: <><path d="M6 3v14" /><path d="m3 14 3 3 3-3" /><path d="M18 21V7" /><path d="m15 10 3-3 3 3" /></>,
    sync: <><path d="M20 11a8 8 0 0 0-14.5-4L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.5 4L20 15" /><path d="M20 20v-5h-5" /></>,
    forceFetch: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" /></>,
    compare: <><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /><path d="M3 15v4a2 2 0 0 0 2 2h4" /><path d="M21 9V5a2 2 0 0 0-2-2h-4" /><path d="m8 8 8 8" /><path d="m16 8-8 8" /></>,
    external: <><path d="M14 3h7v7" /><path d="m10 14 11-11" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" /></>,
    ignore: <><path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3Z" /><path d="m9 9 6 6" /><path d="m15 9-6 6" /></>,
    workingTree: <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5M8 16h3" /></>,
    remove: <><path d="M3 6h18" /><path d="M8 6V4h8v2M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></>,
  };
  return <svg className="repo-context-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
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
      return { text: 'error', color: 'var(--accent-yellow)' };
    case 'behind':
      return { text: repo.missingRelease ? 'no release' : `${repo.diffCommits.length} behind`, color: repo.missingRelease ? 'var(--text-dim)' : 'var(--accent-red)' };
    case 'synced':
      return { text: 'synced', color: 'var(--accent-green)' };
    default:
      return { text: '', color: 'var(--text-dim)' };
  }
}

function RemoveRepoDialog({ repo, onCancel, onRemove }: { repo: RepoState; onCancel: () => void; onRemove: (repo: RepoState) => Promise<void> }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  const submit = async () => {
    if (name !== repo.name || removing) return;
    setRemoving(true);
    try { await onRemove(repo); onCancel(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setRemoving(false); }
  };
  return <div className="repo-remove-overlay"><section className="repo-remove-dialog" role="alertdialog" aria-modal="true" aria-labelledby="repo-remove-title">
    <span className="dashboard-section-kicker">Remove repository folder</span><h3 id="repo-remove-title">Confirm folder removal</h3>
    <p>This permanently deletes <strong>{repo.path}</strong> and all files inside it from this computer.</p>
    <p>Type <code>{repo.name}</code> exactly to enable removal.</p>
    <input autoFocus value={name} onChange={(event) => setName(event.target.value)} aria-label={`Type ${repo.name} to confirm`} placeholder={repo.name} />
    <div className="repo-remove-actions"><button type="button" onClick={onCancel} disabled={removing}>Cancel</button><button type="button" className="is-danger" onClick={() => void submit()} disabled={name !== repo.name || removing}>{removing ? 'Removing…' : 'Remove folder'}</button></div>
    {error && <p className="repo-remove-error" role="alert">{error}</p>}
  </section></div>;
}

export function RepoList({ repos, selected, onSelect, isSyncing, syncProgress, base, release, onSyncAll, searchQuery, onSearchQueryChange, onOpenCommits, onRemoveRepo, onOpenPRs, onSyncRepo, onForceFetchComplete, onOpenCompare, onOpenRemote, onCopyPath, onCopyRemote, ignoredRepoPaths, onToggleIgnoreRepo, openPRCounts, statusFilter, onStatusFilterChange }: RepoListProps) {
  const [frame, setFrame] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; repo: RepoState } | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const contextMenuRef = React.useRef<HTMLDivElement>(null);
  const [showIgnored, setShowIgnored] = useState(false);
  const [changesRepo, setChangesRepo] = useState<RepoState | null>(null);
  const [removeRepoTarget, setRemoveRepoTarget] = useState<RepoState | null>(null);
  const [drawerMode, setDrawerMode] = useState<'changes' | 'force-fetch' | 'details'>('changes');
  const [localSummaries, setLocalSummaries] = useState<Record<string, { files: number; commitsAhead: number | null }>>({});
  const ignoredSet = new Set(ignoredRepoPaths);
  const availableRepos = showIgnored ? repos : repos.filter((repo) => !ignoredSet.has(repo.path));
  const visibleRepos = availableRepos.filter((repo) => statusFilter === 'all' || (statusFilter === 'synced' ? repo.status === 'synced' : statusFilter === 'notSynced' ? repo.status === 'behind' : statusFilter === 'notInRelease' ? Boolean(repo.missingRelease) : repo.status === 'error'));
  const syncedCount = availableRepos.filter((repo) => repo.status === 'synced').length;
  const notInReleaseCount = availableRepos.filter((repo) => repo.missingRelease).length;
  const notSyncedCount = availableRepos.filter((repo) => repo.status === 'behind').length;
  const errorCount = availableRepos.filter((repo) => repo.status === 'error').length;

  const statusChip = (filter: RepoStatusFilter, className: string, label: string, count: number) => <button type="button" className={`repo-status-chip ${className} ${statusFilter === filter ? 'is-active' : ''}`} title={label} data-tooltip={label} onClick={() => onStatusFilterChange(statusFilter === filter ? 'all' : filter)}>{filter === 'all' ? 'All' : count}</button>;

  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => f + 1), 120);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const uncached = repos.filter((repo) => repo.localChangesCount === undefined || repo.localCommitsCount === undefined);
    void Promise.all(uncached.map(async (repo) => {
      try {
        const snapshot = await window.api.getLocalChanges(repo.path);
        if (!cancelled) setLocalSummaries((current) => ({ ...current, [repo.path]: { files: snapshot.files.length, commitsAhead: snapshot.commitsAhead } }));
      } catch { /* the repository row will continue to show its cached state */ }
    }));
    return () => { cancelled = true; };
  }, [repos]);

  useEffect(() => {
    if (!contextMenu) return;
    setContextMenuPosition({ x: contextMenu.x, y: contextMenu.y });
    const frameId = window.requestAnimationFrame(() => {
      const menu = contextMenuRef.current;
      if (!menu) return;
      const margin = 8;
      setContextMenuPosition({
        x: Math.max(margin, Math.min(contextMenu.x, window.innerWidth - menu.offsetWidth - margin)),
        y: Math.max(margin, Math.min(contextMenu.y, window.innerHeight - menu.offsetHeight - margin)),
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [contextMenu]);

  if (visibleRepos.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="repo-view-toolbar">
          <div><strong>Repositories</strong><span className="repo-view-scope">Checking {release} → {base}</span></div>
          <div className="repo-view-actions">
            <input className="repo-search-input" value={searchQuery} onChange={(e) => onSearchQueryChange(e.target.value)} placeholder="Search repos..." aria-label="Search repositories" />
            {statusChip('all', 'repo-status-chip-all', 'All repositories', availableRepos.length)}
            {statusChip('synced', 'repo-status-chip-synced', 'Synced', syncedCount)}
            {statusChip('notSynced', 'repo-status-chip-not-synced', 'Not synced', notSyncedCount)}
            {statusChip('notInRelease', 'repo-status-chip-not-in-release', 'Not in release', notInReleaseCount)}
            {statusChip('error', 'repo-status-chip-error', 'Sync errors', errorCount)}
            {ignoredRepoPaths.length > 0 && <button type="button" className="repo-show-ignored" onClick={() => setShowIgnored(true)}>Show ignored ({ignoredRepoPaths.length})</button>}
            <span>{visibleRepos.length} repos</span><button type="button" onClick={onSyncAll}>Sync all</button>
          </div>
        </div>
        <div className="empty-state">
          <div className="text" style={{ color: 'var(--text-dim)' }}>
            {isSyncing ? 'Scanning repositories...' : 'No repositories found'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="repo-view-toolbar">
        <div><strong>Repositories</strong><span className="repo-view-scope">Checking {release} → {base}</span></div>
        <div className="repo-view-actions">
          <input className="repo-search-input" value={searchQuery} onChange={(e) => onSearchQueryChange(e.target.value)} placeholder="Search repos..." aria-label="Search repositories" />
          {statusChip('all', 'repo-status-chip-all', 'All repositories', availableRepos.length)}
          {statusChip('synced', 'repo-status-chip-synced', 'Synced', syncedCount)}
          {statusChip('notSynced', 'repo-status-chip-not-synced', 'Not synced', notSyncedCount)}
          {statusChip('notInRelease', 'repo-status-chip-not-in-release', 'Not in release', notInReleaseCount)}
          {statusChip('error', 'repo-status-chip-error', 'Sync errors', errorCount)}
          {ignoredRepoPaths.length > 0 && <button type="button" className="repo-show-ignored" onClick={() => setShowIgnored((value) => !value)}>{showIgnored ? 'Hide ignored' : `Show ignored (${ignoredRepoPaths.length})`}</button>}
          <span>{visibleRepos.length} repos</span><button type="button" onClick={onSyncAll} disabled={isSyncing}>{isSyncing ? `Syncing ${syncProgress.done}/${syncProgress.total}` : 'Sync all'}</button>
        </div>
      </div>
      <div className="table-container">
      <div className="table-header">
        <div className="cell" style={{ width: 30, flexShrink: 0 }}>#</div>
        <div className="cell" style={{ flex: 2, minWidth: 140 }}>REPO</div>
        <div className="cell" style={{ width: 80, flexShrink: 0 }}>DIFF</div>
        <div className="cell" style={{ width: 76, flexShrink: 0 }}>LOCAL</div>
        <div className="cell" style={{ width: 72, flexShrink: 0 }}>AHEAD</div>
        <div className="cell" style={{ width: 70, flexShrink: 0 }}>OPEN PRs</div>
        <div className="cell" style={{ width: 90, flexShrink: 0 }}>VERSION</div>
        <div className="cell" style={{ width: 90, flexShrink: 0 }}>AUTHOR</div>
        <div className="cell" style={{ width: 70, flexShrink: 0 }}>AGE</div>
        <div className="cell" style={{ flex: 2, minWidth: 120 }}>LAST COMMIT</div>
      </div>

      {visibleRepos.map((repo, i) => {
        const isSelected = repo.path === selected;
        const dim = repo.missingRelease && repo.status !== 'loading' && repo.status !== 'syncing';
        const st = statusText(repo, frame + i * 2);
        const hasSpinner = repo.status === 'loading' || repo.status === 'stale' || repo.status === 'syncing';
        const showCached = repo.status !== 'loading';
        const showAuthor = showCached && repo.lastCommitAuthor ? repo.lastCommitAuthor : '';
        const lastMsg = repo.error
          ? truncate(repo.error, 60)
          : truncate(repo.lastCommitMsg, 60);

        return (
          <div
            key={repo.path}
            className={`table-row ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelect(repo)}
            onContextMenu={(event) => {
              event.preventDefault();
              onSelect(repo);
              setContextMenu({ x: event.clientX, y: event.clientY, repo });
            }}
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

            <div className="cell repo-local-count" style={{ width: 76, flexShrink: 0, color: (repo.localChangesCount ?? localSummaries[repo.path]?.files ?? 0) > 0 ? 'var(--accent-yellow)' : 'var(--text-dim)' }} title="Uncommitted changed files">
              {(repo.localChangesCount ?? localSummaries[repo.path]?.files ?? 0) > 0 ? `${repo.localChangesCount ?? localSummaries[repo.path]?.files} files` : '—'}
            </div>
            <div className="cell repo-local-count" style={{ width: 72, flexShrink: 0, color: (repo.localCommitsCount ?? localSummaries[repo.path]?.commitsAhead ?? 0) > 0 ? 'var(--accent-cyan)' : 'var(--text-dim)' }} title="Commits ahead of upstream">
              {repo.localCommitsCount ?? localSummaries[repo.path]?.commitsAhead ?? '—'}
            </div>

            {/* VERSION */}
            <div className="cell" style={{ width: 70, flexShrink: 0, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {openPRCounts[repo.path] === null ? '…' : (openPRCounts[repo.path] ?? '—')}
            </div>

            {/* VERSION */}
            <div className="cell" style={{
              width: 90, flexShrink: 0,
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: dim ? 'var(--text-dim)' : 'var(--text-secondary)',
            }}>
              {!showCached ? '' : (repo.latestVersion || '-')}
            </div>

            {/* AUTHOR */}
            <div className="cell" style={{
              width: 90, flexShrink: 0,
              color: dim ? 'var(--text-dim)' : 'var(--text-secondary)',
              fontSize: 12,
            }}>
              {showAuthor}
            </div>

            {/* AGE */}
            <div className="cell" style={{
              width: 70, flexShrink: 0,
              color: dim ? 'var(--text-dim)' : 'var(--text-dim)',
              fontFamily: 'var(--font-mono)', fontSize: 11,
            }}>
              {!showCached ? '' : (formatAge(repo) || repo.lastCommitAge || '')}
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
      {contextMenu && (
        <>
          <div className="repo-context-backdrop" onClick={() => setContextMenu(null)} onContextMenu={(event) => { event.preventDefault(); setContextMenu(null); }} />
          <div ref={contextMenuRef} className="repo-context-menu" style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }} role="menu" aria-label={`Actions for ${contextMenu.repo.name}`}>
            <div className="repo-context-heading">{contextMenu.repo.name}</div>
            <button type="button" onClick={() => { setContextMenu(null); setDrawerMode('details'); setChangesRepo(contextMenu.repo); }}><MenuIcon name="details" /><span>View Details</span></button>
            <button type="button" onClick={() => { setContextMenu(null); onOpenCommits(contextMenu.repo); }}><MenuIcon name="commits" /><span>Open Commits</span><kbd>↵</kbd></button>
            <button type="button" onClick={() => { setContextMenu(null); onOpenPRs(contextMenu.repo); }}><MenuIcon name="pulls" /><span>View Pull Requests</span><kbd>p</kbd></button>
            <button type="button" onClick={() => { setContextMenu(null); onSyncRepo(contextMenu.repo); }}><MenuIcon name="sync" /><span>Sync Repository</span><kbd>s</kbd></button>
            <button type="button" onClick={() => { setContextMenu(null); setDrawerMode('changes'); setChangesRepo(contextMenu.repo); }}><MenuIcon name="workingTree" /><span>Open Working Tree</span></button>
            <button type="button" className="repo-force-fetch-menu-item" onClick={() => { onSelect(contextMenu.repo); setContextMenu(null); setDrawerMode('force-fetch'); setChangesRepo(contextMenu.repo); }}><MenuIcon name="forceFetch" /><span>Force Fetch</span></button>
            <div className="repo-context-separator" />
            <button type="button" onClick={() => { setContextMenu(null); onOpenCompare(contextMenu.repo); }}><MenuIcon name="compare" /><span>Open Compare in Browser</span><kbd>o</kbd></button>
            <button type="button" onClick={() => { setContextMenu(null); onOpenRemote(contextMenu.repo); }}><MenuIcon name="external" /><span>Open Repository URL</span></button>
            <div className="repo-context-separator" />
            <button type="button" onClick={() => { setContextMenu(null); onCopyPath(contextMenu.repo); }}><MenuIcon name="copy" /><span>Copy Repository Path</span></button>
            <button type="button" onClick={() => { setContextMenu(null); onCopyRemote(contextMenu.repo); }}><MenuIcon name="copy" /><span>Copy Remote URL</span></button>
            <div className="repo-context-separator" />
            <button type="button" onClick={() => { setContextMenu(null); onToggleIgnoreRepo(contextMenu.repo); }}><MenuIcon name="ignore" /><span>{ignoredSet.has(contextMenu.repo.path) ? 'Unignore Repository' : 'Ignore Repository'}</span></button>
            <div className="repo-context-separator" />
            <button type="button" onClick={() => { setContextMenu(null); setRemoveRepoTarget(contextMenu.repo); }}><MenuIcon name="remove" /><span>Remove Repository…</span></button>
          </div>
        </>
      )}
      {changesRepo && (drawerMode === 'details'
        ? <RepoDetailDrawer key={`details-${changesRepo.path}`} repo={repos.find((repo) => repo.path === changesRepo.path) ?? changesRepo} base={base} release={release} onClose={() => setChangesRepo(null)} onRemove={onRemoveRepo} />
        : drawerMode === 'force-fetch'
        ? <ForceFetchDrawer key={`force-${changesRepo.path}`} repo={repos.find((repo) => repo.path === changesRepo.path) ?? changesRepo} base={base} release={release} onClose={() => setChangesRepo(null)} onComplete={onForceFetchComplete} />
        : <RepoChangesDrawer key={`changes-${changesRepo.path}`} repo={repos.find((repo) => repo.path === changesRepo.path) ?? changesRepo} onClose={() => setChangesRepo(null)} onRefresh={async (fetchMode) => { await onSyncRepo(repos.find((repo) => repo.path === changesRepo.path) ?? changesRepo, fetchMode); }} />)}
      {removeRepoTarget && <RemoveRepoDialog repo={removeRepoTarget} onCancel={() => setRemoveRepoTarget(null)} onRemove={onRemoveRepo} />}
    </div>
  );
}
