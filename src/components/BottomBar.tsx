import React, { useEffect, useState } from 'react';
import type { View } from '../../core/types.js';

interface BottomBarProps {
  currentView: View;
  k8sMenuMode?: 'deployments' | 'pods' | 'jobs' | 'pod-drilldown' | 'workload' | 'logs' | 'other';
}

const KEYBINDINGS: Record<View, { key: string; desc: string }[]> = {
  home: [],
  list: [
    { key: '↑↓ j/k', desc: 'navigate' },
    { key: '↵ / c', desc: 'commits' },
    { key: 'r', desc: 'refresh' },
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
    { key: 'r', desc: 'refresh' },
    { key: 'f', desc: 'filter' },
    { key: 'R', desc: 'review' },
    { key: 'S', desc: 'sync + refresh' },
    { key: 'b / Esc', desc: 'back' },
    { key: 'q', desc: 'quit' },
  ],
  prdetail: [
    { key: 'o', desc: 'open PR' },
    { key: 'a', desc: 'approve' },
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
    { key: 'r', desc: 'restart deployment' },
    { key: 'R', desc: 'restart all' },
    { key: 'd', desc: 'describe JSON' },
    { key: 'z', desc: 'wrap logs' },
    { key: 'r-click ctx', desc: 'compare' },
    { key: 'b / Esc', desc: 'close / back' },
    { key: 'q', desc: 'quit' },
  ],
};

export function BottomBar({ currentView, k8sMenuMode }: BottomBarProps) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    window.api.getAppInfo().then(({ version: appVersion }) => setVersion(`v${appVersion.replace(/^v/, '')}`)).catch(() => undefined);
  }, []);

  let keys = KEYBINDINGS[currentView] ?? [];
  if (currentView === 'k8s') {
    const common = [
      { key: '↑↓ j/k', desc: 'navigate' },
      { key: '↵', desc: 'open' },
      { key: 'b / Esc', desc: 'close / back' },
      { key: 'q', desc: 'quit' },
    ];
    if (k8sMenuMode === 'deployments') keys = [...common.slice(0, 2), { key: 'w', desc: 'watch' }, { key: 'r', desc: 'restart deployment' }, { key: 'R', desc: 'restart all' }, { key: 'd', desc: 'describe JSON' }, { key: 'r-click ctx', desc: 'compare' }, ...common.slice(2)];
    else if (k8sMenuMode === 'pods') keys = [...common.slice(0, 2), { key: 'w', desc: 'watch' }, { key: 'r', desc: 'refresh' }, { key: 'd', desc: 'describe JSON' }, { key: 'r-click ctx', desc: 'compare' }, ...common.slice(2)];
    else if (k8sMenuMode === 'jobs') keys = [...common.slice(0, 2), { key: 'r', desc: 'refresh' }, { key: 'd', desc: 'describe JSON' }, { key: '⌘/Ctrl+d', desc: 'delete resource' }, { key: 'r-click ctx', desc: 'compare' }, ...common.slice(2)];
    else if (k8sMenuMode === 'logs') keys = [...common.slice(0, 1), { key: 'w', desc: 'watch logs' }, { key: 'z', desc: 'wrap logs' }, ...common.slice(2)];
    else if (k8sMenuMode === 'pod-drilldown') keys = [...common.slice(0, 2), ...common.slice(2)];
    else if (k8sMenuMode === 'workload') keys = [...common.slice(0, 2), { key: 'r', desc: 'refresh' }, ...common.slice(2)];
    else if (k8sMenuMode === 'other') keys = [...common.slice(0, 2), { key: 'd', desc: 'describe JSON' }, { key: '⌘/Ctrl+d', desc: 'delete resource' }, ...common.slice(2)];
    else keys = common;
  }

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
      <span className="bottom-bar-version">DeltaDot {version || 'v1.1.1'}</span>
    </div>
  );
}
