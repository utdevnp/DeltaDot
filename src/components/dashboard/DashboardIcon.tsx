import type { ReactNode } from 'react';

export type DashboardIconName =
  | 'activity'
  | 'alert'
  | 'arrow-right'
  | 'branch'
  | 'check'
  | 'clock'
  | 'deployment'
  | 'jira'
  | 'kubernetes'
  | 'pull-request'
  | 'refresh'
  | 'repository'
  | 'settings'
  | 'sync'
  | 'workspace';

const paths: Record<DashboardIconName, ReactNode> = {
  activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
  alert: <><path d="m12 3 9 16H3l9-16Z" /><path d="M12 9v4M12 16h.01" /></>,
  'arrow-right': <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  branch: <><circle cx="6" cy="4" r="2" /><circle cx="6" cy="20" r="2" /><circle cx="18" cy="16" r="2" /><path d="M6 6v12M18 14V9a3 3 0 0 0-3-3H9" /><path d="m12 3-3 3 3 3" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  deployment: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /><path d="M7 10v4a3 3 0 0 0 3 3h4" /><path d="m12 14 2 3-2 3" /></>,
  jira: <><path d="M12 3 21 12 12 21 3 12 12 3Z" /><path d="m12 7 5 5-5 5-5-5 5-5Z" /></>,
  kubernetes: <><path d="m12 3 7.8 4.5v9L12 21l-7.8-4.5v-9L12 3Z" /><path d="m12 8 4 2.3v4.4l-4 2.3-4-2.3v-4.4L12 8Z" /><path d="M12 3v5M19.8 7.5 16 9.7M19.8 16.5 16 14.3M12 21v-4.7M4.2 16.5 8 14.3M4.2 7.5 8 9.7" /></>,
  'pull-request': <><path d="M6 3v12" /><path d="M6 7h8a4 4 0 0 1 4 4v10" /><circle cx="6" cy="3" r="2" /><circle cx="6" cy="15" r="2" /><circle cx="18" cy="21" r="2" /></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" /></>,
  repository: <><path d="M4 6.5 12 3l8 3.5-8 3.5-8-3.5Z" /><path d="m4 12 8 3.5 8-3.5M4 17.5 12 21l8-3.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.4-2.8 2.8-1.5-1.5a7.8 7.8 0 0 1-2 .8V21h-4v-2.4a7.8 7.8 0 0 1-2-.8l-1.5 1.5-2.8-2.8 1.5-1.5a7.8 7.8 0 0 1-.8-2H3v-4h2.4a7.8 7.8 0 0 1 .8-2L4.7 5.5l2.8-2.8L9 4.2a7.8 7.8 0 0 1 2-.8V1h4v2.4a7.8 7.8 0 0 1 2 .8l1.5-1.5 2.8 2.8-1.5 1.5a7.8 7.8 0 0 1 .8 2H23v4h-2.4a7.8 7.8 0 0 1-.8 2Z" transform="translate(-1 1) scale(.95)" /></>,
  sync: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" /></>,
  workspace: <><path d="M3 7.5h7l2 2h9v10H3z" /><path d="M3 7.5V5h7l2 2" /></>,
};

export function DashboardIcon({ name, size = 18, className }: { name: DashboardIconName; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
