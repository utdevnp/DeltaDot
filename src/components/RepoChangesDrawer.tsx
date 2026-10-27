import React, { useEffect, useState } from 'react';
import type { LocalChangesSnapshot, LocalChangeFile, RepoState } from '../../core/types.js';

interface Props {
  repo: RepoState;
  onClose: () => void;
  onRefresh: (fetchMode?: 'all' | 'origin') => Promise<void>;
}

function lineTone(line: string) {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'is-added';
  if (line.startsWith('-') && !line.startsWith('---')) return 'is-removed';
  return '';
}

function explainSyncError(error: string) {
  if (/authentication failed|permission denied|access denied|could not read username|repository not found|\b(401|403)\b/i.test(error)) {
    return { cause: 'The remote rejected access.', next: 'Check that the remote URL is correct and that your SSH key or access token has permission to read this repository.' };
  }
  if (/could not resolve host|failed to connect|connection timed out|network is unreachable|connection reset|proxy|ssl|tls/i.test(error)) {
    return { cause: 'Git could not reach the remote.', next: 'Check your network, VPN, proxy, or certificate settings, then retry the sync.' };
  }
  if (/would clobber existing tag|cannot lock ref|failed to update ref|tag .* already exists/i.test(error)) {
    return { cause: 'A local tag conflicts with a tag from the remote.', next: 'Review local tags before replacing them. Try syncing from origin only to skip the all-remotes, all-tags fetch.' };
  }
  if (/couldn.t find remote ref|could not find remote ref|no such remote|does not appear to be a git repository|ambiguous argument|bad revision/i.test(error)) {
    return { cause: 'A remote or configured branch could not be found.', next: 'Check the repository remotes and confirm the configured base and release branches exist on the remote.' };
  }
  return { cause: 'Git stopped before DeltaDot could compare the configured branches.', next: 'Review the full Git error below, check the remote URL and branch names, then retry or try origin only.' };
}

export function RepoChangesDrawer({ repo, onClose, onRefresh }: Props) {
  const [snapshot, setSnapshot] = useState<LocalChangesSnapshot>({ files: [], commitsAhead: null, aheadCommits: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [width, setWidth] = useState(760);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [errorCopied, setErrorCopied] = useState(false);
  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await window.api.getLocalChanges(repo.path);
      setSnapshot(result);
      setSelected(result.files.map((file) => file.path));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, [repo.path]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const resizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => setWidth(Math.max(520, Math.min(window.innerWidth * 0.94, window.innerWidth - moveEvent.clientX)));
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  const discardFile = async (file: LocalChangeFile) => {
    setBusy(true); setError('');
    try {
      setSnapshot(await window.api.discardLocalFile(repo.path, file.path, file.untracked));
      setSelected((items) => items.filter((path) => path !== file.path));
      await onRefresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); await reload(); }
    finally { setBusy(false); }
  };

  const discardAll = async () => {
    setBusy(true); setConfirmDiscard(false); setError('');
    try {
      await window.api.discardAllLocalChanges(repo.path);
      setSnapshot(await window.api.getLocalChanges(repo.path));
      setSelected([]);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await reload();
    } finally { setBusy(false); }
  };

  const commit = async () => {
    setBusy(true); setError('');
    try {
      await window.api.commitLocalChanges(repo.path, selected, message);
      setMessage('');
      setSnapshot(await window.api.getLocalChanges(repo.path));
      setSelected([]);
      await onRefresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  const fetchTags = async () => {
    setBusy(true); setError('');
    try { await window.api.fetchRepoTags(repo.path); await onRefresh(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  const openRemote = async () => {
    setError('');
    try {
      const remote = await window.api.getRemoteUrl(repo.path);
      if (!remote) throw new Error('No remote URL is configured for this repository.');
      await window.api.openUrl(remote);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const retrySync = async (fetchMode: 'all' | 'origin') => {
    setBusy(true); setError('');
    try { await onRefresh(fetchMode); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  const copySyncError = async () => {
    if (!repo.error) return;
    try {
      await navigator.clipboard.writeText(`${repo.name}\n${repo.path}\n\n${repo.error}`);
      setErrorCopied(true);
      window.setTimeout(() => setErrorCopied(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? `Could not copy error: ${err.message}` : 'Could not copy error to clipboard.');
    }
  };

  return <>
    <button type="button" className="repo-changes-backdrop" onClick={onClose} aria-label="Close repository changes" />
    <aside className="repo-changes-drawer" style={{ width }} role="dialog" aria-modal="true" aria-labelledby="repo-changes-title" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="repo-changes-resize" onPointerDown={resizeStart} aria-label="Resize drawer" title="Drag to resize" />
      <header className="repo-changes-header"><div><span className="dashboard-section-kicker">Working tree</span><h2 id="repo-changes-title">{repo.name}</h2><code>{repo.path}</code></div><button type="button" className="dashboard-drawer-close" onClick={onClose} aria-label="Close drawer">×</button></header>
      <div className="repo-changes-summary"><span><b>{snapshot.files.length}</b> changed files</span><span><b>{snapshot.commitsAhead ?? '—'}</b> commits ahead</span><div className="repo-changes-summary-actions"><button type="button" onClick={() => void fetchTags()} disabled={busy}>Fetch</button><button type="button" onClick={() => void reload()} disabled={loading || busy}>Refresh</button></div></div>
      <div className="repo-changes-body">
        {repo.status === 'error' && repo.error && <section className="repo-sync-error" role="alert"><div className="repo-sync-error-heading"><span>Sync failed</span><b>Needs attention</b></div><strong>{explainSyncError(repo.error).cause}</strong><p>{explainSyncError(repo.error).next}</p><details><summary>Git error details</summary><pre>{repo.error}</pre></details><div className="repo-sync-error-actions"><button type="button" onClick={() => void retrySync('all')} disabled={busy}>{busy ? 'Retrying…' : 'Retry full sync'}</button><button type="button" onClick={() => void retrySync('origin')} disabled={busy}>Try origin only</button><button type="button" onClick={() => void openRemote()} disabled={busy}>Open remote</button><button type="button" onClick={() => void copySyncError()}>{errorCopied ? 'Copied' : 'Copy error'}</button></div></section>}
        {repo.fetchMode === 'origin' && repo.status !== 'error' && <div className="repo-sync-mode-note">Synced from <code>origin</code> only. Other remotes and the all-tags fetch were skipped.</div>}
        {error && <div className="repo-changes-error" role="alert">{error}</div>}
        {confirmDiscard && <div className="repo-changes-confirm" role="alertdialog" aria-label="Confirm discard all changes"><strong>Discard all local changes?</strong><p>This permanently removes tracked edits and untracked files in this repository. Tags will be fetched afterward.</p><div><button type="button" onClick={() => setConfirmDiscard(false)} disabled={busy}>Cancel</button><button type="button" className="is-danger" onClick={() => void discardAll()} disabled={busy}>Discard and refetch tags</button></div></div>}
        {loading ? <div className="repo-changes-empty">Loading working tree…</div> : snapshot.files.length === 0 ? <div className="repo-changes-empty">No uncommitted file changes.</div> : <div className="repo-change-files">{snapshot.files.map((file) => {
          const isOpen = Boolean(expanded[file.path]);
          const lines = file.patch.split('\n');
          return <section className="repo-change-file" key={file.path}>
            <div className="repo-change-file-head"><button type="button" className="repo-change-toggle" onClick={() => setExpanded((current) => ({ ...current, [file.path]: !current[file.path] }))} aria-expanded={isOpen}><span>{isOpen ? '▾' : '▸'}</span><code title={file.path}>{file.path}</code><small>{file.untracked ? 'untracked' : file.status}</small><em>+{file.additions} −{file.deletions}</em></button><label className="repo-change-select" title="Include this file in the commit"><input type="checkbox" checked={selected.includes(file.path)} onChange={(event) => setSelected((items) => event.target.checked ? [...items, file.path] : items.filter((path) => path !== file.path))} />Commit</label><button type="button" className="repo-change-discard" disabled={busy} onClick={() => void discardFile(file)}>Discard</button></div>
            {isOpen && <pre className="repo-change-patch">{file.patch ? lines.map((line, index) => <span className={lineTone(line)} key={`${index}-${line}`}>{line || ' '}{'\n'}</span>) : <span>Diff unavailable for this file.</span>}</pre>}
          </section>;
        })}</div>}
      </div>
      <footer className="repo-changes-footer">
        {confirmDiscard ? <span>Confirm the discard above to continue.</span> : <><button type="button" className="repo-changes-discard-all" onClick={() => setConfirmDiscard(true)} disabled={busy || snapshot.files.length === 0}>Discard all</button><div className="repo-changes-commit"><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Commit message" aria-label="Commit message" disabled={busy || selected.length === 0} /><button type="button" onClick={() => void commit()} disabled={busy || selected.length === 0 || !message.trim()}>{busy ? 'Working…' : `Commit ${selected.length ? `(${selected.length})` : ''}`}</button></div></>}
      </footer>
    </aside>
  </>;
}
