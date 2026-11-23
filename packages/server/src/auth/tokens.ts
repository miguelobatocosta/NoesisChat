import { createHash, randomBytes } from 'node:crypto';
import { SESSION_COOKIE } from '@pausa/shared';

/** URL-safe random token. 32 bytes = 256-bit device token; 16 bytes = 128-bit invite code. */
export function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      /* ignore malformed cookie values */
    }
  }
  return out;
}

export function readSessionToken(cookieHeader: string | undefined): string | undefined {
  const token = parseCookies(cookieHeader)[SESSION_COOKIE];
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

/** CLAUDE.md rule 2: HttpOnly, SameSite=Strict, Path=/, Secure unless plain-http localhost. */
export function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=31536000',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
