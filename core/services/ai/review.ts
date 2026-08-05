import type { ConfigField } from '../../types.js';

export interface AIConfig {
  provider: 'none' | 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openrouter' | 'deepseek';
  apiKey: string;
  apiUrl: string;
  model: string;
  systemPrompt: string;
}

export async function fetchAIReview(
  config: AIConfig,
  jiraDescription: string,
  prFiles: { path: string; patch?: string; additions: number; deletions: number; status: string }[],
): Promise<string> {
  if (config.provider === 'none') throw new Error('AI provider is not configured');
  if (!config.apiKey && config.provider !== 'ollama') throw new Error('AI API key not configured');

  const userPrompt = buildReviewPrompt(jiraDescription, prFiles);

  switch (config.provider) {
    case 'openai': return callOpenAI(config, userPrompt);
    case 'anthropic': return callAnthropic(config, userPrompt);
    case 'gemini': return callGemini(config, userPrompt);
    case 'ollama': return callOllama(config, userPrompt);
    case 'openrouter': return callOpenRouter(config, userPrompt);
    case 'deepseek': return callDeepSeek(config, userPrompt);
    default: throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}

function buildReviewPrompt(
  jiraDescription: string,
  files: { path: string; patch?: string }[],
): string {
  let prompt = '';

  if (jiraDescription.trim()) {
    prompt += `## Jira Ticket Description\n\n${jiraDescription.trim()}\n\n`;
  }

  prompt += `## Pull Request Changes\n\n`;
  for (const file of files) {
    prompt += `### ${file.path}\n`;
    if (file.patch) {
      prompt += '```diff\n';
      prompt += file.patch;
      prompt += '\n```\n\n';
    } else {
      prompt += '(binary file or no diff available)\n\n';
    }
  }

  return prompt;
}

async function callOpenAI(config: AIConfig, userPrompt: string): Promise<string> {
  const baseUrl = normalizeUrl(config.apiUrl, 'https://api.openai.com/v1');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
    }),
  });
  if (!res.ok) throw await apiError(res);
  const json = await res.json() as any;
  return json.choices?.[0]?.message?.content ?? '(no response)';
}

async function callAnthropic(config: AIConfig, userPrompt: string): Promise<string> {
  const baseUrl = normalizeUrl(config.apiUrl, 'https://api.anthropic.com');
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      system: config.systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 4096,
    }),
  });
  if (!res.ok) throw await apiError(res);
  const json = await res.json() as any;
  return json.content?.map((c: any) => c.text).join('') ?? '(no response)';
}

async function callGemini(config: AIConfig, userPrompt: string): Promise<string> {
  const baseUrl = normalizeUrl(config.apiUrl, 'https://generativelanguage.googleapis.com/v1beta');
  const model = config.model || 'gemini-2.0-flash';
  const res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${config.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${config.systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { maxOutputTokens: 4096 },
    }),
  });
  if (!res.ok) throw await apiError(res);
  const json = await res.json() as any;
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no response)';
}

async function callOllama(config: AIConfig, userPrompt: string): Promise<string> {
  const baseUrl = normalizeUrl(config.apiUrl, 'http://localhost:11434');
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: { num_predict: 4096 },
    }),
  });
  if (!res.ok) throw await apiError(res);
  const lines = (await res.text()).trim().split('\n');
  const texts: string[] = [];
  for (const line of lines) {
    try {
      const chunk = JSON.parse(line);
      if (chunk.message?.content) texts.push(chunk.message.content);
    } catch { /* skip malformed lines */ }
  }
  return texts.join('') || '(no response)';
}

async function callOpenRouter(config: AIConfig, userPrompt: string): Promise<string> {
  let inputUrl = config.apiUrl.trim();
  if (!inputUrl) inputUrl = 'https://openrouter.ai';
  inputUrl = inputUrl.replace(/\/+$/, '');
  // Strip known path segments so we always reconstruct cleanly
  if (inputUrl.endsWith('/chat/completions')) inputUrl = inputUrl.slice(0, -'/chat/completions'.length);
  if (inputUrl.endsWith('/api/v1')) inputUrl = inputUrl.slice(0, -'/api/v1'.length);
  inputUrl = inputUrl.replace(/\/+$/, '');
  const url = `${inputUrl}/api/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'HTTP-Referer': 'https://github.com/ebpearls/DeltaDot',
      'X-Title': 'DeltaDot',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
    }),
  });
  if (!res.ok) throw await apiError(res);
  const json = await res.json() as any;
  return json.choices?.[0]?.message?.content ?? '(no response)';
}

async function callDeepSeek(config: AIConfig, userPrompt: string): Promise<string> {
  const baseUrl = normalizeUrl(config.apiUrl, 'https://api.deepseek.com');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
    }),
  });
  if (!res.ok) throw await apiError(res);
  const json = await res.json() as any;
  return json.choices?.[0]?.message?.content ?? '(no response)';
}

function normalizeUrl(url: string, fallback: string): string {
  return (url || fallback).replace(/\/+$/, '');
}

async function apiError(res: Response): Promise<Error> {
  const body = await res.text().catch(() => '');
  return new Error(`AI API error ${res.status}: ${res.statusText}${body ? ` — ${body.slice(0, 500)}` : ''}`);
}

// ─── Streaming API ─────────────────────────────────────────────────────────

export async function streamAIReview(
  config: AIConfig,
  jiraDescription: string,
  prFiles: { path: string; patch?: string; additions: number; deletions: number; status: string }[],
  onChunk: (text: string) => void,
): Promise<string> {
  if (config.provider === 'none') throw new Error('AI provider is not configured');
  if (!config.apiKey && config.provider !== 'ollama') throw new Error('AI API key not configured');

  const userPrompt = buildReviewPrompt(jiraDescription, prFiles);
  let fullText = '';

  const accumulate = (chunk: string) => {
    fullText += chunk;
    onChunk(chunk);
  };

  switch (config.provider) {
    case 'openai': await streamOpenAI(config, userPrompt, accumulate); break;
    case 'anthropic': await streamAnthropic(config, userPrompt, accumulate); break;
    case 'gemini': await streamGemini(config, userPrompt, accumulate); break;
    case 'ollama': await streamOllama(config, userPrompt, accumulate); break;
    case 'openrouter': await streamOpenRouter(config, userPrompt, accumulate); break;
    case 'deepseek': await streamDeepSeek(config, userPrompt, accumulate); break;
    default: throw new Error(`Unsupported AI provider: ${config.provider}`);
  }

  return fullText;
}

// ─── SSE parser ────────────────────────────────────────────────────────────

async function readSSEStream(
  res: Response,
  onToken: (token: string) => void,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (!trimmed.startsWith('data: ')) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const content = json.choices?.[0]?.delta?.content
          ?? json.choices?.[0]?.text
          ?? '';
        if (content) onToken(content);
      } catch { /* skip malformed JSON */ }
    }
  }
}

// ─── Streaming implementations ─────────────────────────────────────────────

async function streamOpenAI(config: AIConfig, prompt: string, onToken: (t: string) => void): Promise<void> {
  const baseUrl = normalizeUrl(config.apiUrl, 'https://api.openai.com/v1');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
      stream: true,
    }),
  });
  if (!res.ok) throw await apiError(res);
  await readSSEStream(res, onToken);
}

async function streamDeepSeek(config: AIConfig, prompt: string, onToken: (t: string) => void): Promise<void> {
  const baseUrl = normalizeUrl(config.apiUrl, 'https://api.deepseek.com');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
      stream: true,
    }),
  });
  if (!res.ok) throw await apiError(res);
  await readSSEStream(res, onToken);
}

async function streamOpenRouter(config: AIConfig, prompt: string, onToken: (t: string) => void): Promise<void> {
  let inputUrl = config.apiUrl.trim();
  if (!inputUrl) inputUrl = 'https://openrouter.ai';
  inputUrl = inputUrl.replace(/\/+$/, '');
  if (inputUrl.endsWith('/chat/completions')) inputUrl = inputUrl.slice(0, -'/chat/completions'.length);
  if (inputUrl.endsWith('/api/v1')) inputUrl = inputUrl.slice(0, -'/api/v1'.length);
  inputUrl = inputUrl.replace(/\/+$/, '');
  const url = `${inputUrl}/api/v1/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'HTTP-Referer': 'https://github.com/ebpearls/DeltaDot',
      'X-Title': 'DeltaDot',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
      stream: true,
    }),
  });
  if (!res.ok) throw await apiError(res);
  await readSSEStream(res, onToken);
}

async function streamAnthropic(config: AIConfig, prompt: string, onToken: (t: string) => void): Promise<void> {
  const baseUrl = normalizeUrl(config.apiUrl, 'https://api.anthropic.com');
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      system: config.systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      stream: true,
    }),
  });
  if (!res.ok) throw await apiError(res);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      try {
        const json = JSON.parse(trimmed.slice(6));
        if (json.type === 'content_block_delta' && json.delta?.text) {
          onToken(json.delta.text);
        }
      } catch { /* skip */ }
    }
  }
}

async function streamGemini(config: AIConfig, prompt: string, onToken: (t: string) => void): Promise<void> {
  const baseUrl = normalizeUrl(config.apiUrl, 'https://generativelanguage.googleapis.com/v1beta');
  const model = config.model || 'gemini-2.0-flash';

  // Use SSE endpoint for streaming
  const url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${config.systemPrompt}\n\n${prompt}` }] }],
      generationConfig: { maxOutputTokens: 4096 },
    }),
  });
  if (!res.ok) throw await apiError(res);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      try {
        const json = JSON.parse(trimmed.slice(6));
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text) onToken(text);
      } catch { /* skip */ }
    }
  }
}

async function streamOllama(config: AIConfig, prompt: string, onToken: (t: string) => void): Promise<void> {
  const baseUrl = normalizeUrl(config.apiUrl, 'http://localhost:11434');
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: prompt },
      ],
      options: { num_predict: 4096 },
      stream: true,
    }),
  });
  if (!res.ok) throw await apiError(res);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const chunk = JSON.parse(trimmed);
        if (chunk.message?.content) onToken(chunk.message.content);
      } catch { /* skip */ }
    }
  }
}
