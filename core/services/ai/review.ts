import type { ConfigField } from '../../types.js';

export interface AIConfig {
  provider: 'none' | 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openrouter';
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

function normalizeUrl(url: string, fallback: string): string {
  return (url || fallback).replace(/\/+$/, '');
}

async function apiError(res: Response): Promise<Error> {
  const body = await res.text().catch(() => '');
  return new Error(`AI API error ${res.status}: ${res.statusText}${body ? ` — ${body.slice(0, 500)}` : ''}`);
}
