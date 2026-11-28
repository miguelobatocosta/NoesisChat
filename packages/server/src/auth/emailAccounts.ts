import { type AccessStatus, cleanDisplayName, LIMITS, nameKey } from '@pausa/shared';
import type { Db } from '../db';
import { AppError } from '../errors';
import { newId } from '../ids';
import { getUser, type UserRow } from '../members/service';
import { createDevice } from './sessions';

/**
 * Accounts tied to a verified Cloudflare Access email (D-52). Everyone signs up as a member; only
 * the configured owner email is the host, and it attaches to the existing host on first use.
 * Nothing here ever grants admin to anyone else.
 */

function userByEmail(db: Db, email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email) as UserRow | undefined;
}

/** The host account the owner email should attach to: the host, if it has no email yet. */
function unlinkedHost(db: Db): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE role = 'host' AND email IS NULL`).get() as
    UserRow | undefined;
}

/** Which account this email reaches, if any. */
function resolve(db: Db, email: string, ownerEmail: string | null): UserRow | undefined {
  return userByEmail(db, email) ?? (email === ownerEmail ? unlinkedHost(db) : undefined);
}

export function accessStatus(db: Db, email: string, ownerEmail: string | null): AccessStatus {
  const user = resolve(db, email, ownerEmail);
  if (!user) return 'new';
  return user.revoked_at === null ? 'registered' : 'revoked';
}

/** Gives a signed-in account its verified email, unless it has one or someone else uses it. */
export function linkEmail(db: Db, user: UserRow, email: string, ownerEmail: string | null): void {
  if (user.email !== null || user.is_bot === 1 || userByEmail(db, email)) return;
  // The owner email only ever belongs to the host; a member can't claim it by visiting.
  if (email === ownerEmail && user.role !== 'host') return;
  db.prepare('UPDATE users SET email = ? WHERE id = ? AND email IS NULL').run(email, user.id);
}

/** A new device for the account behind this email. */
export function signInByEmail(
  db: Db,
  input: { email: string; ownerEmail: string | null; deviceLabel: string },
): { user: UserRow; token: string } {
  return db.transaction(() => {
    const user = resolve(db, input.email, input.ownerEmail);
    if (!user) throw new AppError('NOT_FOUND', 'No account for this email yet');
    if (user.revoked_at !== null) throw new AppError('FORBIDDEN', 'Access revoked');
    if (user.email === null)
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(input.email, user.id);
    const { token } = createDevice(db, user.id, input.deviceLabel);
    return { user: getUser(db, user.id)!, token };
  })();
}

/** First visit with a new email: a member (or the host, for the owner email when there's none). */
export function joinByEmail(
  db: Db,
  input: { email: string; displayName: string; ownerEmail: string | null; deviceLabel: string },
): { user: UserRow; token: string } {
  return db.transaction(() => {
    if (resolve(db, input.email, input.ownerEmail))
      throw new AppError('FORBIDDEN', 'This email already has an account');

    const name = cleanDisplayName(input.displayName);
    if (name.length < 2 || name.length > LIMITS.displayName)
      throw new AppError('VALIDATION', 'Display name must be 2–32 characters');
    const key = nameKey(name);
    if (db.prepare('SELECT 1 FROM users WHERE name_key = ?').get(key))
      throw new AppError('NAME_TAKEN');

    const hasHost = !!db.prepare(`SELECT 1 FROM users WHERE role = 'host'`).get();
    const role = input.email === input.ownerEmail && !hasHost ? 'host' : 'member';
    const id = newId();
    db.prepare(
      'INSERT INTO users (id, display_name, name_key, role, created_at, email) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, name, key, role, Date.now(), input.email);
    // Same as invites: existing history starts as read.
    db.prepare(
      `INSERT INTO read_state (user_id, room_id, last_read_id)
       SELECT ?, r.id, COALESCE((SELECT MAX(m.id) FROM messages m WHERE m.room_id = r.id), '') FROM rooms r`,
    ).run(id);
    const { token } = createDevice(db, id, input.deviceLabel);
    return { user: getUser(db, id)!, token };
  })();
}
