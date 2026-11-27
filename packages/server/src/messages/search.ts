import type { ClientEventPayload, Message } from '@pausa/shared';
import type { Db } from '../db';
import { hydrate, type MessageRow } from './service';

const PAGE = 30;
const MAX_TERMS = 8;

/**
 * Turns what someone typed into a safe FTS5 query: only letters and digits survive, each word becomes
 * a quoted prefix ("reuni"* matches "reunião"), all words must match. Never passes raw input to MATCH.
 */
export function ftsQuery(text: string): string | null {
  const words = (text.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_TERMS);
  return words.length ? words.map((w) => `"${w}"*`).join(' ') : null;
}

/** Newest first, 30 at a time; optional room and author filters. Archived rooms included. */
export function searchMessages(
  db: Db,
  input: ClientEventPayload<'search:messages'>,
): { messages: Message[]; hasMore: boolean } {
  const match = ftsQuery(input.query);
  if (!match) return { messages: [], hasMore: false };

  const where = ['messages_fts MATCH ?', 'm.deleted_at IS NULL'];
  const args: (string | number)[] = [match];
  if (input.roomId) {
    where.push('m.room_id = ?');
    args.push(input.roomId);
  }
  if (input.userId) {
    where.push('m.user_id = ?');
    args.push(input.userId);
  }
  if (input.before) {
    where.push('m.id < ?');
    args.push(input.before);
  }

  const rows = db
    .prepare(
      `SELECT m.* FROM messages_fts f JOIN messages m ON m.id = f.message_id
       WHERE ${where.join(' AND ')} ORDER BY m.id DESC LIMIT ?`,
    )
    .all(...args, PAGE + 1) as MessageRow[];
  return { messages: hydrate(db, rows.slice(0, PAGE)), hasMore: rows.length > PAGE };
}
