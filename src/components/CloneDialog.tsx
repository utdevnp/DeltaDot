import React, { useState, useRef, useEffect } from 'react';

interface CloneDialogProps {
  workspacePath: string;
  onClose: () => void;
  onCloned: (name: string, path: string) => void;
}

type CloneStatus = 'idle' | 'cloning' | 'done' | 'error';

export function CloneDialog({ workspacePath, onClose, onCloned }: CloneDialogProps) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<CloneStatus>('idle');
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleClone = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Basic validation
    if (!trimmed.startsWith('http') && !trimmed.startsWith('git@')) {
      setStatus('error');
      setMessage('Enter a valid Git URL (https:// or git@...)');
      return;
    }

    setStatus('cloning');
    setMessage(`Cloning ${trimmed.split('/').pop() || 'repository'}...`);

    try {
      const result = await window.api.cloneRepo(trimmed, workspacePath);
      if (result.success && result.name && result.path) {
        setStatus('done');
        setMessage(`Cloned ${result.name}`);
        setTimeout(() => onCloned(result.name!, result.path!), 800);
      } else {
        setStatus('error');
        setMessage(result.error || 'Clone failed');
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Clone failed');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && status !== 'cloning') {
      handleClone();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="command-overlay" onClick={status === 'cloning' ? undefined : onClose}>
      <div
        style={{
          width: 480,
          maxWidth: '90vw',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          </svg>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            Clone Repository
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
            Enter a Git repository URL to clone into <strong style={{ color: 'var(--text-secondary)' }}>{workspacePath.replace(/^.*\//, '…/')}</strong>:
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (status === 'error') setStatus('idle'); }}
              onKeyDown={handleKeyDown}
              placeholder="https://github.com/user/repo.git"
              disabled={status === 'cloning'}
              style={{
                flex: 1,
                padding: '10px 14px',
                background: 'var(--bg-primary)',
                border: `1px solid ${status === 'error' ? 'rgba(248,81,73,0.5)' : 'var(--border)'}`,
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 14,
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleClone}
              disabled={status === 'cloning' || !url.trim()}
              style={{
                padding: '10px 20px',
                borderRadius: 6,
                background: status === 'cloning' ? '#1a6db5' : '#238636',
                border: 'none',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: status === 'cloning' ? 'wait' : (!url.trim() ? 'not-allowed' : 'pointer'),
                fontFamily: 'inherit',
                opacity: status === 'cloning' || !url.trim() ? 0.6 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {status === 'cloning' ? 'Cloning...' : 'Clone'}
            </button>
          </div>

          {/* Status / Error message */}
          {message && (
            <div style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: status === 'error'
                ? 'rgba(248,81,73,0.1)'
                : status === 'done'
                ? 'rgba(63,185,80,0.1)'
                : 'rgba(88,166,255,0.1)',
              border: status === 'error'
                ? '1px solid rgba(248,81,73,0.2)'
                : status === 'done'
                ? '1px solid rgba(63,185,80,0.2)'
                : '1px solid rgba(88,166,255,0.2)',
              color: status === 'error'
                ? '#f85149'
                : status === 'done'
                ? '#3fb950'
                : '#58a6ff',
            }}>
              {status === 'cloning' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              ) : status === 'done' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              )}
              <span>{message}</span>
            </div>
          )}

          {/* Quick examples */}
          {status === 'idle' && !url && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>Quick paste:</div>
              {['https://github.com/user/repo.git', 'git@github.com:user/repo.git'].map((example) => (
                <button
                  key={example}
                  onClick={() => setUrl(example)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 10px',
                    marginBottom: 4,
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                >
                  {example}
                </button>
              ))}
            </div>
          )}
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
            onClick={onClose}
            disabled={status === 'cloning'}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 500,
              cursor: status === 'cloning' ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: status === 'cloning' ? 0.5 : 1,
            }}
          >
            {status === 'done' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
