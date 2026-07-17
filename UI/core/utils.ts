import type { RepoStatus } from './types.js';

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function toUsername(raw: string): string {
  const emailMatch = raw.match(/<([^>]+)>/);
  const email = emailMatch ? emailMatch[1]! : raw;
  return email.split('@')[0]!.split('+').pop()!;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'now';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

export function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function statusIcon(status: RepoStatus, frame: number): { char: string; color: string } {
  const spin = SPINNER[(frame) % SPINNER.length]!;
  switch (status) {
    case 'loading': case 'stale': case 'syncing': return { char: spin, color: 'cyanBright' };
    case 'error':   return { char: '⚠', color: 'yellowBright' };
    case 'synced':  return { char: '●', color: 'greenBright' };
    case 'behind':  return { char: '●', color: 'redBright' };
  }
}
