import type { Member, Role, SessionUser } from '@pausa/shared';
import type { Db } from '../db';
import { AppError } from '../errors';
import type { Presence } from './presence';

export interface UserRow {
  id: string;
  display_name: string;
  name_key: string;
  role: Role;
  created_at: number;
  last_seen_at: number | null;
  revoked_at: number | null;
}

export function getUser(db: Db, id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function toSessionUser(row: UserRow): SessionUser {
  return { id: row.id, displayName: row.display_name, role: row.role };
}

export function toMember(row: UserRow, presence: Presence): Member {
  return {
    ...toSessionUser(row),
    online: row.revoked_at === null && presence.isOnline(row.id),
    joinedAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function listMembers(db: Db, presence: Presence): Member[] {
  const rows = db
    .prepare('SELECT * FROM users WHERE revoked_at IS NULL ORDER BY display_name COLLATE NOCASE')
    .all() as UserRow[];
  return rows.map((r) => toMember(r, presence));
}

/**
 * The acting user, re-read on every event so a role change or revocation takes effect immediately
 * (never trust what the socket was when it connected).
 */
export function loadActor(db: Db, userId: string): UserRow {
  const row = getUser(db, userId);
  if (!row || row.revoked_at !== null)
    throw new AppError('UNAUTHORIZED', 'User revoked or missing');
  return row;
}

export function requireRole(actor: UserRow, roles: Role[]): void {
  if (!roles.includes(actor.role))
    throw new AppError('FORBIDDEN', `Requires role ${roles.join('/')}`);
}

export const isStaff = (actor: UserRow) => actor.role === 'host' || actor.role === 'admin';

export function markSeen(db: Db, userId: string): void {
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(Date.now(), userId);
}
