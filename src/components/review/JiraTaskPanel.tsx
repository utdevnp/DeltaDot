import React from 'react';
import type { JiraIssue } from '../../../core/types.js';
import { renderMarkdown } from '../../../core/markdown.js';

interface JiraTaskPanelProps {
  jiraIssue: JiraIssue | null;
}

/** Maps a Jira status to a chip color class (green = done, blue = active, yellow = queued, red = blocked). */
function statusChipClass(status: string): string {
  const s = status.toLowerCase();
  if (/(done|closed|resolved|complete|released|cancelled|canceled)/.test(s)) return 'green';
  if (/(in progress|in review|review|active|pending|waiting)/.test(s)) return 'blue';
  if (/(blocked|impediment|fail)/.test(s)) return 'red';
  if (/(to do|todo|backlog|open|new|ready|queued)/.test(s)) return 'yellow';
  return 'dim';
}

/** Maps a Jira issue type to a chip color class (bug = red, task = blue, story = green, epic = purple…). */
function typeChipClass(type: string): string {
  const s = type.toLowerCase();
  if (/(bug|defect|incident)/.test(s)) return 'red';
  if (/(task|chore)/.test(s)) return 'blue';
  if (/(story|user story)/.test(s)) return 'green';
  if (/(epic|feature|initiative)/.test(s)) return 'purple';
  if (/(sub.?task|improvement|enhancement)/.test(s)) return 'yellow';
  return 'dim';
}

/**
 * Displays the linked Jira task: key, summary, meta and rendered description.
 */
export function JiraTaskPanel({ jiraIssue }: JiraTaskPanelProps) {
  if (!jiraIssue) {
    return <div className="state-message">No Jira issue linked to this PR</div>;
  }

  return (
    <>
      <div className="jira-header">
        <h3>{jiraIssue.key} — {jiraIssue.summary}</h3>
        <div className="jira-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className={`jira-chip ${statusChipClass(jiraIssue.status)}`}>{jiraIssue.status}</span>
          <span className={`jira-chip ${typeChipClass(jiraIssue.issueType)}`}>{jiraIssue.issueType}</span>
          {jiraIssue.assignee && (
            <span style={{ color: 'var(--text-secondary)' }}>{jiraIssue.assignee}</span>
          )}
        </div>
      </div>
      <div
        className="jira-description"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(jiraIssue.description || '(no description)') }}
      />
    </>
  );
}
