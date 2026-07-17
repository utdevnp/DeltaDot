import type { JiraIssue } from '../../types.js';

export interface JiraConfig {
  url: string;
  email: string;
  apiToken: string;
}

export function extractJiraIssueKey(...sources: Array<string | undefined>): string | null {
  const keyRe = /\b[A-Z][A-Z0-9]+-\d+\b/;
  for (const source of sources) {
    if (!source) continue;
    const match = source.match(keyRe);
    if (match) return match[0] ?? null;
  }
  return null;
}

export async function fetchJiraIssue(config: JiraConfig, issueKey: string): Promise<JiraIssue> {
  const baseUrl = normalizeBaseUrl(config.url);
  const headers = {
    Accept: 'application/json',
    Authorization: `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`,
  };

  const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Jira API error ${res.status}: ${res.statusText} - ${errorBody}`);
  }

  const item = await res.json() as any;
  const fields = item.fields ?? {};
  const description = adfToText(fields.description);

  return {
    key: item.key as string,
    summary: (fields.summary as string) ?? '',
    description,
    status: (fields.status?.name as string) ?? '',
    issueType: (fields.issuetype?.name as string) ?? '',
    assignee: (fields.assignee?.displayName as string) ?? 'unassigned',
    reporter: (fields.reporter?.displayName as string) ?? 'unknown',
    url: `${baseUrl}/browse/${encodeURIComponent(item.key as string)}`,
  };
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function adfToText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToText).join('');
  if (typeof node !== 'object') return '';

  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention') return node.attrs?.text ?? '';
  
  if (node.type === 'paragraph') {
    return `${adfToText(node.content)}\n\n`;
  }
  if (node.type === 'heading') {
    const level = node.attrs?.level ?? 1;
    const prefix = '#'.repeat(level) + ' ';
    return `\n${prefix}${adfToText(node.content)}\n\n`;
  }
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    const items = Array.isArray(node.content) ? node.content : [];
    let bulletIndex = 1;
    const formatted = items.map((item: any) => {
      const bullet = node.type === 'orderedList' ? `${bulletIndex++}. ` : '• ';
      return `${bullet}${adfToText(item).trim()}`;
    }).join('\n');
    return `\n${formatted}\n\n`;
  }
  if (node.type === 'listItem') {
    return `${adfToText(node.content)}`;
  }
  if (node.type === 'table') {
    const rows = Array.isArray(node.content) ? node.content : [];
    if (rows.length === 0) return '\n';
    const tableData: { text: string; isHeader: boolean }[][] = [];
    let maxCols = 0;
    for (const rawRow of rows) {
      if (rawRow.type !== 'tableRow') continue;
      const cells = Array.isArray(rawRow.content) ? rawRow.content : [];
      const rowCells = cells.map((c: any) => ({
        text: adfToText(c.content).trim().replace(/\n\s*/g, ' '),
        isHeader: c.type === 'tableHeader',
      }));
      tableData.push(rowCells);
      maxCols = Math.max(maxCols, rowCells.length);
    }
    if (tableData.length === 0) return '\n';
    for (const row of tableData) {
      while (row.length < maxCols) row.push({ text: '', isHeader: false });
    }
    const colWidths: number[] = Array(maxCols).fill(0);
    for (const row of tableData) {
      for (let i = 0; i < maxCols; i++) {
        colWidths[i] = Math.max(colWidths[i], (row[i]?.text ?? '').length);
      }
    }
    const sep = colWidths.map(w => '─'.repeat(w)).join('─┼─');
    const headerRows = new Set<number>();
    for (let ri = 0; ri < tableData.length; ri++) {
      if (tableData[ri]!.some(c => c.isHeader)) headerRows.add(ri);
    }
    const lines: string[] = [];
    for (let ri = 0; ri < tableData.length; ri++) {
      const row = tableData[ri]!;
      const cells = row.map((cell, ci) => {
        const w = colWidths[ci] ?? 0;
        const text = cell.isHeader ? cell.text.toUpperCase() : cell.text;
        return text.padEnd(w);
      }).join(' │ ');
      lines.push(`  ${cells}`);
      if (headerRows.has(ri)) {
        lines.push(` ${sep}`);
      }
    }
    return `\n${lines.join('\n')}\n`;
  }
  if (node.type === 'rule') {
    return '\n─────────────────\n';
  }

  return adfToText(node.content);
}
