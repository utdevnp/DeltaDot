import React from 'react';
import type { View } from '../../core/types.js';

interface AppNavProps {
  currentView: View;
  onNavigate: (view: 'list' | 'prs' | 'review' | 'k8s') => void;
  onOpenSettings: () => void;
}

type NavItem = { view: 'list' | 'prs' | 'review' | 'k8s' | 'config'; label: string; icon: React.ReactNode };

const navItems: NavItem[] = [
  { view: 'list', label: 'Repositories', icon: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /><circle cx="7" cy="7" r="1" /><circle cx="7" cy="12" r="1" /><circle cx="7" cy="17" r="1" /></> },
  { view: 'prs', label: 'Pull requests', icon: <><path d="M6 3v12" /><path d="M6 7h8a4 4 0 0 1 4 4v10" /><circle cx="6" cy="3" r="2" /><circle cx="6" cy="15" r="2" /><circle cx="18" cy="21" r="2" /></> },
  { view: 'review', label: 'AI review', icon: <><path d="M7 3h10a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2Z" /><path d="m8 10 2 2 5-5" /></> },
  { view: 'k8s', label: 'Kubernetes', icon: <><path d="m12 3 7.8 4.5v9L12 21l-7.8-4.5v-9L12 3Z" /><path d="m12 8 4 2.3v4.4l-4 2.3-4-2.3v-4.4L12 8Z" /><path d="M12 3v5M19.8 7.5 16 9.7M19.8 16.5 16 14.3M12 21v-4.7M4.2 16.5 8 14.3M4.2 7.5 8 9.7" /></> },
  { view: 'config', label: 'Settings', icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .3 1.8l.1.1-2.8 2.8-.1-.1a1.65 1.65 0 0 0-1.8-.3 1.65 1.65 0 0 0-1 1.5v.2h-4v-.2a1.65 1.65 0 0 0-1-1.5 1.65 1.65 0 0 0-1.8.3l-.1.1-2.8-2.8.1-.1A1.65 1.65 0 0 0 4.7 15a1.65 1.65 0 0 0-1.5-1H3v-4h.2a1.65 1.65 0 0 0 1.5-1 1.65 1.65 0 0 0-.3-1.8l-.1-.1 2.8-2.8.1.1a1.65 1.65 0 0 0 1.8.3 1.65 1.65 0 0 0 1-1.5V2h4v.2a1.65 1.65 0 0 0 1 1.5 1.65 1.65 0 0 0 1.8-.3l.1-.1 2.8 2.8-.1.1a1.65 1.65 0 0 0-.3 1.8 1.65 1.65 0 0 0 1.5 1h.2v4h-.2a1.65 1.65 0 0 0-1.5 1Z" /></> },
];

function isActive(itemView: NavItem['view'], currentView: View): boolean {
  if (itemView === 'config') return currentView === 'config';
  if (itemView === 'list') return currentView === 'list' || currentView === 'commits' || currentView === 'detail';
  if (itemView === 'prs') return currentView === 'prs' || currentView === 'prdetail';
  return currentView === itemView;
}

export function AppNav({ currentView, onNavigate, onOpenSettings }: AppNavProps) {
  return (
    <nav className="app-nav" aria-label="Primary navigation">
      <button className="app-nav-collapse" type="button" aria-label="Navigation is icon-only" title="Navigation">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <div className="app-nav-items">
        {navItems.map((item) => (
          <button
            key={item.view}
            type="button"
            className={`app-nav-item ${isActive(item.view, currentView) ? 'active' : ''}`}
            aria-label={item.label}
            title={item.label}
            onClick={() => item.view === 'config' ? onOpenSettings() : onNavigate(item.view)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{item.icon}</svg>
          </button>
        ))}
      </div>
      <div className="app-nav-spacer" />
      <div className="app-nav-user" aria-hidden="true">SK<span /></div>
    </nav>
  );
}
