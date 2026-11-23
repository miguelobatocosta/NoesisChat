import type { Role } from '@pausa/shared';
import type { Db } from '../db';
import { newId } from '../ids';
import { randomToken, sha256 } from './tokens';

export interface Session {
  deviceId: string;
  userId: string;
  role: Role;
}

/** Looks up a device by its token. Revoked devices and revoked users get nothing. */
export function findSession(db: Db, token: string): Session | null {
  const row = db
    .prepare(
      `SELECT d.id AS deviceId, u.id AS userId, u.role AS role
       FROM devices d JOIN users u ON u.id = d.user_id
       WHERE d.token_hash = ? AND d.revoked_at IS NULL AND u.revoked_at IS NULL`,
    )
    .get(sha256(token)) as Session | undefined;
  return row ?? null;
}

export function touchDevice(db: Db, deviceId: string): void {
  db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(Date.now(), deviceId);
}

/** Creates a device and returns its token. The token is never stored, only its hash. */
export function createDevice(
  db: Db,
  userId: string,
  label: string,
): { deviceId: string; token: string } {
  const token = randomToken(32);
  const deviceId = newId();
  db.prepare(
    'INSERT INTO devices (id, user_id, token_hash, label, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(deviceId, userId, sha256(token), label.slice(0, 80), Date.now());
  return { deviceId, token };
}

export function revokeDevice(db: Db, deviceId: string): void {
  db.prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(
    Date.now(),
    deviceId,
  );
}

export function revokeUserDevices(db: Db, userId: string): void {
  db.prepare('UPDATE devices SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(
    Date.now(),
    userId,
  );
}

export function countDevices(db: Db, userId: string): number {
  return (
    db
      .prepare('SELECT COUNT(*) AS n FROM devices WHERE user_id = ? AND revoked_at IS NULL')
      .get(userId) as {
      n: number;
    }
  ).n;
}

/** "Edge · Windows" from a User-Agent, for the admin panel. Best effort, never trusted. */
export function deviceLabel(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}
