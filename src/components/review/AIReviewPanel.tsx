import React, { useState } from 'react';
import type { AppConfig, JiraIssue, PRDetail, PRFile } from '../../../core/types.js';
import { renderMarkdown } from '../../../core/markdown.js';

interface AIReviewPanelProps {
  cfg: AppConfig;
  repoPath: string;
  prNumber: number;
  jiraIssue: JiraIssue | null;
  /** Called when a review run fetches PR detail, so the parent can cache it for the PR Details tab. */
  onPRDetailLoaded?: (detail: PRDetail) => void;
}

interface LogEntry {
  msg: string;
  ok?: boolean;
}

/**
 * Runs the AI code review against the linked Jira task and the PR changes.
 * Self-contained: owns the review state, phases and streaming, and fetches
 * the PR detail (files) itself when a review is started.
 */
export function AIReviewPanel({ cfg, repoPath, prNumber, jiraIssue, onPRDetailLoaded }: AIReviewPanelProps) {
  const [aiReview, setAIReview] = useState<string | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState('');
  const [phase, setPhase] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const addLog = (msg: string, ok?: boolean) => {
    setLog((prev) => [...prev, { msg, ok }]);
  };

  const runReview = async () => {
    setAIReview('');
    setAIError('');
    setLog([]);
    setAILoading(true);
    setPhase('Fetching Jira content...');

    if (cfg.aiProvider === 'none') {
      addLog('AI provider not configured', false);
      setAIError('AI provider not configured. Go to config (e) to set it up.');
      setAILoading(false);
      setPhase(null);
      return;
    }

    addLog(`Provider: ${cfg.aiProvider}`, true);
    addLog(`Model: ${cfg.aiModel || '(default)'}`, true);
    try {
      const remoteInfo = await window.api.getRemoteOwnerRepo(repoPath);
      if (!remoteInfo) { throw new Error('Could not detect remote repository'); }
      addLog(`Remote: ${remoteInfo.owner}/${remoteInfo.repo}`, true);
      addLog(`Jira: ${jiraIssue ? jiraIssue.key : '(none linked)'}`, true);

      setPhase('Getting PR changes...');
      const prDetail = await window.api.fetchPRDetail(remoteInfo.owner, remoteInfo.repo, prNumber, cfg.provider, cfg.token);
      addLog(`Fetched ${prDetail.files?.length ?? 0} changed file(s)`, true);
      onPRDetailLoaded?.(prDetail);

      const files: { path: string; patch?: string; additions: number; deletions: number; status: string }[] =
        (prDetail.files ?? []).map((f: PRFile) => ({
          path: f.path,
          patch: f.patch,
          additions: f.additions,
          deletions: f.deletions,
          status: f.status,
        }));
      const jiraDescription = jiraIssue?.description ?? '';

      setPhase('Reviewing...');
      addLog(`Sending to ${cfg.aiProvider}${cfg.aiProvider === 'ollama' ? ' (local)' : ''}...`);

      // Stream the response — chunks arrive progressively
      let streamedText = '';
      const result = await window.api.streamAIReview(
        {
          provider: cfg.aiProvider,
          apiKey: cfg.aiApiKey,
          apiUrl: cfg.aiApiUrl,
          model: cfg.aiModel,
          systemPrompt: cfg.aiSystemPrompt,
        },
        jiraDescription,
        files,
        (chunk: string) => {
          streamedText += chunk;
          setAIReview(streamedText);
        },
      );

      addLog('Review complete', true);
      // Always force the final text so the review is never left blank
      const finalText = result || streamedText;
      if (finalText) setAIReview(finalText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(msg, false);
      setAIError(msg);
    }
    setAILoading(false);
    setPhase(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flex: 1, gap: 12, minHeight: 0 }}>
        {/* Left — Review result (70%) */}
        <div style={{ flex: 7, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          {/* Idle state — button centered in the box */}
          {!aiReview && !aiLoading && !aiError && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              minHeight: 200,
            }}>
              <button
                onClick={runReview}
                style={{
                  padding: '12px 40px',
                  borderRadius: 8,
                  background: 'var(--accent-blue)',
                  border: 'none',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: '0 2px 8px rgba(88,166,255,0.35)',
                  transition: 'background 0.15s, transform 0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#4a90e2'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-blue)'; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                ▶ Run AI Review
              </button>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                Analyzes PR changes with {cfg.aiProvider === 'none' ? 'AI' : cfg.aiProvider} against the linked Jira task
              </div>
            </div>
          )}

          {/* Loading — spinner + phase with animated dots (only when nothing to show yet) */}
          {aiLoading && !aiReview && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <div style={{ textAlign: 'center' }}>
                <div className="loading-spinner" />
                <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 16 }}>
                  {phase || 'Processing...'}<span className="loading-dots" />
                </div>
              </div>
            </div>
          )}

          {aiError && !aiLoading && (
            <div className="error" style={{ flexShrink: 0 }}>{aiError}</div>
          )}

          {/* Result — shown progressively while streaming, kept after completion */}
          {aiReview && (
            <>
              {!aiLoading && (
                <div style={{ flexShrink: 0, textAlign: 'center', marginBottom: 8 }}>
                  <button
                    onClick={runReview}
                    disabled={aiLoading}
                    style={{
                      padding: '6px 18px',
                      borderRadius: 6,
                      background: 'var(--accent-blue)',
                      border: 'none',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#4a90e2'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-blue)'; }}
                  >
                    ↻ Run Again
                  </button>
                </div>
              )}
              <div style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                color: 'var(--text-primary)',
                background: 'var(--bg-secondary)',
                padding: 12,
                borderRadius: 6,
                border: '1px solid var(--border)',
              }} dangerouslySetInnerHTML={{ __html: renderMarkdown(aiReview) }} />
            </>
          )}
        </div>

        {/* Right — Log panel (30%) */}
        <div style={{ flex: 3, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {(log.length > 0 || aiLoading) && (
            <div style={{
              flex: 1,
              overflowY: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.8,
              padding: 12,
              background: 'var(--bg-tertiary)',
              borderRadius: 6,
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Log</div>
              {log.length === 0 ? (
                <div style={{ color: 'var(--text-dim)' }}>Starting...<span className="loading-dots" /></div>
              ) : (
                log.map((entry, i) => (
                  <div key={i} style={{ color: entry.ok === false ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                    {entry.ok === true ? '✓ ' : entry.ok === false ? '✗ ' : '→ '}{entry.msg}
                  </div>
                ))
              )}
              {aiLoading && (
                <div style={{ color: 'var(--accent-cyan)', marginTop: log.length > 0 ? 4 : 0 }}>
                  {phase || 'Processing...'}<span className="loading-dots" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
