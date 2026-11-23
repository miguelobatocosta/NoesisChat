import {
  type ClientEventPayload,
  type NotifyLevel,
  type Room,
  type RoomView,
  slugify,
} from '@pausa/shared';
import type { Db } from '../db';
import { AppError } from '../errors';
import { newId } from '../ids';
import { isStaff, type UserRow } from '../members/service';

export interface RoomRow {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
  description: string | null;
  is_main: number;
  created_by: string | null;
  created_at: number;
  archived_at: number | null;
}

export function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    isMain: row.is_main === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  };
}

export function getRoomRow(db: Db, id: string): RoomRow | undefined {
  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as RoomRow | undefined;
}

export function requireRoom(db: Db, id: string): RoomRow {
  const row = getRoomRow(db, id);
  if (!row) throw new AppError('NOT_FOUND', 'Room not found');
  return row;
}

export function requireWritableRoom(db: Db, id: string): RoomRow {
  const row = requireRoom(db, id);
  if (row.archived_at !== null) throw new AppError('ROOM_ARCHIVED');
  return row;
}

type RoomViewRow = RoomRow & {
  last_read_id: string;
  notify: NotifyLevel;
  hidden: number;
  unread: number;
  mentions: number;
};

const ROOM_VIEW_SQL = `
  SELECT r.*,
         COALESCE(rs.last_read_id, '') AS last_read_id,
         COALESCE(p.notify, 'mentions') AS notify,
         COALESCE(p.hidden, 0) AS hidden,
         (SELECT COUNT(*) FROM messages m
           WHERE m.room_id = r.id AND m.id > COALESCE(rs.last_read_id, '')
             AND m.deleted_at IS NULL AND m.user_id != @userId) AS unread,
         (SELECT COUNT(*) FROM mentions mn JOIN messages m ON m.id = mn.message_id
           WHERE mn.user_id = @userId AND m.room_id = r.id AND m.id > COALESCE(rs.last_read_id, '')
             AND m.deleted_at IS NULL AND m.user_id != @userId) AS mentions
  FROM rooms r
  LEFT JOIN read_state rs ON rs.room_id = r.id AND rs.user_id = @userId
  LEFT JOIN room_prefs p ON p.room_id = r.id AND p.user_id = @userId`;

function toRoomView(row: RoomViewRow): RoomView {
  return {
    ...toRoom(row),
    unread: row.unread,
    mentions: row.mentions,
    notify: row.notify,
    hidden: row.hidden === 1,
    lastReadId: row.last_read_id || null,
  };
}

/** All rooms with my unread/mention counts and preferences. Main room first, then by name. */
export function listRoomsFor(db: Db, userId: string): RoomView[] {
  const rows = db
    .prepare(`${ROOM_VIEW_SQL} ORDER BY r.is_main DESC, r.name COLLATE NOCASE`)
    .all({ userId }) as RoomViewRow[];
  return rows.map(toRoomView);
}

export function roomViewFor(db: Db, userId: string, roomId: string): RoomView {
  const row = db.prepare(`${ROOM_VIEW_SQL} WHERE r.id = @roomId`).get({ userId, roomId }) as
    RoomViewRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Room not found');
  return toRoomView(row);
}

function uniqueSlug(db: Db, name: string, exceptId?: string): string {
  const slug = slugify(name);
  if (!slug) throw new AppError('VALIDATION', 'Room name needs at least one letter or number');
  const clash = db.prepare('SELECT id FROM rooms WHERE slug = ?').get(slug) as
    { id: string } | undefined;
  if (clash && clash.id !== exceptId) throw new AppError('ROOM_EXISTS');
  return slug;
}

export function createRoom(
  db: Db,
  actor: UserRow,
  input: ClientEventPayload<'rooms:create'>,
): RoomView {
  const slug = uniqueSlug(db, input.name);
  const id = newId();
  db.prepare(
    `INSERT INTO rooms (id, slug, name, emoji, description, is_main, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, slug, input.name, input.emoji ?? null, input.description || null, actor.id, Date.now());
  return roomViewFor(db, actor.id, id);
}

/** Creator, admins and host manage a room. Only the host touches #geral (SPEC §2, §3.2). */
export function canManageRoom(actor: UserRow, room: RoomRow): boolean {
  if (room.is_main === 1) return actor.role === 'host';
  return isStaff(actor) || room.created_by === actor.id;
}

export function updateRoom(
  db: Db,
  actor: UserRow,
  input: ClientEventPayload<'rooms:update'>,
): Room {
  const room = requireRoom(db, input.roomId);
  if (!canManageRoom(actor, room)) throw new AppError('FORBIDDEN', 'Not allowed to edit this room');

  const name = input.name ?? room.name;
  const slug = input.name !== undefined ? uniqueSlug(db, input.name, room.id) : room.slug;
  const emoji = input.emoji !== undefined ? input.emoji : room.emoji;
  const description =
    input.description !== undefined ? input.description || null : room.description;

  db.prepare('UPDATE rooms SET name = ?, slug = ?, emoji = ?, description = ? WHERE id = ?').run(
    name,
    slug,
    emoji,
    description,
    room.id,
  );
  return toRoom(requireRoom(db, room.id));
}

export function archiveRoom(
  db: Db,
  actor: UserRow,
  input: ClientEventPayload<'rooms:archive'>,
): Room {
  const room = requireRoom(db, input.roomId);
  if (room.is_main === 1) throw new AppError('MAIN_ROOM_PROTECTED');
  if (!canManageRoom(actor, room))
    throw new AppError('FORBIDDEN', 'Not allowed to archive this room');
  db.prepare('UPDATE rooms SET archived_at = ? WHERE id = ?').run(
    input.archived ? Date.now() : null,
    room.id,
  );
  return toRoom(requireRoom(db, room.id));
}

export function updatePrefs(
  db: Db,
  actor: UserRow,
  input: ClientEventPayload<'prefs:update'>,
): { roomId: string; notify: NotifyLevel; hidden: boolean } {
  const room = requireRoom(db, input.roomId);
  if (input.hidden && room.is_main === 1) throw new AppError('MAIN_ROOM_PROTECTED');
  const current = db
    .prepare('SELECT notify, hidden FROM room_prefs WHERE user_id = ? AND room_id = ?')
    .get(actor.id, room.id) as { notify: NotifyLevel; hidden: number } | undefined;
  const notify = input.notify ?? current?.notify ?? 'mentions';
  const hidden = input.hidden ?? current?.hidden === 1;
  db.prepare(
    `INSERT INTO room_prefs (user_id, room_id, notify, hidden) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, room_id) DO UPDATE SET notify = excluded.notify, hidden = excluded.hidden`,
  ).run(actor.id, room.id, notify, hidden ? 1 : 0);
  return { roomId: room.id, notify, hidden };
}
