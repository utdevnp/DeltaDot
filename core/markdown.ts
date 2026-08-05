// ─── Lightweight markdown → HTML renderer ──────────────────────────────────

export function renderMarkdown(text: string): string {
  if (!text) return '';

  let html = escapeHtml(text);

  // Code blocks (must come before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Unordered lists
  html = html.replace(/^(\s*)[*-] (.+)$/gm, '$1<li>$2</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^(\s*)\d+\. (.+)$/gm, '$1<li>$2</li>');

  // Horizontal rules
  html = html.replace(/^---+\s*$/gm, '<hr>');

  // Paragraphs: wrap consecutive non-empty lines not already wrapped in block tags
  const lines = html.split('\n');
  const result: string[] = [];
  let inBlock = false;
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Detect block-level tags
    if (/^<(h[1-3]|ul|ol|li|pre|hr|div|p)/.test(trimmed)) {
      result.push(line);
      inBlock = true;
      if (/^<\/(h[1-3]|ul|ol|pre|div|p)>$/.test(trimmed)) inBlock = false;
      if (/^<(ul|ol)>$/.test(trimmed)) inList = true;
      if (/^<\/(ul|ol)>$/.test(trimmed)) inList = false;
      continue;
    }
    if (/^<\/(h[1-3]|ul|ol|pre|div|p)>$/.test(trimmed)) {
      result.push(line);
      inBlock = false;
      continue;
    }
    if (/^<(li)/.test(trimmed)) {
      result.push(line);
      continue;
    }

    if (trimmed === '') {
      if (!inBlock && !inList) result.push('');
      continue;
    }

    if (!inBlock && !inList) {
      result.push(`<p>${trimmed}</p>`);
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
