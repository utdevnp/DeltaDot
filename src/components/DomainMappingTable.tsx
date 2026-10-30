import React, { useId, useMemo, useState } from 'react';
import type { DeploymentMapping, DeploymentMappingDomain, DeploymentTagComparison, KubeDeploymentSummary, RepoState } from '../../core/types.js';
import { timeAgo } from '../../core/utils.js';

type DeploymentOption = KubeDeploymentSummary & { context: string };
type Option = { value: string; label: string };
type DomainGroup = { id: string; name: string; mappings: DeploymentMapping[]; total: number };

function SearchableSelect({ label, value, options, placeholder, onChange }: { label: string; value: string; options: Option[]; placeholder: string; onChange: (value: string) => void }) {
  const listId = useId();
  const selectedLabel = options.find((option) => option.value === value)?.label ?? '';
  const [query, setQuery] = useState(selectedLabel);
  React.useEffect(() => setQuery(selectedLabel), [selectedLabel]);
  return <>
    <input aria-label={label} list={listId} value={query} placeholder={placeholder} onChange={(event) => {
      const next = event.target.value;
      setQuery(next);
      const match = options.find((option) => option.label.toLowerCase() === next.trim().toLowerCase());
      if (match) onChange(match.value);
    }} onBlur={() => {
      const match = options.find((option) => option.label.toLowerCase() === query.trim().toLowerCase());
      if (!match) setQuery(selectedLabel);
    }} />
    <datalist id={listId}>{options.map((option) => <option key={option.value} value={option.label} />)}</datalist>
  </>;
}

function DomainChoices({ domains, selectedIds, onChange }: { domains: DeploymentMappingDomain[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  if (!domains.length) return <span className="mapping-muted">No domains yet</span>;
  return <div className="mapping-domain-choices">{domains.map((domain) => {
    const selected = selectedIds.includes(domain.id);
    return <button key={domain.id} type="button" className={`mapping-domain-chip ${selected ? 'is-selected' : ''}`} aria-pressed={selected}
      onClick={() => onChange(selected ? selectedIds.filter((id) => id !== domain.id) : [...selectedIds, domain.id])}>{domain.name}</button>;
  })}</div>;
}

function imageTag(image: string): string {
  const withoutDigest = image.split('@')[0] ?? '';
  const tail = withoutDigest.split('/').at(-1) ?? '';
  const colon = tail.lastIndexOf(':');
  return colon < 0 ? '' : tail.slice(colon + 1);
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '').toLowerCase();
}

function imageAge(deployment?: DeploymentOption): string {
  const timestamp = deployment?.lastUpdated || deployment?.createdAt;
  return timestamp ? timeAgo(timestamp).replace(/^(\d+)(mo|[smhdwy])$/, '$1 $2') : '';
}

function inferredRepo(deployment: DeploymentOption, repos: RepoState[]): string {
  const tail = deployment.image.split('@')[0]?.split('/').at(-1)?.replace(/:[^:]*$/, '') ?? '';
  return repos.find((repo) => repo.name.toLowerCase() === deployment.name.toLowerCase())?.path
    ?? repos.find((repo) => repo.name.toLowerCase() === tail.toLowerCase())?.path ?? '';
}

interface Props {
  domains: DeploymentMappingDomain[];
  selectedDomainIds: string[] | null;
  mappings: DeploymentMapping[];
  allContextMappings: DeploymentMapping[];
  deployments: DeploymentOption[];
  repos: RepoState[];
  comparisons: Record<string, DeploymentTagComparison | null>;
  editing: boolean;
  syncing: boolean;
  releaseBranch: string;
  selectedMappingId: string;
  copiedValueId: string;
  draggedId: string;
  onSelect: (id: string) => void;
  onPatch: (id: string, values: Partial<DeploymentMapping>) => void;
  onMove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onRemove: (id: string) => void;
  onContextMenu: (mapping: DeploymentMapping, x: number, y: number) => void;
  onCopyVersion: (id: string, value: string) => void;
  onOpenGitDiff: (mapping: DeploymentMapping) => void;
  onAddMapping: () => void;
}

export function DomainMappingTable({ domains, selectedDomainIds, mappings, allContextMappings, deployments, repos, comparisons, editing, syncing, releaseBranch, selectedMappingId, copiedValueId, draggedId, onSelect, onPatch, onMove, onDragStart, onDragEnd, onRemove, onContextMenu, onCopyVersion, onOpenGitDiff, onAddMapping }: Props) {
  const groups = useMemo<DomainGroup[]>(() => {
    const knownIds = new Set(domains.map((domain) => domain.id));
    const totalForDomain = (domainId: string) => allContextMappings.filter((mapping) => (mapping.domainIds ?? []).includes(domainId)).length;
    const domainGroups = domains.map((domain) => ({
      id: domain.id,
      name: domain.name,
      mappings: mappings.filter((mapping) => (mapping.domainIds ?? []).includes(domain.id)),
      total: totalForDomain(domain.id),
    }));
    const isUnassigned = (mapping: DeploymentMapping) => !(mapping.domainIds ?? []).some((id) => knownIds.has(id));
    return [...domainGroups, {
      id: 'unassigned',
      name: 'Unassigned',
      mappings: mappings.filter(isUnassigned),
      total: allContextMappings.filter(isUnassigned).length,
    }];
  }, [domains, mappings, allContextMappings]);
  const visibleGroups = selectedDomainIds === null ? groups : groups.filter((group) => selectedDomainIds.includes(group.id));

  const columnSpan = editing ? 9 : 6;
  let serial = 0;

  return <div className="table-container mapping-table-wrap domain-mapping-table-wrap">
    <table className="domain-mapping-table">
      <thead><tr>
        <th className="mapping-column-number">#</th>
        <th className="domain-mapping-domain-column">DOMAIN</th>
        <th className="mapping-column-deployment">DEPLOYMENT</th>
        <th className="mapping-column-repo">GIT REPOSITORY</th>
        {editing && <><th className="mapping-column-no-repo">NO REPO</th><th className="mapping-column-domains">DOMAINS</th></>}
        <th className="mapping-column-image">DEPLOYED IMAGE</th>
        <th className="mapping-column-latest">LATEST GIT TAG</th>
        <th className="mapping-column-changes">CHANGES</th>
        <th className="mapping-column-status">STATUS</th>
        {editing && <th className="mapping-column-actions" />}
      </tr></thead>
      <tbody>{visibleGroups.map((group) => group.mappings.length === 0
        ? <tr key={`empty-${group.id}`} className="domain-mapping-empty-row">
          <td className="mapping-serial">—</td>
          <td className="domain-mapping-domain-cell">{group.name}</td>
          <td colSpan={columnSpan} className="domain-mapping-empty-message">{group.total ? 'No mappings match the current search and filters.' : 'No mappings'}</td>
        </tr>
        : group.mappings.map((mapping, groupIndex) => {
          serial += 1;
          const deployment = deployments.find((item) => item.context === mapping.context && item.namespace === mapping.namespace && item.name === mapping.deployment);
          const repo = repos.find((item) => item.path === mapping.repoPath);
          const deployed = mapping.imageVersionOverride?.trim() || (deployment ? imageTag(deployment.image) : '');
          const comparison = comparisons[mapping.id];
          const latest = comparison?.latestTag || repo?.latestVersion || '';
          const comparisonTag = comparison?.latestTag;
          const previousTag = comparison?.previousTag;
          const latestTag = comparisonTag || latest;
          const latestTagDate = comparison?.latestTag === latest ? comparison?.latestTagDate ?? repo?.latestVersionDate : repo?.latestVersionDate;
          const changes = comparison && !comparison.error ? comparison.count : undefined;
          const baseChanged = comparison?.status === 'changed';
          const imageOutOfSync = !!deployed && !!latest && normalizeVersion(deployed) !== normalizeVersion(latest);
          const dim = !editing && !!repo?.missingRelease && !syncing;
          const groupHasReleasedRepo = group.mappings.some((groupMapping) => {
            const groupRepo = repos.find((item) => item.path === groupMapping.repoPath);
            return !!groupRepo && !groupRepo.missingRelease;
          });
          const groupHasMissingReleaseRepo = group.mappings.some((groupMapping) => {
            const groupRepo = repos.find((item) => item.path === groupMapping.repoPath);
            return !!groupRepo?.missingRelease;
          });
          const dimDomain = !editing && !syncing && !groupHasReleasedRepo && groupHasMissingReleaseRepo;
          const age = imageAge(deployment);
          const status = mapping.noRepo ? <span className="mapping-status synced">✓ Mapped</span>
            : !mapping.repoPath ? <span className="mapping-status out-of-sync">Unmapped</span>
              : !comparison ? <span className="mapping-muted">—</span>
                : comparison.status === 'error' ? <span className="mapping-status out-of-sync" title={comparison.error ?? undefined}>Check failed</span>
                  : comparison.status === 'changed' ? <span className="mapping-status out-of-sync" title="The base branch and latest Git tag differ">Changed</span>
                    : comparison.status === 'not-synced' ? <span className="mapping-status out-of-sync">Not synced</span>
                      : comparison.status === 'synced' ? <span className="mapping-status synced">✓ Synced</span>
                        : <span className="mapping-status" title="A deployed image tag or latest Git tag is unavailable">Unknown</span>;
          const changeTitle = comparison?.error || (comparisonTag
            ? baseChanged ? `Compare ${comparisonTag} → ${comparison.checkedBranch} (press O)`
              : imageOutOfSync ? `Compare ${deployed} → ${latestTag} (press O)`
                : previousTag ? `Compare ${previousTag} → ${latestTag} (press O)`
                  : `Compare ${latestTag} → ${comparison?.checkedBranch} (press O)`
            : 'Press Refresh to calculate changes');
          return <tr key={`${group.id}-${mapping.id}`} className={`domain-mapping-row ${dim ? 'domain-mapping-row-release-missing' : ''} ${selectedMappingId === mapping.id ? 'mapping-row-selected' : ''} ${draggedId === mapping.id ? 'dragging' : ''}`} title={dim ? `Repository has no ${releaseBranch} branch` : undefined}
            draggable={editing} onClick={() => onSelect(mapping.id)} onDragStart={() => onDragStart(mapping.id)} onDragOver={(event) => { if (editing) event.preventDefault(); }} onDrop={() => onMove(mapping.id)} onDragEnd={onDragEnd}
            onContextMenu={(event) => { event.preventDefault(); onSelect(mapping.id); onContextMenu(mapping, Math.min(event.clientX, window.innerWidth - 180), Math.min(event.clientY, window.innerHeight - 50)); }}>
            <td className="mapping-serial">{serial}</td>
            {groupIndex === 0 && <td className="domain-mapping-domain-cell" style={dimDomain ? { opacity: 0.5 } : undefined} rowSpan={group.mappings.length}>{group.name}</td>}
            <td className="mapping-column-deployment">{editing
              ? <SearchableSelect label="Kubernetes deployment" value={deployment ? `${deployment.context}/${deployment.namespace}/${deployment.name}` : ''} placeholder="Search deployment…" options={deployments.map((item) => ({ value: `${item.context}/${item.namespace}/${item.name}`, label: item.name }))} onChange={(value) => { const selected = deployments.find((item) => `${item.context}/${item.namespace}/${item.name}` === value); if (selected) onPatch(mapping.id, { context: selected.context, namespace: 'default', deployment: selected.name, repoPath: mapping.repoPath || inferredRepo(selected, repos), imageVersionOverride: '' }); }} />
              : <strong className="domain-mapping-deployment">{mapping.deployment || 'Select deployment'}</strong>}</td>
            <td className="mapping-column-repo">{editing ? mapping.noRepo ? <span className="mapping-muted">—</span>
              : <SearchableSelect label="Git repository" value={mapping.repoPath} placeholder="Search repository…" options={repos.map((item) => ({ value: item.path, label: item.name }))} onChange={(value) => onPatch(mapping.id, { repoPath: value, noRepo: false })} />
              : mapping.noRepo ? <span className="mapping-no-repo-note">No repo for this</span>
                : repo?.name ?? (mapping.repoPath ? mapping.repoPath.split(/[\\/]/).pop() : null) ?? <span className="mapping-muted">Not mapped</span>}</td>
            {editing && <>
              <td className="mapping-column-no-repo"><input type="checkbox" aria-label={`No repository needed for ${mapping.deployment}`} checked={!!mapping.noRepo} onChange={(event) => onPatch(mapping.id, { noRepo: event.target.checked })} /></td>
              <td className="mapping-column-domains"><DomainChoices domains={domains} selectedIds={mapping.domainIds ?? []} onChange={(domainIds) => onPatch(mapping.id, { domainIds: domainIds.length ? domainIds : undefined })} /></td>
            </>}
            <td className={`mapping-column-image ${deployed ? 'mapping-version' : ''}`}>{editing
              ? <><input aria-label="Deployed image version override" placeholder={deployed || 'Image version override'} value={mapping.imageVersionOverride ?? ''} onChange={(event) => onPatch(mapping.id, { imageVersionOverride: event.target.value })} />{age && <small className="mapping-image-age">{age}</small>}</>
              : <><span>{deployed ? <button type="button" className={`mapping-copy-value ${copiedValueId === `${mapping.id}:deployed` ? 'is-copied' : ''}`} title={copiedValueId === `${mapping.id}:deployed` ? 'Copied to clipboard' : 'Click to copy deployed image version'} aria-label={`Copy deployed image version ${deployed}`} onClick={(event) => { event.stopPropagation(); onSelect(mapping.id); onCopyVersion(`${mapping.id}:deployed`, deployed); }}>{deployed}</button> : '—'}</span>{age && <small className="mapping-image-age" title={deployment?.lastUpdated || deployment?.createdAt}>· {age}</small>}</>}</td>
            <td className="mapping-column-latest mapping-latest"><strong title={latest || undefined}>{latest ? <button type="button" className={`mapping-copy-value ${copiedValueId === `${mapping.id}:latest` ? 'is-copied' : ''}`} title={copiedValueId === `${mapping.id}:latest` ? 'Copied to clipboard' : 'Click to copy latest Git tag'} aria-label={`Copy latest Git tag ${latest}`} onClick={(event) => { event.stopPropagation(); onSelect(mapping.id); onCopyVersion(`${mapping.id}:latest`, latest); }}>{latest}</button> : '—'}</strong><small title={latestTagDate ? new Date(latestTagDate).toLocaleString() : undefined}>{latestTagDate ? `${new Date(latestTagDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${timeAgo(latestTagDate)} ago` : 'Tag time unavailable'}</small></td>
            <td className={`mapping-column-changes ${changes != null && changes > 0 ? 'mapping-changes-out-of-sync' : ''}`} title={changeTitle}>
              {mapping.noRepo ? '—' : !comparison ? <span className="mapping-muted">—</span> : comparison.error ? <span className="mapping-status out-of-sync" title={comparison.error}>Check failed</span>
                : <button type="button" className="mapping-changes-link" aria-label={changes === 0 ? `Compare tags for ${repo?.name ?? mapping.deployment}` : `Open ${changes ?? 0} commits of difference for ${repo?.name ?? mapping.deployment}`} disabled={!comparisonTag && !latestTag} onClick={(event) => { event.stopPropagation(); onSelect(mapping.id); onOpenGitDiff(mapping); }}>{changes === 0 ? '0' : [comparison.baseAheadCount ? `${comparison.baseAheadCount} ahead` : '', comparison.baseBehindCount ? `${comparison.baseBehindCount} behind` : ''].filter(Boolean).join(' · ')}</button>}
            </td>
            <td className="mapping-column-status">{status}</td>
            {editing && <td className="mapping-column-actions"><div className="mapping-row-actions"><button type="button" className="mapping-drag" aria-label="Drag to reorder" title="Drag to reorder">⠿</button><button type="button" className="mapping-remove" aria-label="Remove mapping" onClick={(event) => { event.stopPropagation(); onRemove(mapping.id); }}>×</button></div></td>}
          </tr>;
        }))}</tbody>
    </table>
    {mappings.length === 0 && <div className="mapping-empty">{allContextMappings.length || groups.some((group) => group.total) ? 'No mappings match the current search and filter.' : 'No deployments found in this context’s default namespace.'}</div>}
    {editing && <button className="mapping-add domain-mapping-add" type="button" onClick={onAddMapping}>＋ Add deployment mapping</button>}
  </div>;
}
