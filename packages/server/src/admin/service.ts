import type { AdminLogEntry, ClientEventPayload } from '@pausa/shared';
import { revokeUserDevices } from '../auth/sessions';
import type { Db } from '../db';
import { AppError } from '../errors';
import { newId } from '../ids';
import { getUser, requireRole, type UserRow } from '../members/service';

/** Every admin/host action is recorded (D-36). */
export function logAdmin(
  db: Db,
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  detail?: Record<string, unknown>,
): void {
  db.prepare(
    'INSERT INTO admin_log (id, actor_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    newId(),
    actorId,
    action,
    targetType,
    targetId,
    detail ? JSON.stringify(detail) : null,
    Date.now(),
  );
}

export function listAdminLog(
  db: Db,
  before?: string,
): { entries: AdminLogEntry[]; hasMore: boolean } {
  const limit = 50;
  const rows = db
    .prepare(
      `SELECT l.*, u.display_name AS actor_name FROM admin_log l LEFT JOIN users u ON u.id = l.actor_id
       ${before ? 'WHERE l.id < ?' : ''} ORDER BY l.id DESC LIMIT ?`,
    )
    .all(...(before ? [before, limit + 1] : [limit + 1])) as {
    id: string;
    actor_id: string | null;
    actor_name: string | null;
    action: string;
    target_type: string;
    target_id: string;
    detail: string | null;
    created_at: number;
  }[];
  return {
    hasMore: rows.length > limit,
    entries: rows.slice(0, limit).map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      actorName: r.actor_name,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      detail: r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : null,
      createdAt: r.created_at,
    })),
  };
}

/**
 * Revokes a member: account and every device. Admins may revoke members; only the host may revoke
 * admins; nobody revokes the host or themselves.
 */
export function revokeMember(db: Db, actor: UserRow, userId: string): UserRow {
  requireRole(actor, ['host', 'admin']);
  return db.transaction(() => {
    const target = getUser(db, userId);
    if (!target || target.revoked_at !== null) throw new AppError('NOT_FOUND', 'Member not found');
    if (target.id === actor.id) throw new AppError('FORBIDDEN', 'Cannot revoke yourself');
    if (target.is_bot === 1) throw new AppError('FORBIDDEN', 'Mascots cannot be revoked');
    if (target.role === 'host') throw new AppError('FORBIDDEN', 'The host cannot be revoked');
    if (target.role === 'admin' && actor.role !== 'host')
      throw new AppError('FORBIDDEN', 'Only the host revokes admins');

    db.prepare('UPDATE users SET revoked_at = ? WHERE id = ?').run(Date.now(), target.id);
    revokeUserDevices(db, target.id);
    logAdmin(db, actor.id, 'member.revoke', 'user', target.id, {
      displayName: target.display_name,
    });
    return getUser(db, target.id)!;
  })();
}

export function setRole(
  db: Db,
  actor: UserRow,
  input: ClientEventPayload<'admin:members:setRole'>,
): UserRow {
  requireRole(actor, ['host']);
  return db.transaction(() => {
    const target = getUser(db, input.userId);
    if (!target || target.revoked_at !== null) throw new AppError('NOT_FOUND', 'Member not found');
    if (target.role === 'host') throw new AppError('FORBIDDEN', 'The host role cannot change');
    if (target.is_bot === 1) throw new AppError('FORBIDDEN', 'Mascots have no role');
    if (target.role !== input.role) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(input.role, target.id);
      logAdmin(db, actor.id, 'member.role', 'user', target.id, {
        from: target.role,
        to: input.role,
      });
    }
    return getUser(db, target.id)!;
  })();
}
