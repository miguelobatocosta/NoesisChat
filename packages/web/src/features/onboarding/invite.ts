// The invite code waiting to be used: from the address (/join#<code>) or handed over by
// public/invite-handoff.js through this tab's sessionStorage (DECISIONS D-50).
const KEY = 'pausa.invite';

export function pendingInvite(): string | null {
  if (window.location.pathname === '/join' && window.location.hash.length > 1) {
    return window.location.hash.slice(1);
  }
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Forget the code: it has been used, or this browser already has a session. */
export function clearInvite(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: nothing was stored */
  }
}
