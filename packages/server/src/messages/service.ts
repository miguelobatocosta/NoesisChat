import {
  type Attachment,
  type ClientEventPayload,
  extractMentionIds,
  LIMITS,
  type Message,
  type Reaction,
  type ReplyPreview,
} from '@pausa/shared';
import { currentSeq, type Db, nextSeq, placeholders } from '../db';
import { AppError } from '../errors';
import { newId } from '../ids';
import { isStaff, type UserRow } from '../members/service';
import { requireNotMuted } from '../moderation/service';
import { requireRoom, requireWritableRoom } from '../rooms/service';

export interface MessageRow {
  id: string;
  room_id: string;
  user_id: string;
  client_id: string;
  body: string | null;
  reply_to_id: string | null;
  seq: number;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
}

interface AttachmentRow {
  id: string;
  message_id: string | null;
  uploader_id: string;
  mime: string;
  size: number;
  path: string;
  width: number | null;
  height: number | null;
  position: number;
}

export function toAttachment(
  row: Pick<AttachmentRow, 'id' | 'mime' | 'size' | 'width' | 'height'>,
): Attachment {
  return {
    id: row.id,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    url: `/files/${row.id}`,
  };
}

/** Turns rows into wire messages with attachments, reactions, mentions and reply previews (5 queries total). */
export function hydrate(db: Db, rows: MessageRow[]): Message[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const inIds = placeholders(ids.length);

  const attachments = db
    .prepare(`SELECT * FROM attachments WHERE message_id IN (${inIds}) ORDER BY position`)
    .all(...ids) as AttachmentRow[];
  const reactions = db
    .prepare(
      `SELECT message_id, emoji, user_id FROM reactions WHERE message_id IN (${inIds}) ORDER BY created_at`,
    )
    .all(...ids) as { message_id: string; emoji: string; user_id: string }[];
  const mentions = db
    .prepare(`SELECT message_id, user_id FROM mentions WHERE message_id IN (${inIds})`)
    .all(...ids) as { message_id: string; user_id: string }[];

  const replyIds = [...new Set(rows.map((r) => r.reply_to_id).filter((x): x is string => !!x))];
  const replies = new Map<string, ReplyPreview>();
  if (replyIds.length) {
    const replyRows = db
      .prepare(
        `SELECT m.id, m.user_id, m.body, m.deleted_at,
                EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id) AS has_attachments
         FROM messages m WHERE m.id IN (${placeholders(replyIds.length)})`,
      )
      .all(...replyIds) as {
      id: string;
      user_id: string;
      body: string | null;
      deleted_at: number | null;
      has_attachments: number;
    }[];
    for (const r of replyRows) {
      replies.set(r.id, {
        id: r.id,
        userId: r.user_id,
        body: r.deleted_at ? null : (r.body?.slice(0, 200) ?? null),
        deleted: r.deleted_at !== null,
        hasAttachments: r.has_attachments === 1,
      });
    }
  }

  return rows.map((row) => {
    const grouped = new Map<string, string[]>();
    for (const r of reactions) {
      if (r.message_id !== row.id) continue;
      grouped.set(r.emoji, [...(grouped.get(r.emoji) ?? []), r.user_id]);
    }
    const reactionList: Reaction[] = [...grouped].map(([emoji, userIds]) => ({ emoji, userIds }));
    return {
      id: row.id,
      roomId: row.room_id,
      userId: row.user_id,
      clientId: row.client_id,
      body: row.deleted_at ? null : row.body,
      replyTo: row.reply_to_id ? (replies.get(row.reply_to_id) ?? null) : null,
      attachments: attachments.filter((a) => a.message_id === row.id).map(toAttachment),
      reactions: reactionList,
      mentions: mentions.filter((m) => m.message_id === row.id).map((m) => m.user_id),
      seq: row.seq,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      deletedAt: row.deleted_at,
    };
  });
}

function getMessageRow(db: Db, id: string): MessageRow | undefined {
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined;
}

function requireMessage(db: Db, id: string): MessageRow {
  const row = getMessageRow(db, id);
  if (!row) throw new AppError('NOT_FOUND', 'Message not found');
  return row;
}

function getMessage(db: Db, id: string): Message {
  return hydrate(db, [requireMessage(db, id)])[0]!;
}

/** Scrollback: up to `limit` messages before `before` (or the newest), returned oldest → newest. */
export function history(
  db: Db,
  input: ClientEventPayload<'messages:history'>,
): { messages: Message[]; hasMore: boolean } {
  requireRoom(db, input.roomId);
  const limit = input.limit ?? LIMITS.historyPage;
  const rows = (
    input.before
      ? db
          .prepare('SELECT * FROM messages WHERE room_id = ? AND id < ? ORDER BY id DESC LIMIT ?')
          .all(input.roomId, input.before, limit + 1)
      : db
          .prepare('SELECT * FROM messages WHERE room_id = ? ORDER BY id DESC LIMIT ?')
          .all(input.roomId, limit + 1)
  ) as MessageRow[];
  const hasMore = rows.length > limit;
  return { messages: hydrate(db, rows.slice(0, limit).reverse()), hasMore };
}

/**
 * Catch-up after a reconnect (D-33): every message in the room whose seq moved past `sinceSeq`, which
 * covers new messages, edits, deletes and reaction changes alike.
 */
export function sync(
  db: Db,
  input: ClientEventPayload<'messages:sync'>,
): { messages: Message[]; latestSeq: number; truncated: boolean } {
  requireRoom(db, input.roomId);
  return db.transaction(() => {
    const latestSeq = currentSeq(db);
    const rows = db
      .prepare('SELECT * FROM messages WHERE room_id = ? AND seq > ? ORDER BY seq LIMIT ?')
      .all(input.roomId, input.sinceSeq, LIMITS.syncMax + 1) as MessageRow[];
    const truncated = rows.length > LIMITS.syncMax;
    return { messages: truncated ? [] : hydrate(db, rows), latestSeq, truncated };
  })();
}

/** Mentioned IDs that belong to real, active users. */
function validMentions(db: Db, body: string): string[] {
  const ids = extractMentionIds(body);
  if (ids.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT id FROM users WHERE revoked_at IS NULL AND id IN (${placeholders(ids.length)})`,
    )
    .all(...ids) as { id: string }[];
  const valid = new Set(rows.map((r) => r.id));
  return ids.filter((id) => valid.has(id));
}

function replaceMentions(db: Db, messageId: string, userIds: string[]): void {
  db.prepare('DELETE FROM mentions WHERE message_id = ?').run(messageId);
  const insert = db.prepare('INSERT INTO mentions (message_id, user_id) VALUES (?, ?)');
  for (const id of userIds) insert.run(messageId, id);
}

export function sendMessage(
  db: Db,
  actor: UserRow,
  input: ClientEventPayload<'messages:send'>,
): { message: Message; created: boolean } {
  return db.transaction(() => {
    // Idempotency (D-38): a retry after a lost ack returns the original message.
    const existing = db
      .prepare('SELECT * FROM messages WHERE user_id = ? AND client_id = ?')
      .get(actor.id, input.clientId) as MessageRow | undefined;
    if (existing) return { message: hydrate(db, [existing])[0]!, created: false };

    requireWritableRoom(db, input.roomId);
    requireNotMuted(db, actor.id, input.roomId);
    const body = input.body.trim();
    const attachmentIds = [...new Set(input.attachmentIds)];

    if (attachmentIds.length) {
      const rows = db
        .prepare(
          `SELECT id, uploader_id, message_id FROM attachments WHERE id IN (${placeholders(attachmentIds.length)})`,
        )
        .all(...attachmentIds) as { id: string; uploader_id: string; message_id: string | null }[];
      const usable = rows.filter((r) => r.uploader_id === actor.id && r.message_id === null);
      if (usable.length !== attachmentIds.length)
        throw new AppError('NOT_FOUND', 'Attachment not found');
    }
    if (!body && attachmentIds.length === 0) throw new AppError('EMPTY_MESSAGE');

    if (input.replyToId) {
      const target = getMessageRow(db, input.replyToId);
      if (!target || target.room_id !== input.roomId || target.deleted_at !== null) {
        throw new AppError('NOT_FOUND', 'Reply target not found');
      }
    }

    const id = newId();
    const now = Date.now();
    db.prepare(
      `INSERT INTO messages (id, room_id, user_id, client_id, body, reply_to_id, seq, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.roomId,
      actor.id,
      input.clientId,
      body || null,
      input.replyToId ?? null,
      nextSeq(db),
      now,
    );

    const attach = db.prepare('UPDATE attachments SET message_id = ?, position = ? WHERE id = ?');
    attachmentIds.forEach((attId, position) => attach.run(id, position, attId));
    replaceMentions(db, id, validMentions(db, body));

    return { message: getMessage(db, id), created: true };
  })();
}

export function editMessage(
  db: Db,
  actor: UserRow,
  input: ClientEventPayload<'messages:edit'>,
): Message {
  return db.transaction(() => {
    const row = requireMessage(db, input.messageId);
    if (row.deleted_at !== null) throw new AppError('NOT_FOUND', 'Message deleted');
    if (row.user_id !== actor.id) throw new AppError('FORBIDDEN', 'Only the author can edit');
    requireWritableRoom(db, row.room_id);
    requireNotMuted(db, actor.id, row.room_id);

    const body = input.body.trim();
    const hasAttachments = !!db
      .prepare('SELECT 1 FROM attachments WHERE message_id = ?')
      .get(row.id);
    if (!body && !hasAttachments) throw new AppError('EMPTY_MESSAGE');
    if ((body || null) === row.body) return getMessage(db, row.id);

    db.prepare('UPDATE messages SET body = ?, edited_at = ?, seq = ? WHERE id = ?').run(
      body || null,
      Date.now(),
      nextSeq(db),
      row.id,
    );
    replaceMentions(db, row.id, validMentions(db, body));
    return getMessage(db, row.id);
  })();
}

/**
 * Delete (D-34): wipes the body, reactions, mentions and attachments, leaves a tombstone.
 * Returns the on-disk files to remove once the transaction has committed.
 */
export function deleteMessage(
  db: Db,
  actor: UserRow,
  input: ClientEventPayload<'messages:delete'>,
): { message: Message; files: string[]; byModerator: boolean; authorId: string } {
  return db.transaction(() => {
    const row = requireMessage(db, input.messageId);
    const isAuthor = row.user_id === actor.id;
    if (!isAuthor && !isStaff(actor))
      throw new AppError('FORBIDDEN', 'Not allowed to delete this message');
    if (row.deleted_at !== null) {
      return {
        message: getMessage(db, row.id),
        files: [],
        byModerator: false,
        authorId: row.user_id,
      };
    }

    const files = (
      db.prepare('SELECT path FROM attachments WHERE message_id = ?').all(row.id) as {
        path: string;
      }[]
    ).map((r) => r.path);
    db.prepare('DELETE FROM attachments WHERE message_id = ?').run(row.id);
    db.prepare('DELETE FROM reactions WHERE message_id = ?').run(row.id);
    db.prepare('DELETE FROM mentions WHERE message_id = ?').run(row.id);
    db.prepare('UPDATE messages SET body = NULL, deleted_at = ?, seq = ? WHERE id = ?').run(
      Date.now(),
      nextSeq(db),
      row.id,
    );
    return {
      message: getMessage(db, row.id),
      files,
      byModerator: !isAuthor,
      authorId: row.user_id,
    };
  })();
}

export function toggleReaction(
  db: Db,
  actor: UserRow,
  input: ClientEventPayload<'reactions:toggle'>,
): Message {
  return db.transaction(() => {
    const row = requireMessage(db, input.messageId);
    if (row.deleted_at !== null) throw new AppError('NOT_FOUND', 'Message deleted');
    requireWritableRoom(db, row.room_id);

    const removed = db
      .prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
      .run(row.id, actor.id, input.emoji);
    if (removed.changes === 0) {
      const distinct = (
        db
          .prepare('SELECT COUNT(DISTINCT emoji) AS n FROM reactions WHERE message_id = ?')
          .get(row.id) as { n: number }
      ).n;
      if (distinct >= 20)
        throw new AppError('VALIDATION', 'Too many different reactions on this message');
      db.prepare(
        'INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)',
      ).run(row.id, actor.id, input.emoji, Date.now());
    }
    db.prepare('UPDATE messages SET seq = ? WHERE id = ?').run(nextSeq(db), row.id);
    return getMessage(db, row.id);
  })();
}

/** Moves my read marker forward (never backwards). */
export function markRead(
  db: Db,
  actor: UserRow,
  input: ClientEventPayload<'read:mark'>,
): { roomId: string; lastReadId: string } {
  const row = requireMessage(db, input.messageId);
  if (row.room_id !== input.roomId) throw new AppError('NOT_FOUND', 'Message not in room');
  db.prepare(
    `INSERT INTO read_state (user_id, room_id, last_read_id) VALUES (?, ?, ?)
     ON CONFLICT (user_id, room_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`,
  ).run(actor.id, input.roomId, input.messageId);
  const state = db
    .prepare('SELECT last_read_id FROM read_state WHERE user_id = ? AND room_id = ?')
    .get(actor.id, input.roomId) as { last_read_id: string };
  return { roomId: input.roomId, lastReadId: state.last_read_id };
}
