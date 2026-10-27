import React, { useEffect, useState } from 'react';
import type { ForceFetchPreflight, ForceFetchProgress, RepoState } from '../../core/types.js';

type StepId = 'check' | 'remote' | 'local' | 'clone' | 'sync' | 'replace' | 'prs';
type StepState = { id: StepId; label: string; status: 'pending' | 'running' | 'success' | 'error'; message: string };
type CompleteResult = { openPRCount: number | string | null; error?: string };

interface Props {
  repo: RepoState;
  base: string;
  release: string;
  onClose: () => void;
  onComplete: (repo: RepoState) => Promise<CompleteResult>;
}

const initialSteps: StepState[] = [
  { id: 'check', label: 'Check repository folder', status: 'pending', message: 'Waiting for preflight…' },
  { id: 'remote', label: 'Find origin URL', status: 'pending', message: 'Waiting for preflight…' },
  { id: 'local', label: 'Inspect local commits and changes', status: 'pending', message: 'Waiting for preflight…' },
  { id: 'clone', label: 'Clone fresh copy to a temporary folder', status: 'pending', message: 'Waiting for confirmation…' },
  { id: 'sync', label: 'Fetch tags and compare branches', status: 'pending', message: 'Waiting for clone…' },
  { id: 'replace', label: 'Replace current clone', status: 'pending', message: 'Waiting for validation…' },
  { id: 'prs', label: 'Refresh pull request count', status: 'pending', message: 'Waiting for replacement…' },
];

function displayTime(value?: string) {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ForceFetchDrawer({ repo, base, release, onClose, onComplete }: Props) {
  const [width, setWidth] = useState(760);
  const [preflight, setPreflight] = useState<ForceFetchPreflight | null>(null);
  const [steps, setSteps] = useState<StepState[]>(initialSteps);
  const [inspecting, setInspecting] = useState(true);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [resultRepo, setResultRepo] = useState<RepoState | null>(null);
  const [openPRCount, setOpenPRCount] = useState<number | string | null>(null);
  const [prError, setPRError] = useState('');
  const [operationError, setOperationError] = useState('');

  const updateStep = (id: StepId, status: StepState['status'], message: string) => {
    setSteps((current) => current.map((step) => step.id === id ? { ...step, status, message } : step));
  };

  useEffect(() => {
    let cancelled = false;
    const inspect = async () => {
      setSteps((current) => current.map((step) => step.id === 'check' ? { ...step, status: 'running', message: `Checking ${repo.path}…` } : step));
      try {
        const info = await window.api.inspectForceFetch(repo.path);
        if (cancelled) return;
        setPreflight(info);
        setSteps((current) => current.map((step) => {
          if (step.id === 'check') return { ...step, status: info.exists ? 'success' : 'error', message: info.exists ? 'Repository folder exists and is a Git working tree.' : info.error || 'Repository folder was not found.' };
          if (step.id === 'remote') return { ...step, status: info.remoteUrl ? 'success' : 'error', message: info.remoteUrl ? `Origin: ${info.remoteUrl}` : info.error || 'Could not read the origin URL.' };
          if (step.id === 'local') return { ...step, status: info.error && info.remoteUrl ? 'error' : info.remoteUrl ? 'success' : 'pending', message: info.remoteUrl ? (info.error || `${info.commitsAhead ?? 'Unknown'} local-only commits; ${info.files.length} changed files.`) : 'Not inspected because repository or remote validation failed.' };
          return step;
        }));
        if (!info.exists || !info.remoteUrl || info.error) setOperationError(info.error || 'Repository preflight failed.');
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setOperationError(message);
        setSteps((current) => current.map((step) => step.id === 'check' ? { ...step, status: 'error', message } : step));
      } finally { if (!cancelled) setInspecting(false); }
    };
    void inspect();
    return () => { cancelled = true; };
  }, [repo.path]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !running) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, onClose]);

  const resizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => setWidth(Math.max(520, Math.min(window.innerWidth * 0.94, window.innerWidth - moveEvent.clientX)));
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  const runForceFetch = async () => {
    if (!preflight?.remoteUrl || !preflight.exists || inspecting || running) return;
    setRunning(true);
    setFinished(false);
    setOperationError('');
    setPRError('');
    setResultRepo(null);
    setSteps((current) => current.map((step) => step.id === 'clone' || step.id === 'sync' || step.id === 'replace' || step.id === 'prs'
      ? { ...step, status: 'pending', message: step.id === 'clone' ? 'Starting…' : 'Waiting…' }
      : step));
    try {
      const operationId = crypto.randomUUID();
      const refreshed = await window.api.forceReplaceRepo(operationId, repo.path, preflight.remoteUrl, base, release, (progress: ForceFetchProgress) => {
        updateStep(progress.step, progress.status, progress.message);
      });
      setResultRepo(refreshed);
      updateStep('prs', 'running', 'Loading open pull requests for this repository…');
      try {
        const prResult = await onComplete(refreshed);
        setOpenPRCount(prResult.openPRCount);
        if (prResult.error) {
          setPRError(prResult.error);
          updateStep('prs', 'error', prResult.error);
        } else {
          updateStep('prs', 'success', `Open PR count refreshed: ${prResult.openPRCount ?? 'unavailable'}.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setPRError(message);
        updateStep('prs', 'error', message);
      }
      setFinished(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOperationError(message);
      setFinished(true);
      setSteps((current) => {
        const failedIndex = current.findIndex((step) => step.status === 'running');
        if (failedIndex < 0) return current;
        return current.map((step, index) => index === failedIndex ? { ...step, status: 'error', message } : step);
      });
    } finally { setRunning(false); }
  };

  const localCommitCount = preflight?.commitsAhead;
  const canConfirm = Boolean(preflight?.exists && preflight.remoteUrl && !preflight.error && !inspecting && !running);

  return <>
    <button type="button" className="repo-changes-backdrop" onClick={() => { if (!running) onClose(); }} disabled={running} aria-label="Close Force Fetch drawer" />
    <aside className="repo-changes-drawer force-fetch-drawer" style={{ width }} role="dialog" aria-modal="true" aria-labelledby="force-fetch-title" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="repo-changes-resize" onPointerDown={resizeStart} aria-label="Resize drawer" title="Drag to resize" />
      <header className="repo-changes-header"><div><span className="dashboard-section-kicker">Repository replacement</span><h2 id="force-fetch-title">Force Fetch · {repo.name}</h2><code>{repo.path}</code></div><button type="button" className="dashboard-drawer-close" onClick={onClose} disabled={running} aria-label="Close drawer">×</button></header>

      <div className="repo-changes-body force-fetch-body">
        <section className="force-fetch-warning"><strong>Replace this repository with a clean remote clone?</strong><p>The existing folder will be replaced after the fresh clone and branch comparison succeed. Local-only commits and uncommitted changes listed below will be removed from this working copy.</p></section>

        {!finished && <section className="force-fetch-preflight">
          <div className="force-fetch-section-title">Before you confirm</div>
          {inspecting && <div className="force-fetch-inspecting">Inspecting repository, remote, commits, and files…</div>}
          {preflight && <>
            <div className="force-fetch-remote"><span>Origin</span><code>{preflight.remoteUrl || 'Unavailable'}</code></div>
            <div className="force-fetch-local-summary">
              <div><b>{localCommitCount ?? '—'}</b><span>local-only commits*</span></div>
              <div><b>{preflight.files.length}</b><span>changed files</span></div>
            </div>
            {localCommitCount === null && <p className="force-fetch-unknown">Could not compare commits with an upstream branch. Local commits may exist and will be discarded by replacement.</p>}
            {localCommitCount === 0 && <p className="force-fetch-safe">No local-only commits were found against the last fetched upstream.</p>}
            {localCommitCount !== null && localCommitCount > 0 && <p className="force-fetch-unknown">Commit comparison is based on the last fetched upstream state; these commits will be removed from this working copy.</p>}
            {preflight.aheadCommits.length > 0 && <div className="force-fetch-items"><strong>Local-only commits that will be removed</strong>{preflight.aheadCommits.map((commit) => <div key={commit.hash}><code>{commit.hash}</code><span>{commit.subject}</span></div>)}{(localCommitCount ?? 0) > preflight.aheadCommits.length && <small>Showing {preflight.aheadCommits.length} of {localCommitCount} local-only commits.</small>}</div>}
            {preflight.files.length > 0 && <div className="force-fetch-items force-fetch-file-list"><strong>Uncommitted files that will be removed</strong>{preflight.files.slice(0, 12).map((file) => <div key={file.path}><code>{file.status}</code><span>{file.path}</span></div>)}{preflight.files.length > 12 && <small>And {preflight.files.length - 12} more changed files.</small>}</div>}
          </>}
          {operationError && !finished && <div className="repo-changes-error" role="alert">{operationError}</div>}
        </section>}

        <section className="force-fetch-steps" aria-live="polite">
          <div className="force-fetch-section-title">Operation log</div>
          {steps.map((step) => <div key={step.id} className={`force-fetch-step is-${step.status}`}>
            <span className="force-fetch-step-icon" aria-hidden="true">{step.status === 'success' ? '✓' : step.status === 'error' ? '!' : step.status === 'running' ? '◌' : '·'}</span>
            <div><strong>{step.label}</strong><p>{step.message}</p></div>
          </div>)}
        </section>

        {operationError && finished && <div className="force-fetch-final-error" role="alert"><strong>Force Fetch failed</strong><p>{operationError}</p><span>The original clone remains in place unless the log shows that replacement succeeded.</span></div>}
        {finished && resultRepo && <section className="force-fetch-success">
          <h3>{operationError ? 'Clone replaced; later step needs attention' : 'Force Fetch complete'}</h3>
          <div className="force-fetch-success-grid">
            <div><span>Open PRs</span><b>{openPRCount ?? 'Unavailable'}</b></div>
            <div><span>{base} ahead of {release}</span><b>{resultRepo.baseAheadCount ?? '—'}</b></div>
            <div><span>{release} ahead of {base}</span><b>{resultRepo.releaseAheadCount ?? resultRepo.diffCommits.length}</b></div>
            <div><span>Last updated</span><b>{displayTime(resultRepo.lastSyncedAt)}</b></div>
            <div className="force-fetch-success-wide"><span>Latest commit</span><b>{resultRepo.lastCommitMsg || 'No commit information'}</b></div>
            <div><span>Latest tag</span><b>{resultRepo.latestVersion || '—'}</b></div>
          </div>
          {prError && <p className="force-fetch-pr-warning">Clone and branch refresh succeeded, but PR count could not be refreshed: {prError}</p>}
        </section>}
      </div>

      <footer className="repo-changes-footer force-fetch-footer">
        {finished && !operationError ? <button type="button" className="repo-changes-primary-action" onClick={onClose}>Done</button>
          : finished && operationError ? <><button type="button" onClick={onClose}>Close</button><button type="button" className="repo-changes-danger-action" onClick={() => { setFinished(false); void runForceFetch(); }} disabled={!preflight?.remoteUrl}>Try again</button></>
            : <><button type="button" onClick={onClose} disabled={running}>Cancel</button><button type="button" className="repo-changes-danger-action" onClick={() => void runForceFetch()} disabled={!canConfirm}>{running ? 'Replacing…' : 'Yes, replace clone'}</button></>}
      </footer>
    </aside>
  </>;
}
