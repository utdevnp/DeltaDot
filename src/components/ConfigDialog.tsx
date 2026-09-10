import React, { useState } from 'react';
import type { AppConfig, ConfigField } from '../../core/types.js';
import { CONFIG_LABELS } from '../../core/types.js';

interface ConfigDialogProps {
  config: AppConfig;
  onSave: (cfg: AppConfig) => Promise<void>;
  onClose: () => void;
  onBrowseWorkspace?: () => Promise<string | null>;
  fullPage?: boolean;
}

type ConfigTab = 'workspace' | 'git' | 'jira' | 'ai' | 'appearance' | 'notifications' | 'shortcuts' | 'advanced';

const SENSITIVE_FIELDS: ConfigField[] = ['token', 'jiraApiToken', 'aiApiKey'];

const TABS: { id: ConfigTab; label: string }[] = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'git', label: 'Git Provider' },
  { id: 'jira', label: 'Task / Jira' },
  { id: 'ai', label: 'AI Review' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'advanced', label: 'Advanced' },
];

const TAB_FIELDS: Record<ConfigTab, ConfigField[]> = {
  workspace: ['workspace', 'base', 'release', 'syncInterval'],
  git: ['provider', 'token'],
  jira: ['taskProvider', 'jiraUrl', 'jiraEmail', 'jiraApiToken'],
  ai: ['aiProvider', 'aiApiKey', 'aiApiUrl', 'aiModel', 'aiSystemPrompt'],
  appearance: ['theme'],
  notifications: [],
  shortcuts: [],
  advanced: [],
};

const TAB_ICONS: Record<ConfigTab, string> = {
  workspace: '',
  git: '',
  jira: '',
  ai: '',
  appearance: '',
  notifications: '',
  shortcuts: '',
  advanced: '',
};

const DROPDOWN_OPTIONS: Partial<Record<ConfigField, { value: string; label: string }[]>> = {
  provider: [
    { value: 'github', label: 'GitHub' },
    { value: 'gitlab', label: 'GitLab' },
    { value: 'bitbucket', label: 'Bitbucket' },
  ],
  taskProvider: [
    { value: 'none', label: 'None' },
    { value: 'jira', label: 'Jira' },
    { value: 'clickup', label: 'ClickUp' },
    { value: 'github', label: 'GitHub Issues' },
  ],
  aiProvider: [
    { value: 'none', label: 'None (disabled)' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'ollama', label: 'Ollama (local)' },
    { value: 'openrouter', label: 'OpenRouter' },
    { value: 'deepseek', label: 'DeepSeek' },
  ],
  theme: [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' },
  ],
};

export function ConfigDialog({ config, onSave, onClose, onBrowseWorkspace, fullPage = false }: ConfigDialogProps) {
  const [form, setForm] = useState<AppConfig>({ ...config });
  const [activeTab, setActiveTab] = useState<ConfigTab>('workspace');
  const [saving, setSaving] = useState(false);
  const [visibleFields, setVisibleFields] = useState<Set<ConfigField>>(new Set());

  const toggleVisible = (field: ConfigField) => {
    setVisibleFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  // Auto-populate API URL and model when provider changes
  React.useEffect(() => {
    const provider = form.aiProvider;
    if (!provider || provider === 'none') return;

    const defaults: Record<string, { url?: string; model?: string }> = {
      openai:    { url: 'https://api.openai.com/v1', model: 'gpt-4o' },
      anthropic: { url: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
      gemini:    { url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
      ollama:    { url: 'http://localhost:11434', model: 'llama3' },
      openrouter:{ url: 'https://openrouter.ai', model: 'anthropic/claude-sonnet-4' },
      deepseek:  { url: 'https://api.deepseek.com', model: 'deepseek-chat' },
    };

    const d = defaults[provider];
    if (!d) return;

    setForm((prev) => ({
      ...prev,
      aiApiUrl: prev.aiApiUrl || d.url || '',
      aiModel:  prev.aiModel  || d.model || '',
    }));
  }, [form.aiProvider]);

  const handleChange = (field: ConfigField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  // ── Dynamic field visibility based on dropdown selections ──────────────

  const isFieldVisible = (field: ConfigField): boolean => {
    const provider = form.provider;
    const taskProvider = form.taskProvider;
    const aiProvider = form.aiProvider;

    switch (field) {
      // Git tab
      case 'token':
        return true; // always visible with dynamic placeholder

      // Jira tab
      case 'jiraUrl':
      case 'jiraEmail':
      case 'jiraApiToken':
        return taskProvider === 'jira';
      case 'taskProvider':
        return true;

      // AI tab
      case 'aiApiKey':
        return aiProvider !== 'none' && aiProvider !== 'ollama';
      case 'aiApiUrl':
      case 'aiModel':
      case 'aiSystemPrompt':
        return aiProvider !== 'none';
      case 'aiProvider':
        return true;

      default:
        return true;
    }
  };

  // ── Dynamic placeholder and default hints based on selections ──────────

  const getFieldHint = (field: ConfigField): { placeholder: string; hint?: string } => {
    const provider = form.provider;
    const aiProvider = form.aiProvider;

    switch (field) {
      case 'token':
        switch (provider) {
          case 'gitlab': return { placeholder: 'glpat-...', hint: 'GitLab personal access token with api scope' };
          case 'bitbucket': return { placeholder: 'Bitbucket app password', hint: 'Bitbucket app password with pull requests:read permission' };
          case 'github':
          default: return { placeholder: 'ghp_... or github_pat_...', hint: 'GitHub personal access token with repo scope' };
        }
      case 'aiApiKey':
        switch (aiProvider) {
          case 'openai': return { placeholder: 'sk-...', hint: 'OpenAI API key' };
          case 'anthropic': return { placeholder: 'sk-ant-...', hint: 'Anthropic API key' };
          case 'gemini': return { placeholder: 'AIza...', hint: 'Gemini API key' };
          case 'openrouter': return { placeholder: 'sk-or-...', hint: 'OpenRouter API key' };
          case 'deepseek': return { placeholder: 'sk-...', hint: 'DeepSeek API key' };
          default: return { placeholder: 'API key', hint: '' };
        }
      case 'aiApiUrl':
        switch (aiProvider) {
          case 'openai': return { placeholder: 'https://api.openai.com/v1', hint: '' };
          case 'anthropic': return { placeholder: 'https://api.anthropic.com', hint: '' };
          case 'gemini': return { placeholder: 'https://generativelanguage.googleapis.com/v1beta', hint: '' };
          case 'ollama': return { placeholder: 'http://localhost:11434', hint: 'Local Ollama instance URL' };
          case 'openrouter': return { placeholder: 'https://openrouter.ai', hint: '' };
          case 'deepseek': return { placeholder: 'https://api.deepseek.com', hint: '' };
          default: return { placeholder: 'API URL', hint: '' };
        }
      case 'aiModel':
        switch (aiProvider) {
          case 'openai': return { placeholder: 'gpt-4o', hint: 'e.g. gpt-4o, gpt-4o-mini, o3-mini' };
          case 'anthropic': return { placeholder: 'claude-sonnet-4-20250514', hint: 'e.g. claude-sonnet-4-20250514, claude-haiku-3-5-sonnet' };
          case 'gemini': return { placeholder: 'gemini-2.0-flash', hint: 'e.g. gemini-2.0-flash, gemini-2.5-pro' };
          case 'ollama': return { placeholder: 'llama3', hint: 'e.g. llama3, mistral, codellama' };
          case 'openrouter': return { placeholder: 'anthropic/claude-sonnet-4', hint: 'e.g. anthropic/claude-sonnet-4, openai/gpt-4o' };
          case 'deepseek': return { placeholder: 'deepseek-chat', hint: 'e.g. deepseek-chat, deepseek-reasoner' };
          default: return { placeholder: 'Model name', hint: '' };
        }
      default:
        return { placeholder: CONFIG_LABELS[field], hint: '' };
    }
  };

  // ── Filtered fields for current tab ───────────────────────────────────

  const currentFields = TAB_FIELDS[activeTab].filter(isFieldVisible);

  // ── Info messages when a section is inactive ──────────────────────────

  const renderInactiveInfo = () => {
    const taskProvider = form.taskProvider;
    const aiProvider = form.aiProvider;

    if (activeTab === 'jira' && taskProvider !== 'jira') {
      const msgs: Record<string, string> = {
        none: 'Task provider is set to None. Select Jira above to configure Jira integration.',
        clickup: 'ClickUp integration is not yet implemented. Select Jira to use the task review feature.',
        github: 'GitHub Issues integration is not yet implemented. Select Jira to use the task review feature.',
      };
      return (
        <div className={fullPage ? 'settings-info-card' : undefined} style={{
          padding: '12px 16px',
          borderRadius: 6,
          background: 'var(--tint-yellow)',
          border: '1px solid var(--border-yellow)',
          color: 'var(--accent-yellow)',
          fontSize: 12,
          lineHeight: 1.5,
          marginTop: 8,
        }}>
          {msgs[taskProvider] ?? 'Select a provider above to see configuration options.'}
        </div>
      );
    }
    if (activeTab === 'ai' && aiProvider === 'none') {
      return (
        <div className={fullPage ? 'settings-info-card' : undefined} style={{
          padding: '12px 16px',
          borderRadius: 6,
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
          fontSize: 12,
          lineHeight: 1.5,
          marginTop: 8,
        }}>
          AI review is disabled. Select an AI provider above to configure API keys and model preferences.
        </div>
      );
    }
    if (activeTab === 'appearance') {
      return <div className="settings-info-card">Choose the global appearance for DeltaDot. This preference applies across all workspaces.</div>;
    }
    if (activeTab === 'shortcuts') {
      const shortcuts = [
        ['j / k', 'Navigate lists'], ['Enter', 'Open selected item'], ['r / R', 'Refresh / review'],
        ['s / S', 'Sync repo / all'], ['p / P', 'Open PRs'], ['K', 'Kubernetes'],
        ['w / W', 'Workspace menu'], ['f / /', 'Filter / search'], [':', 'Command palette'],
        ['Esc / b', 'Back or close'], ['q', 'Quit'],
      ];
      return <div className="settings-info-card"><div>Shortcuts are global and remain active even when their hints are hidden from the footer.</div><div className="settings-shortcut-grid">{shortcuts.map(([key, label]) => <div className="settings-shortcut" key={key}><kbd>{key}</kbd><span>{label}</span></div>)}</div></div>;
    }
    if (activeTab === 'notifications' || activeTab === 'advanced') {
      return <div className="settings-info-card">This settings section is reserved for future preferences. Existing behavior remains unchanged.</div>;
    }
    return null;
  };

  return (
    <div className={fullPage ? 'settings-page-shell' : 'command-overlay'} onClick={fullPage ? undefined : onClose}>
      <div
        className={fullPage ? 'settings-page-card' : undefined}
        style={fullPage ? undefined : {
          width: 560,
          maxWidth: '90vw',
          maxHeight: '85vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-pop)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px 0 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <h2 style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 14,
          }}>
            Settings
          </h2>

          {!fullPage && <div style={{ display: 'flex', gap: 0 }}>
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '8px 18px', fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400, color: activeTab === tab.id ? 'var(--accent-blue)' : 'var(--text-secondary)', background: 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s, border-color 0.15s', marginBottom: -1, outline: 'none' }}>
                {tab.label}
              </button>
            ))}
          </div>}
        </div>

        {fullPage && <aside className="settings-page-nav" aria-label="Settings sections">
          <div className="settings-page-nav-title">Settings</div>
          {TABS.map((tab) => (
            <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </aside>}

        {/* Form body */}
        <div className={fullPage ? 'settings-page-form-body' : undefined} style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
        }}>
          <form id="config-form" onSubmit={handleSubmit}>
            {/* Section description */}
            {activeTab === 'workspace' && (
              <div style={{
                fontSize: 12,
                color: 'var(--text-dim)',
                marginBottom: 16,
                lineHeight: 1.5,
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                borderRadius: 6,
              }}>
                Configure the workspace directory and branch comparison settings. The app scans all Git repositories under the workspace path and compares <strong style={{ color: 'var(--text-secondary)' }}>base</strong> against <strong style={{ color: 'var(--text-secondary)' }}>release</strong> branches.
              </div>
            )}
            {activeTab === 'git' && (
              <div style={{
                fontSize: 12,
                color: 'var(--text-dim)',
                marginBottom: 16,
                lineHeight: 1.5,
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                borderRadius: 6,
              }}>
                Set up the Git provider and authentication token for fetching pull requests. Supported providers: GitHub, GitLab, Bitbucket.
              </div>
            )}
            {activeTab === 'jira' && (
              <div style={{
                fontSize: 12,
                color: 'var(--text-dim)',
                marginBottom: 16,
                lineHeight: 1.5,
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                borderRadius: 6,
              }}>
                Connect a task provider for the review view. When reviewing a PR, DeltaDot extracts the issue key from the branch or title and fetches its description.
              </div>
            )}
            {activeTab === 'ai' && (
              <div style={{
                fontSize: 12,
                color: 'var(--text-dim)',
                marginBottom: 16,
                lineHeight: 1.5,
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                borderRadius: 6,
              }}>
                Configure AI-powered code review. The PR diff combined with the Jira ticket description is sent to the AI provider for analysis. Supports OpenAI, Anthropic, Gemini, Ollama (local), and OpenRouter.
              </div>
            )}

            {renderInactiveInfo()}

            {currentFields.map((field) => {
              const isSensitive = SENSITIVE_FIELDS.includes(field);
              const value = String(form[field] ?? '');
              const dropdownOpts = DROPDOWN_OPTIONS[field];
              const { placeholder, hint } = getFieldHint(field);

              return (
                <div className="config-field" key={field}>
                  <label>{CONFIG_LABELS[field]}</label>
                  {dropdownOpts ? (
                    <select
                      value={value}
                      onChange={(e) => handleChange(field, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        color: 'var(--text-primary)',
                        fontSize: 14,
                        fontFamily: 'inherit',
                        outline: 'none',
                        cursor: 'pointer',
                        transition: 'border-color 0.2s',
                        appearance: 'auto',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                    >
                      {dropdownOpts.map((opt) => (
                        <option
                          key={opt.value}
                          value={opt.value}
                          style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                        >
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : field === 'workspace' && onBrowseWorkspace ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => handleChange(field, e.target.value)}
                        placeholder={placeholder}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                          fontSize: 14,
                          fontFamily: 'var(--font-mono)',
                          outline: 'none',
                          transition: 'border-color 0.2s',
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const folder = await onBrowseWorkspace();
                          if (folder) handleChange('workspace', folder);
                        }}
                        style={{
                          padding: '8px 16px',
                          borderRadius: 6,
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-primary)',
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                        Browse
                      </button>
                    </div>
                  ) : field === 'aiSystemPrompt' ? (
                    <textarea
                      value={value}
                      onChange={(e) => handleChange(field, e.target.value)}
                      placeholder={CONFIG_LABELS[field]}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        fontFamily: 'var(--font-mono)',
                        outline: 'none',
                        resize: 'vertical',
                        minHeight: 80,
                        lineHeight: 1.5,
                      }}
                      rows={3}
                    />
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <input
                        type={isSensitive && !visibleFields.has(field) ? 'password' : 'text'}
                        value={value}
                        onChange={(e) => handleChange(field, e.target.value)}
                        placeholder={placeholder}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          paddingRight: isSensitive ? 40 : 12,
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                          fontSize: 14,
                          fontFamily: isSensitive ? 'inherit' : 'var(--font-mono)',
                          outline: 'none',
                          transition: 'border-color 0.2s',
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                      />
                      {isSensitive && value && (
                        <button
                          type="button"
                          onClick={() => toggleVisible(field)}
                          tabIndex={-1}
                          style={{
                            position: 'absolute',
                            right: 8,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: visibleFields.has(field) ? 'var(--accent-blue)' : 'var(--text-dim)',
                            opacity: 0.7,
                            transition: 'opacity 0.15s, color 0.15s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                        >
                          {visibleFields.has(field) ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                              <line x1="1" y1="1" x2="23" y2="23"/>
                              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                            </svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                  {isSensitive && value && (
                    <div style={{
                      fontSize: 11,
                      color: 'var(--text-dim)',
                      marginTop: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      Stored securely in local config
                    </div>
                  )}
                  {hint && (
                    <div style={{
                      fontSize: 11,
                      color: 'var(--text-dim)',
                      marginTop: 4,
                      lineHeight: 1.4,
                    }}>
                      {hint}
                    </div>
                  )}
                </div>
              );
            })}
          </form>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          background: 'var(--bg-tertiary)',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="config-form"
            disabled={saving}
            style={{
              padding: '8px 24px',
              borderRadius: 6,
              background: saving ? 'var(--btn-blue-dark)' : 'linear-gradient(135deg, var(--btn-blue), var(--btn-blue-dark))',
              border: 'none',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              opacity: saving ? 0.7 : 1,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.background = 'color-mix(in srgb, var(--btn-blue) 88%, #fff)';
            }}
            onMouseLeave={(e) => {
              if (!saving) e.currentTarget.style.background = 'linear-gradient(135deg, var(--btn-blue), var(--btn-blue-dark))';
            }}
          >
            {saving ? 'Saving...' : 'Save & Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
