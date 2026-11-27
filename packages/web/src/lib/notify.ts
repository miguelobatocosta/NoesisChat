import type { NotifyLevel } from '@pausa/shared';

export interface NotifyInput {
  level: NotifyLevel;
  isMention: boolean;
  isReplyToMe: boolean;
  isOwn: boolean;
  roomActive: boolean;
  windowFocused: boolean;
  /** Do not disturb is on for this device (lib/dnd.ts). */
  quiet?: boolean;
}

/**
 * The whole notification policy (SPEC §3.5), as one pure function so it can be tested exhaustively.
 * "Nothing" means nothing, mentions included.
 */
export function shouldNotify(i: NotifyInput): boolean {
  if (i.isOwn || i.quiet) return false;
  if (i.roomActive && i.windowFocused) return false;
  if (i.level === 'none') return false;
  if (i.level === 'all') return true;
  return i.isMention || i.isReplyToMe;
}

function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Asked once, after the user's first sent message, never on page load. */
export function askPermissionOnce(): void {
  if (!notificationsSupported() || Notification.permission !== 'default') return;
  void Notification.requestPermission().catch(() => undefined);
}

export function showNotification(
  title: string,
  body: string,
  tag: string,
  onClick: () => void,
): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, tag, icon: '/favicon.svg' });
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

/** Unread total in the tab title and on the installed app's icon. */
export function setBadge(appName: string, total: number): void {
  document.title = total > 0 ? `(${total}) ${appName}` : appName;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (total > 0) void nav.setAppBadge?.(total).catch(() => undefined);
  else void nav.clearAppBadge?.().catch(() => undefined);
}
