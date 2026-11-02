import React, { useEffect, useRef, useState } from 'react';
import type { DeploymentMapping, DeploymentTagComparison, KubeDeploymentSummary, PR, RepoState } from '../../core/types.js';

export type MappingReportRow = {
  mapping: DeploymentMapping;
  deployment?: KubeDeploymentSummary;
  lastReleaseDeployment?: KubeDeploymentSummary;
  repo?: RepoState;
  comparison?: DeploymentTagComparison;
  prs?: PR[];
  prLoading?: boolean;
  prError?: string;
  prHasMore?: boolean;
};

export type MappingReportDomain = { id: string; name: string };

export interface MappingReportSnapshot {
  tabId: string;
  title: string;
  domains: MappingReportDomain[];
  hasLastReleaseContext: boolean;
  rows: MappingReportRow[];
}

type ReportColumnId = 'domain' | 'deployment' | 'repo' | 'image' | 'last-release' | 'latest' | 'needed' | 'changes' | 'prs' | 'sync' | 'status' | 'comments';
type ReportColumn = { id: ReportColumnId; label: string };

const REPORT_COLUMNS: ReportColumn[] = [
  { id: 'domain', label: 'Domain' },
  { id: 'deployment', label: 'Deployment' },
  { id: 'repo', label: 'Container' },
  { id: 'last-release', label: 'Last release' },
  { id: 'image', label: 'Current release' },
  { id: 'latest', label: 'Latest Git tag' },
  { id: 'needed', label: 'Deployment needed' },
  { id: 'changes', label: 'Changes' },
  { id: 'prs', label: 'PRs' },
  { id: 'sync', label: 'Sync' },
  { id: 'status', label: 'Status' },
  { id: 'comments', label: 'Comments' },
];
const DEFAULT_VISIBLE_COLUMNS: ReportColumnId[] = ['domain', 'repo', 'image', 'last-release', 'needed', 'status', 'comments'];

function imageTag(image?: string): string {
  const withoutDigest = (image ?? '').split('@')[0] ?? '';
  const tail = withoutDigest.split('/').at(-1) ?? '';
  const colon = tail.lastIndexOf(':');
  return colon < 0 ? '' : tail.slice(colon + 1);
}

function normalizedVersion(value: string): string {
  return value.trim().replace(/^v/i, '').toLowerCase();
}

function syncLabel(row: MappingReportRow): string {
  if (row.mapping.noRepo) return '✓ Mapped';
  if (!row.mapping.repoPath) return 'Unmapped';
  if (!row.comparison) return 'Unknown';
  if (row.comparison.status === 'error') return 'Check failed';
  if (row.comparison.status === 'changed') return 'Changed';
  if (row.comparison.status === 'not-synced') return 'Not synced';
  if (row.comparison.status === 'synced') return '✓ Synced';
  return 'Unknown';
}

function isNewDeployment(row: MappingReportRow, hasLastReleaseContext: boolean): boolean {
  return hasLastReleaseContext && !imageTag(row.lastReleaseDeployment?.image);
}

function deploymentNeeded(row: MappingReportRow, hasLastReleaseContext: boolean): 'Yes' | 'No' | '—' {
  if (isNewDeployment(row, hasLastReleaseContext)) return 'Yes';
  const currentImageVersion = row.mapping.imageVersionOverride?.trim() || imageTag(row.deployment?.image);
  const lastDeploymentVersion = imageTag(row.lastReleaseDeployment?.image);
  if (!currentImageVersion || !lastDeploymentVersion) return '—';
  return normalizedVersion(currentImageVersion) === normalizedVersion(lastDeploymentVersion) ? 'No' : 'Yes';
}

function changeLabel(row: MappingReportRow): string {
  const comparison = row.comparison;
  if (row.mapping.noRepo || !comparison) return '—';
  if (comparison.error) return 'Check failed';
  if (comparison.count === 0) return '0';
  return [comparison.baseAheadCount ? `${comparison.baseAheadCount} ahead` : '', comparison.baseBehindCount ? `${comparison.baseBehindCount} behind` : ''].filter(Boolean).join(' · ') || '—';
}

function ColumnMenu({ visible, onToggle }: { visible: Set<ReportColumnId>; onToggle: (id: ReportColumnId) => void }) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeWhenClickedOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) menuRef.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', closeWhenClickedOutside);
    return () => document.removeEventListener('pointerdown', closeWhenClickedOutside);
  }, []);

  return <details ref={menuRef} className="mapping-checkbox-filter mapping-report-column-menu">
    <summary>Columns · {visible.size}</summary>
    <div className="mapping-checkbox-filter-menu" role="group" aria-label="Visible report columns">
      {REPORT_COLUMNS.map((column) => <label key={column.id}>
        <input type="checkbox" checked={visible.has(column.id)} onChange={() => onToggle(column.id)} />{column.label}
      </label>)}
    </div>
  </details>;
}

export function MappingReport({ title, domains, hasLastReleaseContext, rows, onSaveComment }: MappingReportSnapshot & { onSaveComment: (mappingId: string, comment: string) => void }) {
  const [reportType, setReportType] = useState<'table'>('table');
  const [visibleColumns, setVisibleColumns] = useState<Set<ReportColumnId>>(() => new Set(DEFAULT_VISIBLE_COLUMNS));
  const [commentMapping, setCommentMapping] = useState<MappingReportRow | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const copyMenuRef = useRef<HTMLDetailsElement>(null);
  const visible = REPORT_COLUMNS.filter((column) => visibleColumns.has(column.id));
  const show = (id: ReportColumnId) => visibleColumns.has(id);
  const openCommentDrawer = (row: MappingReportRow) => {
    setCommentMapping(row);
    setCommentDraft(row.mapping.reportComment ?? '');
  };
  const knownDomainIds = new Set(domains.map((domain) => domain.id));
  const groups = [
    ...domains.map((domain) => ({ ...domain, rows: rows.filter((row) => (row.mapping.domainIds ?? []).includes(domain.id)) })),
    { id: 'unassigned', name: 'Unassigned', rows: rows.filter((row) => !(row.mapping.domainIds ?? []).some((id) => knownDomainIds.has(id))) },
  ];
  const getColumnValue = (row: MappingReportRow, columnId: ReportColumnId, domainName: string, rowNumber: number): string => {
    const deployed = row.mapping.imageVersionOverride?.trim() || imageTag(row.deployment?.image) || row.comparison?.deployedTag || '';
    const lastRelease = imageTag(row.lastReleaseDeployment?.image);
    const latest = row.comparison?.latestTag || row.repo?.latestVersion || '';
    const isNew = isNewDeployment(row, hasLastReleaseContext);
    switch (columnId) {
      case 'domain': return domainName;
      case 'deployment': return row.mapping.deployment || 'Select deployment';
      case 'repo': return row.mapping.noRepo ? 'No repo for this' : row.repo?.name ?? (row.mapping.repoPath ? row.mapping.repoPath.split(/[\\/]/).pop() ?? 'Not mapped' : 'Not mapped');
      case 'last-release': return lastRelease || '—';
      case 'image': return deployed || '—';
      case 'latest': return latest || '—';
      case 'needed': return deploymentNeeded(row, hasLastReleaseContext);
      case 'changes': return changeLabel(row);
      case 'prs':
        if (row.prLoading) return 'Loading…';
        if (row.prError) return 'PR lookup unavailable';
        return row.prs?.length ? row.prs.map((pr) => `[${`#${pr.number} ${pr.title}`}](${pr.url})`).join('<br>') : '—';
      case 'sync': return syncLabel(row);
      case 'status': return '';
      case 'comments': return [isNew ? 'NEW' : '', row.mapping.reportComment ?? ''].filter(Boolean).join(' — ');
      default: return String(rowNumber);
    }
  };
  const escapeMarkdownCell = (value: string) => value.replace(/\|/g, '\\\|').replace(/\r?\n/g, '<br>');
  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const copyMarkdownTable = async () => {
    const headers = ['#', ...visible.map((column) => column.label)];
    const markdownRows = [
      `| ${headers.map(escapeMarkdownCell).join(' | ')} |`,
      `| ${headers.map(() => '---').join(' | ')} |`,
    ];
    const htmlRows = [`<table border="1" cellpadding="4" cellspacing="0"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>`];
    let rowNumber = 0;
    groups.forEach((group) => {
      if (!group.rows.length) {
        const emptyIndex = visible.findIndex((column) => column.id !== 'domain');
        const values = ['—', ...visible.map((column, index) => {
          if (column.id === 'domain') return group.name;
          return index === emptyIndex ? 'No mappings' : '';
        })];
        if (visible.length === 0) values[0] = '— No mappings';
        else if (emptyIndex < 0) values[1] = `${group.name} — No mappings`;
        markdownRows.push(`| ${values.map(escapeMarkdownCell).join(' | ')} |`);
        htmlRows.push(`<tr>${visible.length === 0 ? '<td>— No mappings</td>' : `<td>—</td>${visible.map((column, index) => {
          if (column.id === 'domain') return `<td>${escapeHtml(group.name)}${emptyIndex < 0 ? '<br>No mappings' : ''}</td>`;
          if (index === emptyIndex) return `<td colspan="${Math.max(1, visible.length - Number(show('domain')))}">No mappings</td>`;
          return '';
        }).join('')}`}</tr>`);
        return;
      }
      group.rows.forEach((row, groupIndex) => {
        rowNumber += 1;
        const values = [String(rowNumber), ...visible.map((column) => column.id === 'domain' && groupIndex > 0
          ? ''
          : getColumnValue(row, column.id, group.name, rowNumber))];
        markdownRows.push(`| ${values.map(escapeMarkdownCell).join(' | ')} |`);
        const cells = visible.map((column) => {
          if (column.id === 'domain') {
            return groupIndex === 0 ? `<td rowspan="${group.rows.length}">${escapeHtml(group.name)}</td>` : '';
          }
          if (column.id === 'prs') {
            const content = row.prLoading ? 'Loading…'
              : row.prError ? 'PR lookup unavailable'
                : row.prs?.length ? row.prs.map((pr) => `<a href="${escapeHtml(pr.url)}">#${pr.number} ${escapeHtml(pr.title)}</a>`).join('<br>')
                  : '—';
            return `<td>${content}</td>`;
          }
          const content = getColumnValue(row, column.id, group.name, rowNumber);
          return `<td>${escapeHtml(content).replace(/\r?\n/g, '<br>')}</td>`;
        }).join('');
        htmlRows.push(`<tr><td>${rowNumber}</td>${cells}</tr>`);
      });
    });
    htmlRows.push('</tbody></table>');
    try {
      const markdown = markdownRows.join('\n');
      const html = htmlRows.join('');
      if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
        })]);
      } else {
        await navigator.clipboard.writeText(markdown);
      }
      setCopyMessage('Copied report table');
    } catch {
      try {
        await navigator.clipboard.writeText(markdownRows.join('\n'));
        setCopyMessage('Copied Markdown table');
      } catch {
        setCopyMessage('Could not copy table');
      }
    }
    copyMenuRef.current?.removeAttribute('open');
    window.setTimeout(() => setCopyMessage(''), 1800);
  };
  let serial = 0;

  return <section className="mapping-report" aria-label={`${title} deployment mapping report`}>
    <div className="mapping-report-tools">
      <label className="mapping-report-type"><span>Report type</span><select value={reportType} onChange={(event) => setReportType(event.target.value as 'table')}><option value="table">Table</option></select></label>
      <details ref={copyMenuRef} className="mapping-checkbox-filter mapping-report-copy-menu">
        <summary>Copy</summary>
        <div className="mapping-checkbox-filter-menu" role="menu"><button type="button" role="menuitem" onClick={() => void copyMarkdownTable()}>Markdown table</button></div>
      </details>
      <span className="mapping-report-copy-message" aria-live="polite">{copyMessage}</span>
      <ColumnMenu visible={visibleColumns} onToggle={(id) => setVisibleColumns((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    })} />
    </div>
    <div className="mapping-report-table-wrap">
      <table className="mapping-report-table">
        <thead><tr><th className="mapping-report-number">#</th>{visible.map((column) => <th className={`mapping-report-col-${column.id}`} key={column.id}>{column.label}</th>)}</tr></thead>
        <tbody>{groups.map((group) => group.rows.length === 0
          ? <tr key={`empty-${group.id}`} className="mapping-report-empty-row">
            <td className="mapping-report-number">—</td>
            {show('domain') && <td className="mapping-report-domain mapping-report-col-domain">{group.name}</td>}
            <td colSpan={Math.max(1, visible.length - Number(show('domain')))} className="mapping-report-empty">No mappings</td>
          </tr>
          : group.rows.map((row, groupIndex) => {
            serial += 1;
            const deployed = row.mapping.imageVersionOverride?.trim() || imageTag(row.deployment?.image) || row.comparison?.deployedTag || '';
            const lastRelease = imageTag(row.lastReleaseDeployment?.image);
            const latest = row.comparison?.latestTag || row.repo?.latestVersion || '';
            const sync = syncLabel(row);
            const syncClass = sync.toLowerCase().replaceAll(' ', '-').replace('✓-', '');
            const needed = deploymentNeeded(row, hasLastReleaseContext);
            const isNew = isNewDeployment(row, hasLastReleaseContext);
            return <tr key={`${group.id}-${row.mapping.id}`}>
              <td className="mapping-report-number">{serial}</td>
              {show('domain') && groupIndex === 0 && <td className="mapping-report-domain" rowSpan={group.rows.length}>{group.name}</td>}
              {show('deployment') && <td className="mapping-report-col-deployment"><strong>{row.mapping.deployment || 'Select deployment'}</strong></td>}
              {show('repo') && <td className="mapping-report-col-repo">{row.mapping.noRepo ? <span className="mapping-report-muted">No repo for this</span> : row.repo?.name ?? (row.mapping.repoPath ? row.mapping.repoPath.split(/[\\/]/).pop() : 'Not mapped')}</td>}
              {show('last-release') && <td className="mapping-report-mono mapping-report-col-last-release">{lastRelease || '—'}</td>}
              {show('image') && <td className="mapping-report-mono mapping-report-col-image">{deployed || '—'}</td>}
              {show('latest') && <td className="mapping-report-mono mapping-report-col-latest">{latest || '—'}</td>}
              {show('needed') && <td className="mapping-report-col-needed"><span className={`mapping-report-needed ${needed === '—' ? 'needed-unavailable' : `needed-${needed.toLowerCase()}`}`}>{needed}</span></td>}
              {show('changes') && <td className="mapping-report-changes mapping-report-col-changes">{changeLabel(row)}</td>}
              {show('prs') && <td className="mapping-report-prs mapping-report-col-prs">
                {row.prLoading ? <span className="mapping-report-muted">Loading…</span>
                  : row.prError ? <span className="mapping-report-muted" title={row.prError}>PR lookup unavailable</span>
                    : row.prs?.length ? <>{row.prs.map((pr) => <a className="mapping-report-pr-link" key={`${pr.repoName}-${pr.number}`} href={pr.url} title={pr.title} onClick={(event) => { event.preventDefault(); if (pr.url) void window.api.openUrl(pr.url); }}>#{pr.number} {pr.title}</a>)}{row.prHasMore && <small>More matching PRs may exist.</small>}</>
                      : <span className="mapping-report-muted">—</span>}
              </td>}
              {show('sync') && <td className="mapping-report-col-sync"><span className={`mapping-report-sync sync-${syncClass}`}>{sync}</span></td>}
              {show('status') && <td className="mapping-report-blank mapping-report-col-status" aria-label="Status"></td>}
              {show('comments') && <td className="mapping-report-comment-cell mapping-report-col-comments" aria-label={`Comment for ${row.mapping.deployment || 'deployment'}`} title="Double-click to add or edit a comment" onDoubleClick={() => openCommentDrawer(row)}>
                {isNew && <span className="mapping-report-new-label">NEW</span>}
                {row.mapping.reportComment && <span className="mapping-report-comment-text">{row.mapping.reportComment}</span>}
              </td>}
            </tr>;
          }))}</tbody>
      </table>
    </div>
    {commentMapping && <>
      <button type="button" className="dashboard-drawer-backdrop" aria-label="Close report comment editor" onClick={() => setCommentMapping(null)} />
      <aside className="dashboard-detail-drawer mapping-edit-drawer mapping-report-comment-drawer" role="dialog" aria-modal="true" aria-label="Edit report comment">
        <header className="dashboard-drawer-header"><div><span className="about-drawer-eyebrow">{commentMapping.mapping.deployment || 'Deployment'}</span><h2>{commentMapping.mapping.reportComment ? 'Edit comment' : 'Add comment'}</h2></div><button type="button" className="dashboard-drawer-close" aria-label="Close comment editor" onClick={() => setCommentMapping(null)}>×</button></header>
        <div className="dashboard-drawer-body mapping-edit-body"><label className="mapping-edit-field"><span>Comment</span><textarea autoFocus rows={8} value={commentDraft} placeholder="Add a report comment…" onChange={(event) => setCommentDraft(event.target.value)} /></label>{isNewDeployment(commentMapping, hasLastReleaseContext) && <p className="mapping-edit-help">NEW is shown automatically because this deployment has no previous image version.</p>}</div>
        <footer className="dashboard-drawer-footer"><button type="button" className="mapping-button secondary" onClick={() => setCommentMapping(null)}>Cancel</button><button type="button" className="mapping-button primary" onClick={() => { onSaveComment(commentMapping.mapping.id, commentDraft); setCommentMapping(null); }}>Save comment</button></footer>
      </aside>
    </>}
  </section>;
}
