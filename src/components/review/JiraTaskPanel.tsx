import React from 'react';
import type { JiraIssue } from '../../../core/types.js';
import { renderMarkdown } from '../../../core/markdown.js';

interface JiraTaskPanelProps {
  jiraIssue: JiraIssue | null;
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
        <div className="jira-meta">
          {jiraIssue.status} · {jiraIssue.issueType} · {jiraIssue.assignee}
        </div>
      </div>
      <div
        className="jira-description"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(jiraIssue.description || '(no description)') }}
      />
    </>
  );
}
