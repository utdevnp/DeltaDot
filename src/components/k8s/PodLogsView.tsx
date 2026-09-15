import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { KubeWorkloadTab } from '../../../core/types.js';

type DownloadMode = 'visible' | 'entire';
type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'other';
const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug', 'trace', 'other'];
const LOG_LEVEL_LABELS: Record<LogLevel, string> = { error: 'Error', warn: 'Warn', info: 'Info', debug: 'Debug', trace: 'Trace', other: 'Other' };

function detectLogLevel(line: string): LogLevel {
  const structured = line.match(/(?:"level"|level)\s*[:=]\s*["']?(fatal|panic|error|err|warn(?:ing)?|info|debug|trace)/i)?.[1]?.toLowerCase();
  const value = structured || line.match(/\b(fatal|panic|error|err|warn(?:ing)?|info|debug|trace)\b/i)?.[1]?.toLowerCase();
  if (value === 'fatal' || value === 'panic' || value === 'error' || value === 'err') return 'error';
  if (value?.startsWith('warn')) return 'warn';
  if (value === 'info') return 'info';
  if (value === 'debug') return 'debug';
  if (value === 'trace') return 'trace';
  return 'other';
}
export interface PodLogsViewProps {
  tab: KubeWorkloadTab;
  onClose: () => void;
  onToggleWatch: (enabled: boolean) => void;
  onRefresh: () => void;
  onDownload: (mode: DownloadMode, content: string) => void;
  onClearLogs: () => void;
  onToggleWrap: (enabled: boolean) => void;
}

function DownloadIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
}

function MatchChevron({ direction }: { direction: 'up' | 'down' }) {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={direction === 'up' ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg>;
}

function ClearIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="m6 7 1 14h10l1-14" /><path d="M9 7V4h6v3" /></svg>;
}

function StreamIcon({ running }: { running: boolean }) {
  return running
    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
    : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7z" /></svg>;
}

function StreamDot({ status }: { status: NonNullable<KubeWorkloadTab['streamStatus']> }) {
  const color = status === 'connected' ? 'var(--accent-green)' : status === 'reconnecting' || status === 'connecting' ? 'var(--accent-yellow)' : status === 'error' ? 'var(--accent-red)' : 'var(--text-dim)';
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: status === 'connected' ? 'var(--glow-cyan)' : 'none', animation: status === 'connected' || status === 'reconnecting' || status === 'connecting' ? 'k8s-refresh-pulse 1.2s ease-in-out infinite' : 'none' }} aria-hidden="true" />;
}

export function PodLogsView({ tab, onClose, onToggleWatch, onRefresh, onDownload, onClearLogs, onToggleWrap }: PodLogsViewProps) {
  const logRef = useRef<HTMLPreElement>(null);
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadHideTimer = useRef<number | null>(null);
  const [previousLogs, setPreviousLogs] = useState('');
  const [showPreviousLogs, setShowPreviousLogs] = useState(false);
  const [selectedLevels, setSelectedLevels] = useState<Set<LogLevel>>(() => new Set(LOG_LEVELS));
  const matchRefs = useRef<Array<HTMLElement | null>>([]);
  const normalizedQuery = query.trim().toLowerCase();
  const loadedLogs = tab.logs ?? '';
  const displayedLogs = showPreviousLogs && previousLogs
    ? `${previousLogs}${previousLogs.endsWith('\n') ? '' : '\n'}\n── Logs after clear ──${loadedLogs ? `\n${loadedLogs}` : ''}`
    : loadedLogs;
  const visibleLogs = useMemo(() => {
    if (selectedLevels.size === LOG_LEVELS.length) return loadedLogs;
    return displayedLogs.split('\n').filter((line) => selectedLevels.has(detectLogLevel(line))).join('\n');
  }, [displayedLogs, loadedLogs, selectedLevels]);
  const matchCount = normalizedQuery
    ? visibleLogs.split('\n').reduce((count, line) => count + (line.toLowerCase().split(normalizedQuery).length - 1), 0)
    : 0;

  useEffect(() => {
    setMatchIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (normalizedQuery && matchRefs.current[matchIndex]) {
      matchRefs.current[matchIndex]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [normalizedQuery, matchIndex]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [tab.logs]);

  const clearScreen = () => {
    setPreviousLogs(loadedLogs);
    setShowPreviousLogs(false);
    onClearLogs();
  };

  let renderedMatchIndex = 0;
  const highlightedLogs = normalizedQuery
    ? visibleLogs.split('\n').map((line, lineIndex) => {
      const parts = line.split(new RegExp(`(${normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
      return <React.Fragment key={lineIndex}>{lineIndex > 0 && '\n'}{parts.map((part, index) => {
        if (part.toLowerCase() !== normalizedQuery) return part;
        const currentMatch = renderedMatchIndex++;
        const active = currentMatch === matchIndex;
        return <mark key={index} ref={(element) => { matchRefs.current[currentMatch] = element; }} style={{ background: active ? 'var(--accent-yellow)' : 'var(--tint-yellow)', color: active ? 'var(--bg-primary)' : 'var(--accent-yellow)', borderRadius: 2, padding: '0 1px' }}>{part}</mark>;
      })}</React.Fragment>;
    })
    : visibleLogs;

  const buttonStyle = (active = false): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 9px', borderRadius: 6, border: `1px solid ${active ? 'var(--border-blue)' : 'var(--border)'}`, background: active ? 'var(--tint-blue)' : 'var(--bg-tertiary)', color: active ? 'var(--accent-blue)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, whiteSpace: 'nowrap' });
  const menuItem = (mode: DownloadMode, label: string, content: string) => <button type="button" role="menuitem" onClick={() => { setDownloadOpen(false); onDownload(mode, content); }}>{label}</button>;
  const toggleLevel = (level: LogLevel) => setSelectedLevels((current) => {
    if (current.size === LOG_LEVELS.length) return new Set([level]);
    const next = new Set(current);
    if (next.has(level)) next.delete(level); else next.add(level);
    return next.size === 0 ? new Set(LOG_LEVELS) : next;
  });
  const levelColor: Record<LogLevel, string> = { error: 'var(--accent-red)', warn: 'var(--accent-yellow)', info: 'var(--accent-cyan)', debug: 'var(--accent-purple)', trace: 'var(--text-dim)', other: 'var(--text-secondary)' };

  return <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
      <div style={{ minWidth: 150, marginRight: 4 }}><div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Pod logs</div><div style={{ color: 'var(--text-dim)', font: '10px var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.namespace}/{tab.name}{tab.container ? ` · ${tab.container}` : ''}</div></div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, flex: '0 1 330px', width: 330, minWidth: 205, padding: '5px 6px 5px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text-dim)' }}><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setMatchIndex(0); }} placeholder="Search log lines" aria-label="Search pod logs" style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 11 }} />{normalizedQuery && <><span style={{ whiteSpace: 'nowrap', fontSize: 10 }}>{matchCount ? `${matchIndex + 1}/${matchCount}` : '0 matches'}</span><button type="button" onClick={() => matchCount && setMatchIndex((index) => (index - 1 + matchCount) % matchCount)} disabled={!matchCount} aria-label="Previous log match" title="Previous match" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 23, height: 23, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-tertiary)', color: matchCount ? 'var(--text-secondary)' : 'var(--text-dim)', cursor: matchCount ? 'pointer' : 'default', padding: 0 }}><MatchChevron direction="up" /></button><button type="button" onClick={() => matchCount && setMatchIndex((index) => (index + 1) % matchCount)} disabled={!matchCount} aria-label="Next log match" title="Next match" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 23, height: 23, flexShrink: 0, border: '1px solid var(--border-blue)', borderRadius: 4, background: matchCount ? 'var(--tint-blue)' : 'var(--bg-tertiary)', color: matchCount ? 'var(--accent-blue)' : 'var(--text-dim)', cursor: matchCount ? 'pointer' : 'default', padding: 0 }}><MatchChevron direction="down" /></button></>}</label>
        {(() => { const status = tab.streamStatus ?? (tab.watch ? 'connected' : 'stopped'); const active = status === 'connected' || status === 'connecting' || status === 'reconnecting'; const retry = status === 'error'; const buttonColor = status === 'connected' ? 'var(--accent-green)' : status === 'reconnecting' || status === 'connecting' ? 'var(--accent-yellow)' : retry ? 'var(--accent-red)' : 'var(--text-secondary)'; const buttonBorder = status === 'connected' ? 'var(--border-green)' : retry ? 'var(--border-red)' : status === 'reconnecting' || status === 'connecting' ? 'var(--border-yellow)' : 'var(--border)'; const buttonBackground = status === 'connected' ? 'var(--tint-green)' : retry ? 'var(--tint-red)' : status === 'reconnecting' || status === 'connecting' ? 'var(--tint-yellow)' : 'var(--bg-tertiary)'; return <button type="button" onClick={() => onToggleWatch(retry || status === 'stopped')} style={{ ...buttonStyle(active), color: buttonColor, borderColor: buttonBorder, background: buttonBackground, fontWeight: 600 }} title={retry ? 'Retry log stream' : active ? 'Stop log stream' : 'Start log stream'}>{status === 'stopped' && <StreamIcon running={false} />}{status !== 'stopped' && <StreamDot status={status} />}{retry ? 'Retry' : status === 'reconnecting' ? 'Retrying…' : status === 'connecting' ? 'Connecting…' : active ? 'Watching' : 'Watch'}</button>; })()}
        <button type="button" onClick={() => onToggleWrap(!tab.wrap)} style={buttonStyle(Boolean(tab.wrap))} title="Toggle line wrapping (z)">{tab.wrap ? '↩ Wrap' : '↔ No wrap'}</button>
        <button type="button" onClick={clearScreen} disabled={!loadedLogs} style={{ ...buttonStyle(false), opacity: loadedLogs ? 1 : 0.5, cursor: loadedLogs ? 'pointer' : 'default' }} title="Clear the current screen (does not affect Kubernetes logs)"><ClearIcon />Clear</button>
        <div style={{ position: 'relative' }} onMouseEnter={() => { if (downloadHideTimer.current !== null) window.clearTimeout(downloadHideTimer.current); }} onMouseLeave={() => { downloadHideTimer.current = window.setTimeout(() => setDownloadOpen(false), 220); }}><button type="button" onClick={() => setDownloadOpen((open) => !open)} aria-haspopup="menu" aria-expanded={downloadOpen} style={{ ...buttonStyle(downloadOpen), fontWeight: 600 }} title="Download logs"><DownloadIcon />Download <span aria-hidden="true">▾</span></button>{downloadOpen && <div className="repo-context-menu" role="menu" aria-label="Download pod logs" style={{ position: 'absolute', right: 0, top: 'calc(100% + 3px)', minWidth: 190, zIndex: 100 }}>{menuItem('visible', 'Visible log', visibleLogs)}{menuItem('entire', 'Entire log from pod', loadedLogs)}</div>}</div>
        <button type="button" onClick={onClose} aria-label="Close log tab" title="Close log tab" style={{ ...buttonStyle(), padding: '6px 7px' }}>×</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', paddingTop: 8, paddingBottom: 2, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-dim)', fontSize: 10, minWidth: 38, marginRight: 1 }}>Filter</span>
        <button type="button" onClick={() => setSelectedLevels(new Set(LOG_LEVELS))} style={{ minWidth: 48, padding: '4px 9px', border: '1px solid var(--border-blue)', borderRadius: 10, background: selectedLevels.size === LOG_LEVELS.length ? 'var(--tint-blue)' : 'var(--bg-tertiary)', color: selectedLevels.size === LOG_LEVELS.length ? 'var(--accent-blue)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10 }}>All</button>
        {LOG_LEVELS.map((level) => <button key={level} type="button" onClick={() => toggleLevel(level)} aria-pressed={selectedLevels.has(level)} style={{ minWidth: 52, padding: '4px 9px', border: `1px solid ${selectedLevels.has(level) ? levelColor[level] : 'var(--border)'}`, borderRadius: 10, background: selectedLevels.has(level) ? `color-mix(in srgb, ${levelColor[level]} 12%, transparent)` : 'var(--bg-tertiary)', color: selectedLevels.has(level) ? levelColor[level] : 'var(--text-dim)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10 }}>{LOG_LEVEL_LABELS[level]}</button>)}
        <span style={{ color: 'var(--text-dim)', fontSize: 10, marginLeft: 4 }}>{visibleLogs ? `${visibleLogs.split('\n').length} lines` : '0 lines'}</span>
      </div>
    </div>
    {tab.loading ? <div className="state-message">Loading pod logs...</div> : !tab.logs && tab.error ? <div className="state-message error">{tab.error}</div> : <>{tab.error && <div className="k8s-inline-warning">{tab.error}</div>}{previousLogs && !showPreviousLogs && <button type="button" onClick={() => setShowPreviousLogs(true)} style={{ margin: '8px 18px 0', alignSelf: 'flex-start', ...buttonStyle(false) }}>↑ Show previous logs</button>}<pre ref={logRef} onScroll={(event) => { if (event.currentTarget.scrollTop <= 4 && previousLogs && !showPreviousLogs) setShowPreviousLogs(true); }} style={{ flex: 1, minHeight: 0, overflow: 'auto', margin: 0, padding: 18, color: 'var(--log-text)', background: 'var(--log-bg)', font: '12px/1.55 var(--font-mono)', whiteSpace: tab.wrap ? 'pre-wrap' : 'pre', wordBreak: tab.wrap ? 'break-word' : 'normal', userSelect: 'text' }}>{displayedLogs ? highlightedLogs : 'No logs available.'}</pre></>}
  </div>;
}
