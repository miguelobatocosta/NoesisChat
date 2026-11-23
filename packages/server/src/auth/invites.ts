import {
  cleanDisplayName,
  INVITE_EXPIRY_MS,
  type InviteExpiry,
  type InviteStatus,
  type InviteView,
  LIMITS,
  nameKey,
  type Role,
} from '@pausa/shared';
import type { Config } from '../config';
import { type Db, placeholders } from '../db';
import { AppError } from '../errors';
import { newId } from '../ids';
import { getUser, type UserRow } from '../members/service';
import { createDevice } from './sessions';
import { randomToken, sha256 } from './tokens';

interface InviteRow {
  id: string;
  code_hash: string;
  created_by: string | null;
  intended_name: string | null;
  grant_role: 'host' | 'member';
  for_user_id: string | null;
  max_uses: number;
  uses: number;
  expires_at: number;
  created_at: number;
  revoked_at: number | null;
}

export interface CreateInviteInput {
  createdBy: string | null;
  intendedName?: string | null;
  expiresIn?: InviteExpiry;
  grantRole?: 'host' | 'member';
  forUserId?: string | null;
}

/** Creates an invite and returns the plain code exactly once; only its hash is stored. */
export function createInvite(
  db: Db,
  input: CreateInviteInput,
): { invite: InviteView; code: string } {
  const code = randomToken(16); // 128-bit, 22 base64url chars
  const now = Date.now();
  const id = newId();
  const intended = input.intendedName ? cleanDisplayName(input.intendedName) : null;
  db.prepare(
    `INSERT INTO invites (id, code_hash, created_by, intended_name, grant_role, for_user_id, max_uses, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id,
    sha256(code),
    input.createdBy,
    intended,
    input.grantRole ?? 'member',
    input.forUserId ?? null,
    now + INVITE_EXPIRY_MS[input.expiresIn ?? '24h'],
    now,
  );
  return { invite: getInviteView(db, id)!, code };
}

/** The code travels in the URL fragment, so it never reaches server or proxy logs (SPEC §7.3). */
export function inviteLink(baseUrl: string, code: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/join#${code}`;
}

export function inviteBaseUrl(config: Config, requestOrigin?: string): string {
  return config.publicUrl ?? requestOrigin ?? `http://localhost:${config.port}`;
}

function statusOf(row: InviteRow, now = Date.now()): InviteStatus {
  if (row.revoked_at !== null) return 'revoked';
  if (row.uses >= row.max_uses) return 'used';
  if (row.expires_at <= now) return 'expired';
  return 'active';
}

function toViews(db: Db, rows: InviteRow[]): InviteView[] {
  if (rows.length === 0) return [];
  const redemptions = db
    .prepare(
      `SELECT r.invite_id, r.user_id, u.display_name, r.redeemed_at
       FROM invite_redemptions r JOIN users u ON u.id = r.user_id
       WHERE r.invite_id IN (${placeholders(rows.length)}) ORDER BY r.redeemed_at`,
    )
    .all(...rows.map((r) => r.id)) as {
    invite_id: string;
    user_id: string;
    display_name: string;
    redeemed_at: number;
  }[];

  return rows.map((row) => ({
    id: row.id,
    intendedName: row.intended_name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    uses: row.uses,
    revokedAt: row.revoked_at,
    status: statusOf(row),
    redemptions: redemptions
      .filter((r) => r.invite_id === row.id)
      .map((r) => ({ userId: r.user_id, displayName: r.display_name, at: r.redeemed_at })),
  }));
}

export function getInviteView(db: Db, id: string): InviteView | undefined {
  const row = db.prepare('SELECT * FROM invites WHERE id = ?').get(id) as InviteRow | undefined;
  return row ? toViews(db, [row])[0] : undefined;
}

/** Member invites only; host bootstrap/device links from the CLI aren't shown in the panel. */
export function listInvites(db: Db): InviteView[] {
  const rows = db
    .prepare(
      `SELECT * FROM invites WHERE grant_role = 'member' AND for_user_id IS NULL ORDER BY id DESC LIMIT 100`,
    )
    .all() as InviteRow[];
  return toViews(db, rows);
}

export function revokeInvite(db: Db, id: string): InviteView {
  const res = db
    .prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .run(Date.now(), id);
  const view = getInviteView(db, id);
  if (!view) throw new AppError('NOT_FOUND', 'Invite not found');
  if (res.changes === 0 && view.status !== 'revoked')
    throw new AppError('NOT_FOUND', 'Invite not found');
  return view;
}

export interface RedeemResult {
  user: UserRow;
  deviceId: string;
  token: string;
  isNewUser: boolean;
}

/**
 * Redeems an invite (SPEC §3.1, §7.3). Every invite problem returns the same INVITE_INVALID so the
 * response never reveals whether a code exists, expired or was used.
 */
export function redeemInvite(
  db: Db,
  input: { code: string; displayName?: string | undefined; deviceLabel: string },
): RedeemResult {
  return db.transaction((): RedeemResult => {
    const invite = db
      .prepare('SELECT * FROM invites WHERE code_hash = ?')
      .get(sha256(input.code)) as InviteRow | undefined;
    if (!invite || statusOf(invite) !== 'active') throw new AppError('INVITE_INVALID');

    const now = Date.now();
    let user: UserRow;
    let isNewUser = false;

    if (invite.for_user_id) {
      // Device link: sign an existing user in on another browser.
      const existing = getUser(db, invite.for_user_id);
      if (!existing || existing.revoked_at !== null) throw new AppError('INVITE_INVALID');
      user = existing;
    } else {
      const role: Role = invite.grant_role === 'host' ? 'host' : 'member';
      if (role === 'host') {
        const host = db.prepare(`SELECT id FROM users WHERE role = 'host'`).get();
        if (host) throw new AppError('INVITE_INVALID');
      }
      const name = cleanDisplayName(invite.intended_name ?? input.displayName ?? '');
      if (name.length < 2 || name.length > LIMITS.displayName) {
        throw new AppError('VALIDATION', 'Display name must be 2–32 characters');
      }
      const key = nameKey(name);
      if (db.prepare('SELECT 1 FROM users WHERE name_key = ?').get(key))
        throw new AppError('NAME_TAKEN');

      const id = newId();
      db.prepare(
        'INSERT INTO users (id, display_name, name_key, role, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(id, name, key, role, now);
      // Existing history starts as read, so a newcomer isn't greeted by hundreds of unread badges.
      db.prepare(
        `INSERT INTO read_state (user_id, room_id, last_read_id)
         SELECT ?, r.id, COALESCE((SELECT MAX(m.id) FROM messages m WHERE m.room_id = r.id), '') FROM rooms r`,
      ).run(id);
      user = getUser(db, id)!;
      isNewUser = true;
    }

    const { deviceId, token } = createDevice(db, user.id, input.deviceLabel);
    db.prepare('UPDATE invites SET uses = uses + 1 WHERE id = ?').run(invite.id);
    db.prepare(
      'INSERT INTO invite_redemptions (invite_id, user_id, device_id, redeemed_at) VALUES (?, ?, ?, ?)',
    ).run(invite.id, user.id, deviceId, now);
    return { user, deviceId, token, isNewUser };
  })();
}
