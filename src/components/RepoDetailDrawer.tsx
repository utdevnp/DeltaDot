import { useEffect, useState } from 'react';
import type { RepoGitInfo, RepoState } from '../../core/types.js';

interface Props { repo: RepoState; base: string; release: string; onClose: () => void; onRemove: (repo: RepoState) => Promise<void>; }

function Fact({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className="dashboard-drawer-fact"><span>{label}</span><strong>{value || '—'}</strong></div>;
}

export function RepoDetailDrawer({ repo, base, release, onClose, onRemove }: Props) {
  const [remoteUrl, setRemoteUrl] = useState('');
  const [gitInfo, setGitInfo] = useState<RepoGitInfo | null>(null);
  const [gitInfoError, setGitInfoError] = useState('');
  const [loadingGitInfo, setLoadingGitInfo] = useState(true);
  const [removeStep, setRemoveStep] = useState<'closed' | 'confirm' | 'name'>('closed');
  const [removeName, setRemoveName] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [removing, setRemoving] = useState(false);
  const diffCommits = Array.isArray(repo.diffCommits) ? repo.diffCommits : [];
  const latestCommits = Array.isArray(repo.latestCommits) ? repo.latestCommits : [];
  const tags = Array.isArray(gitInfo?.tags) ? gitInfo.tags : [];
  const localBranches = Array.isArray(gitInfo?.localBranches) ? gitInfo.localBranches : [];
  const remoteBranches = Array.isArray(gitInfo?.remoteBranches) ? gitInfo.remoteBranches : [];
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (removeStep !== 'closed') {
        setRemoveStep('closed');
        setRemoveName('');
      } else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, removeStep]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => window.api.getRemoteUrl?.(repo.path)).then((url) => { if (active) setRemoteUrl(url || ''); }).catch(() => { if (active) setRemoteUrl(''); });
    return () => { active = false; };
  }, [repo.path]);

  const submitRemoval = async () => {
    if (removeName !== repo.name || removing) return;
    setRemoving(true);
    setRemoveError('');
    try {
      await onRemove(repo);
      setRemoveStep('closed');
      onClose();
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : String(error));
    } finally {
      setRemoving(false);
    }
  };
  useEffect(() => {
    let active = true;
    setLoadingGitInfo(true);
    setGitInfoError('');
    void Promise.resolve().then(() => window.api.getRepoGitInfo?.(repo.path)).then((info) => {
      if (active) {
        if (!info) throw new Error('Repository Git details are unavailable.');
        setGitInfo({
          ...info,
          localBranches: Array.isArray(info.localBranches) ? info.localBranches : [],
          remoteBranches: Array.isArray(info.remoteBranches) ? info.remoteBranches : [],
          tags: Array.isArray(info.tags) ? info.tags : [],
        });
      }
    }).catch((error: unknown) => {
      if (active) setGitInfoError(error instanceof Error ? error.message : String(error));
    }).finally(() => { if (active) setLoadingGitInfo(false); });
    return () => { active = false; };
  }, [repo.path]);

  return <>
    <button type="button" className="dashboard-drawer-backdrop" aria-label="Close repository details" onClick={onClose} />
    <aside className="dashboard-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="repo-detail-title">
      <div className="dashboard-drawer-header">
        <div><span className="dashboard-section-kicker">Repository details</span><h2 id="repo-detail-title">{repo.name}</h2></div>
        <button type="button" className="dashboard-drawer-close" onClick={onClose} aria-label="Close details">×</button>
      </div>
      <div className="dashboard-drawer-body">
        <div className="dashboard-drawer-hero"><span className={`dashboard-drawer-badge is-${repo.status === 'error' ? 'bad' : repo.status === 'behind' || repo.missingRelease ? 'warning' : 'good'}`}><span />{repo.missingRelease ? 'No release branch' : repo.status}</span><p>{repo.lastCommitMsg || 'No recent commit message available.'}</p></div>
        <div className="dashboard-drawer-facts is-grid">
          <Fact label="Current branch" value={gitInfo?.currentBranch || repo.currentBranch} />
          <Fact label="Latest version" value={tags[0]?.name || repo.latestVersion} />
          <Fact label="HEAD commit" value={gitInfo?.headCommit} />
          <Fact label="HEAD date" value={gitInfo?.headDate ? new Date(gitInfo.headDate).toLocaleString() : ''} />
        </div>
        <details className="repo-detail-panel"><summary>Sync and local status <span>Details</span></summary><div className="dashboard-drawer-facts is-grid">
          <Fact label="Configured base" value={base} />
          <Fact label="Configured release" value={repo.missingRelease ? `${release} (missing)` : release} />
          <Fact label="Version date" value={repo.latestVersionDate} />
          <Fact label="Last commit age" value={repo.lastCommitAge} />
          <Fact label="Last commit author" value={repo.lastCommitAuthor} />
          <Fact label="Local changes" value={repo.localChangesCount} />
          <Fact label="Local commits ahead" value={repo.localCommitsCount} />
          <Fact label="Base ahead" value={repo.baseAheadCount} />
          <Fact label="Release ahead" value={repo.releaseAheadCount ?? diffCommits.length} />
          <Fact label="Fetch mode" value={repo.fetchMode} />
          <Fact label="Last synced" value={repo.lastSyncedAt ? new Date(repo.lastSyncedAt).toLocaleString() : ''} />
        </div></details>
        <section className="dashboard-drawer-section"><h3>Remote</h3><p className="dashboard-drawer-path">{remoteUrl || 'Remote URL unavailable'}</p></section>
        <details className="repo-detail-panel"><summary>Branches <span>{loadingGitInfo ? 'Loading…' : localBranches.length + remoteBranches.length}</span></summary>{loadingGitInfo ? <p className="dashboard-drawer-empty">Loading branches…</p> : gitInfoError ? <p className="dashboard-drawer-empty">{gitInfoError}</p> : <><h4>Local</h4><div className="dashboard-drawer-detail-list">{localBranches.length ? localBranches.map((branch) => <div key={`local-${branch}`}><span className="dashboard-drawer-detail-dot" />{branch}{branch === gitInfo?.currentBranch ? ' · current' : ''}</div>) : <div>No local branches.</div>}</div><h4>Remote</h4><div className="dashboard-drawer-detail-list">{remoteBranches.length ? remoteBranches.map((branch) => <div key={`remote-${branch}`}><span className="dashboard-drawer-detail-dot" />{branch}</div>) : <div>No remote branches found.</div>}</div></>}</details>
        <details className="repo-detail-panel"><summary>Git tags <span>{loadingGitInfo ? 'Loading…' : tags.length}</span></summary>{loadingGitInfo ? <p className="dashboard-drawer-empty">Fetching tags…</p> : gitInfoError ? <p className="dashboard-drawer-empty">Unable to load tags.</p> : tags.length ? <div className="dashboard-drawer-changes">{tags.map((tag) => <div className="dashboard-drawer-change" key={tag.name}><div className="dashboard-drawer-change-top"><code>{tag.name}</code><span>{tag.date ? new Date(tag.date).toLocaleDateString() : ''}</span></div><strong>{tag.subject || tag.commit}</strong></div>)}</div> : <p className="dashboard-drawer-empty">No Git tags found.</p>}</details>
        {repo.error && <div className="dashboard-drawer-error"><span>Sync error</span>{repo.error}</div>}
        <details className="repo-detail-panel"><summary>Commits in comparison <span>{diffCommits.length}</span></summary><div className="dashboard-drawer-changes">{diffCommits.length ? diffCommits.map((commit) => <div className="dashboard-drawer-change" key={commit.hash}><div className="dashboard-drawer-change-top"><code>{commit.hash}</code><span>{commit.age}</span></div><strong>{commit.message}</strong></div>) : <p className="dashboard-drawer-empty">No commits in the comparison.</p>}</div></details>
        <details className="repo-detail-panel"><summary>Recent commits <span>{latestCommits.length}</span></summary><div className="dashboard-drawer-changes">{latestCommits.length ? latestCommits.map((commit) => <div className="dashboard-drawer-change" key={commit.hash}><div className="dashboard-drawer-change-top"><code>{commit.hash}</code><span>{commit.age}</span></div><strong>{commit.subject}</strong></div>) : <p className="dashboard-drawer-empty">No recent commits available.</p>}</div></details>
        <div className="dashboard-drawer-path">{repo.path}</div>
        <section className="repo-remove-section"><h3>Remove repository folder</h3><p>This permanently deletes the local repository folder and its contents.</p><button type="button" className="repo-remove-trigger" onClick={() => { setRemoveError(''); setRemoveStep('confirm'); }}>Remove this folder</button></section>
      </div>
      <div className="dashboard-drawer-footer"><button type="button" className="dashboard-secondary-button" onClick={onClose}>Close</button></div>
      {removeStep !== 'closed' && <div className="repo-remove-overlay"><section className="repo-remove-dialog" role="alertdialog" aria-modal="true" aria-labelledby="repo-remove-title">
        <span className="dashboard-section-kicker">Remove repository folder</span>
        <h3 id="repo-remove-title">{removeStep === 'confirm' ? 'Are you sure?' : 'Confirm the repository name'}</h3>
        {removeStep === 'confirm' ? <><p>This permanently deletes <strong>{repo.path}</strong> and all files inside it from this computer.</p><div className="repo-remove-actions"><button type="button" onClick={() => setRemoveStep('closed')}>Cancel</button><button type="button" className="is-danger" onClick={() => { setRemoveStep('name'); setRemoveName(''); }}>Yes, continue</button></div></> : <><p>Type <code>{repo.name}</code> exactly to enable folder removal.</p><input autoFocus value={removeName} onChange={(event) => setRemoveName(event.target.value)} aria-label={`Type ${repo.name} to confirm`} placeholder={repo.name} /><div className="repo-remove-actions"><button type="button" onClick={() => { setRemoveStep('closed'); setRemoveName(''); }} disabled={removing}>Cancel</button><button type="button" className="is-danger" onClick={() => void submitRemoval()} disabled={removeName !== repo.name || removing}>{removing ? 'Removing…' : 'Remove folder'}</button></div>{removeError && <p className="repo-remove-error" role="alert">{removeError}</p>}</>}
      </section></div>}
    </aside>
  </>;
}
