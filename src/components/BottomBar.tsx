import React from 'react';
import type { View } from '../../core/types.js';

interface BottomBarProps {
  currentView: View;
}

const KEYBINDINGS: Record<View, { key: string; desc: string }[]> = {
  list: [
    { key: '↑↓ j/k', desc: 'navigate' },
    { key: '↵ / c', desc: 'commits' },
    { key: 's', desc: 'sync' },
    { key: 'S', desc: 'sync all' },
    { key: 'P', desc: 'PRs' },
    { key: 'K', desc: 'k8s' },
    { key: 'e', desc: 'config' },
    { key: '⌘N', desc: 'clone' },
    { key: '/', desc: 'search' },
    { key: ':', desc: 'command' },
    { key: 'o', desc: 'open compare' },
    { key: 'q', desc: 'quit' },
  ],
  commits: [
    { key: '↑↓ j/k', desc: 'navigate' },
    { key: '↵', desc: 'detail' },
    { key: 's', desc: 'sync' },
    { key: 'b / Esc', desc: 'back' },
    { key: 'q', desc: 'quit' },
  ],
  detail: [
    { key: 'b / Esc', desc: 'back' },
    { key: 'q', desc: 'quit' },
  ],
  config: [
    { key: 'Tab', desc: 'next' },
    { key: '↵', desc: 'save' },
    { key: 'Esc', desc: 'cancel' },
    { key: 'q', desc: 'quit' },
  ],
  prs: [
    { key: '↑↓ j/k', desc: 'navigate' },
    { key: '↵', desc: 'detail' },
    { key: 'f', desc: 'filter' },
    { key: 'R', desc: 'review' },
    { key: 'S', desc: 'sync + refresh' },
    { key: 'b / Esc', desc: 'back' },
    { key: 'q', desc: 'quit' },
  ],
  prdetail: [
    { key: 'R', desc: 'review' },
    { key: 'b / Esc', desc: 'back' },
    { key: 'q', desc: 'quit' },
  ],
  review: [
    { key: 'b / Esc', desc: 'back' },
    { key: 'q', desc: 'quit' },
  ],
  k8s: [
    { key: '↑↓ j/k', desc: 'navigate' },
    { key: '↵', desc: 'open tab' },
    { key: 'w', desc: 'watch' },
    { key: 'r', desc: 'refresh' },
    { key: 'r-click ctx', desc: 'compare' },
    { key: 'b / Esc', desc: 'close / back' },
    { key: 'q', desc: 'quit' },
  ],
};

export function BottomBar({ currentView }: BottomBarProps) {
  const keys = KEYBINDINGS[currentView] ?? [];

  return (
    <div className="bottom-bar">
      {keys.map((k, i) => (
        <React.Fragment key={k.key}>
          {i > 0 && <span className="separator">│</span>}
          <span className="key-hint">
            <span className="key">{k.key}</span>
            <span className="desc">{k.desc}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
