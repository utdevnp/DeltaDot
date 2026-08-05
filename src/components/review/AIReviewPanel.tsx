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

interface Step {
  label: string;
  state: 'pending' | 'active' | 'done' | 'error';
}

const INITIAL_STEPS: Step[] = [
  { label: 'Getting Jira ticket detail...', state: 'pending' },
  { label: 'Getting PR details...', state: 'pending' },
  { label: 'Reviewing...', state: 'pending' },
];

const compactButtonStyle: React.CSSProperties = {
  padding: '8px 20px',
  borderRadius: 6,
  background: 'var(--accent-blue)',
  border: 'none',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s',
};

/**
 * Runs the AI code review against the linked Jira task and the PR changes.
 * Before a review there is no side panel — only a centered compact button.
 * When the review is running the phase lines appear one by one in the middle.
 * Once the review text returns, the left result panel and the right log panel
 * are shown together.
 */
export function AIReviewPanel({ cfg, repoPath, prNumber, jiraIssue, onPRDetailLoaded }: AIReviewPanelProps) {
  const [aiReview, setAIReview] = useState<string | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState('');
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [log, setLog] = useState<LogEntry[]>([]);

  const addLog = (msg: string, ok?: boolean) => {
    setLog((prev) => [...prev, { msg, ok }]);
  };

  const setStep = (index: number, state: Step['state']) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, state } : s)));
  };

  const runReview = async () => {
    setAIReview('');
    setAIError('');
    setLog([]);
    setSteps(INITIAL_STEPS);
    setAILoading(true);

    if (cfg.aiProvider === 'none') {
      setStep(0, 'done');
      addLog('AI provider not configured', false);
      setAIError('AI provider not configured. Go to config (e) to set it up.');
      setAILoading(false);
      return;
    }

    let currentStep = 0;
    try {
      // Step 1 — Jira
      setStep(0, 'active'); currentStep = 0;
      addLog(`Jira: ${jiraIssue ? jiraIssue.key : '(none linked)'}`, true);
      setStep(0, 'done');

      // Step 2 — PR details
      setStep(1, 'active'); currentStep = 1;
      const remoteInfo = await window.api.getRemoteOwnerRepo(repoPath);
      if (!remoteInfo) { throw new Error('Could not detect remote repository'); }
      const prDetail = await window.api.fetchPRDetail(remoteInfo.owner, remoteInfo.repo, prNumber, cfg.provider, cfg.token);
      addLog(`Fetched ${prDetail.files?.length ?? 0} changed file(s)`, true);
      onPRDetailLoaded?.(prDetail);
      setStep(1, 'done');

      // Step 3 — Reviewing
      setStep(2, 'active'); currentStep = 2;
      const files: { path: string; patch?: string; additions: number; deletions: number; status: string }[] =
        (prDetail.files ?? []).map((f: PRFile) => ({
          path: f.path,
          patch: f.patch,
          additions: f.additions,
          deletions: f.deletions,
          status: f.status,
        }));
      const jiraDescription = jiraIssue?.description ?? '';

      addLog(`Provider: ${cfg.aiProvider}`, true);
      addLog(`Model: ${cfg.aiModel || '(default)'}`, true);

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

      setStep(2, 'done');
      addLog('Review complete', true);
      // Always force the final text so the review is never left blank
      const finalText = result || streamedText;
      if (finalText) setAIReview(finalText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStep(currentStep, 'error');
      setAIReview(null); // drop any partial stream so the centered error shows, no right panel
      addLog(msg, false);
      setAIError(msg);
    }
    setAILoading(false);
  };

  // Steps that have started — shown one by one while the review is running
  const startedSteps = steps.filter((s) => s.state !== 'pending');

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 12 }}>
      {/* Left — result / button area */}
      <div style={{ flex: aiReview ? 7 : 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {/* Idle — compact centered button, no panels */}
        {!aiReview && !aiLoading && !aiError && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            minHeight: 200,
          }}>
            <button
              onClick={runReview}
              style={compactButtonStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#4a90e2'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-blue)'; }}
            >
              ▶ Run AI Review
            </button>
            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
              Analyzes PR changes with {cfg.aiProvider === 'none' ? 'AI' : cfg.aiProvider} against the linked Jira task
            </div>
          </div>
        )}

        {/* Running — phase lines appear one by one */}
        {aiLoading && !aiReview && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: 200,
          }}>
            {startedSteps.map((s, i) => (
              <div key={i} style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: s.state === 'done' ? 'var(--text-secondary)' : s.state === 'error' ? 'var(--accent-red)' : 'var(--accent-blue)',
              }}>
                {s.state === 'done' ? '✓ ' : s.state === 'error' ? '✗ ' : '→ '}{s.label}
                {s.state === 'active' && <span className="loading-dots" />}
              </div>
            ))}
          </div>
        )}

        {aiError && !aiLoading && !aiReview && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div className="error" style={{ maxWidth: 500 }}>{aiError}</div>
          </div>
        )}

        {/* Result — review text (right panel appears next to it) */}
        {aiReview && (
          <>
            {!aiLoading && (
              <div style={{ flexShrink: 0, textAlign: 'center', marginBottom: 8 }}>
                <button
                  onClick={runReview}
                  disabled={aiLoading}
                  style={{ ...compactButtonStyle, opacity: aiLoading ? 0.6 : 1, cursor: aiLoading ? 'default' : 'pointer' }}
                  onMouseEnter={(e) => { if (!aiLoading) e.currentTarget.style.background = '#4a90e2'; }}
                  onMouseLeave={(e) => { if (!aiLoading) e.currentTarget.style.background = 'var(--accent-blue)'; }}
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

      {/* Right — log panel, only visible once the review content is rendered */}
      {aiReview && (
        <div style={{ flex: 3, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Progress</div>

            {/* Phases */}
            {steps.map((step, i) => (
              <div key={i} style={{
                color: step.state === 'done'
                  ? 'var(--text-secondary)'
                  : step.state === 'error'
                    ? 'var(--accent-red)'
                    : step.state === 'active'
                      ? 'var(--accent-blue)'
                      : 'var(--text-dim)',
              }}>
                {step.state === 'done' ? '✓ ' : step.state === 'error' ? '✗ ' : step.state === 'active' ? '→ ' : '· '}{step.label}
              </div>
            ))}

            {/* Detail log entries */}
            {log.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: 12, marginBottom: 8, letterSpacing: 0.5 }}>Details</div>
                {log.map((entry, i) => (
                  <div key={i} style={{ color: entry.ok === false ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                    {entry.ok === true ? '✓ ' : entry.ok === false ? '✗ ' : '→ '}{entry.msg}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
