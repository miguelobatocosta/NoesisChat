import type { Message, MuteView, Standing, StrikeView } from '@pausa/shared';
import { logAdmin } from '../admin/service';
import { type AppContext, ROOM_MEMBERS } from '../context';
import type { Db } from '../db';
import { AppError } from '../errors';
import { newId } from '../ids';
import { hasWord, normalize } from '../mascots/engine';
import { MASCOT_LINES } from '../mascots/lines';
import type { UserRow } from '../members/service';
import { getRoomRow } from '../rooms/service';
import { listTopicRows, type TopicRow } from './topics';

/** The mascot warns this many strikes before a mute (only when that's still above the label). */
const WARN_BEFORE_MUTE = 5;
/** How often ended mutes are closed and announced to clients. Sends check the time themselves. */
const SWEEP_MS = 30_000;

interface MuteRow {
  id: string;
  user_id: string;
  room_id: string;
  topic_id: string;
  until: number;
  created_at: number;
  ended_at: number | null;
  lifted_by: string | null;
}

type Kind = 'warn' | 'label' | 'mute';
const PRIORITY: Record<Kind, number> = { warn: 1, label: 2, mute: 3 };

// --- reads ---------------------------------------------------------------------------------------

function activeMute(db: Db, userId: string, roomId: string, now: number) {
  return db
    .prepare(
      `SELECT m.until, t.name AS topic FROM mutes m JOIN topics t ON t.id = m.topic_id
       WHERE m.user_id = ? AND m.room_id = ? AND m.ended_at IS NULL AND m.until > ?
       ORDER BY m.until DESC LIMIT 1`,
    )
    .get(userId, roomId, now) as { until: number; topic: string } | undefined;
}

/** Called by every write in a room (send, edit). Reactions stay allowed. */
export function requireNotMuted(db: Db, userId: string, roomId: string): void {
  const mute = activeMute(db, userId, roomId, Date.now());
  if (mute) throw new AppError('MUTED', `Muted until ${new Date(mute.until).toISOString()}`);
}

function standingOf(db: Db, userId: string, roomId: string, now = Date.now()): Standing {
  const labels = db
    .prepare(
      `SELECT t.label FROM strikes s JOIN topics t ON t.id = s.topic_id
       WHERE s.user_id = ? AND s.room_id = ? AND t.enabled = 1 AND s.count >= t.label_at
       ORDER BY t.position`,
    )
    .all(userId, roomId) as { label: string }[];
  const mute = activeMute(db, userId, roomId, now);
  return {
    roomId,
    userId,
    labels: labels.map((l) => l.label),
    mutedUntil: mute?.until ?? null,
    mutedTopic: mute?.topic ?? null,
  };
}

/** Everyone in a room with a label or an active mute. */
export function standingsFor(db: Db, roomId: string, now = Date.now()): Standing[] {
  const users = db
    .prepare(
      `SELECT s.user_id FROM strikes s JOIN topics t ON t.id = s.topic_id
         WHERE s.room_id = ? AND t.enabled = 1 AND s.count >= t.label_at
       UNION
       SELECT user_id FROM mutes WHERE room_id = ? AND ended_at IS NULL AND until > ?`,
    )
    .all(roomId, roomId, now) as { user_id: string }[];
  return users.map((u) => standingOf(db, u.user_id, roomId, now));
}

export function listModeration(
  db: Db,
  now = Date.now(),
): { mutes: MuteView[]; strikes: StrikeView[] } {
  const mutes = db
    .prepare(
      `SELECT m.*, t.name AS topic_name FROM mutes m JOIN topics t ON t.id = m.topic_id
       WHERE m.ended_at IS NULL AND m.until > ? ORDER BY m.until`,
    )
    .all(now) as (MuteRow & { topic_name: string })[];
  const strikes = db
    .prepare(
      `SELECT s.user_id, s.room_id, s.topic_id, s.count, t.name, t.label_at, t.mute_at
       FROM strikes s JOIN topics t ON t.id = s.topic_id
       WHERE s.count > 0 ORDER BY s.count DESC, s.updated_at DESC LIMIT 200`,
    )
    .all() as {
    user_id: string;
    room_id: string;
    topic_id: string;
    count: number;
    name: string;
    label_at: number;
    mute_at: number;
  }[];
  return {
    mutes: mutes.map((m) => ({
      id: m.id,
      userId: m.user_id,
      roomId: m.room_id,
      topicId: m.topic_id,
      topicName: m.topic_name,
      until: m.until,
      createdAt: m.created_at,
    })),
    strikes: strikes.map((s) => ({
      userId: s.user_id,
      roomId: s.room_id,
      topicId: s.topic_id,
      topicName: s.name,
      count: s.count,
      labelAt: s.label_at,
      muteAt: s.mute_at,
    })),
  };
}

// --- the moderator -------------------------------------------------------------------------------

/**
 * Mascots moderating topics (D-51): counts at most one strike per topic per message, per person and
 * room. Label at `labelAt`, warning a few strikes before `muteAt`, mute at `muteAt` (never in the
 * main room). When a mute ends, by time or by an admin, that topic's strikes in that room reset.
 */
export class Moderator {
  private readonly sweep: NodeJS.Timeout;

  constructor(private readonly ctx: AppContext) {
    this.expireDue();
    this.sweep = setInterval(() => this.expireDue(), SWEEP_MS);
    this.sweep.unref();
  }

  /** Call after a person's message has been stored and broadcast. */
  onMessage(message: Message, author: UserRow): void {
    if (author.is_bot === 1 || !message.body) return;
    const { db } = this.ctx;
    const room = getRoomRow(db, message.roomId);
    if (!room || room.archived_at !== null || room.mascot_enabled !== 1 || !room.mascot_key) return;

    const text = normalize(message.body);
    const hits = listTopicRows(db, true).filter((t) =>
      (JSON.parse(t.keywords) as string[]).some((k) => hasWord(text, k)),
    );
    if (hits.length === 0) return;

    const isMain = room.is_main === 1;
    const now = Date.now();
    let event: { kind: Kind; topic: TopicRow } | null = null;
    const bump = db.prepare(
      `INSERT INTO strikes (user_id, room_id, topic_id, count, updated_at) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT (user_id, room_id, topic_id) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
       RETURNING count`,
    );

    db.transaction(() => {
      for (const topic of hits) {
        const { count } = bump.get(author.id, room.id, topic.id, now) as { count: number };
        let kind: Kind | null = null;
        if (!isMain && count >= topic.mute_at && !activeMute(db, author.id, room.id, now)) {
          const until = now + topic.mute_hours * 3_600_000;
          db.prepare(
            `INSERT INTO mutes (id, user_id, room_id, topic_id, until, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          ).run(newId(), author.id, room.id, topic.id, until, now);
          logAdmin(db, null, 'mascot.mute', 'user', author.id, {
            roomId: room.id,
            topic: topic.name,
            until,
            mascot: room.mascot_key,
          });
          kind = 'mute';
        } else if (count === topic.label_at) {
          kind = 'label';
        } else if (
          !isMain &&
          count === topic.mute_at - WARN_BEFORE_MUTE &&
          count > topic.label_at
        ) {
          kind = 'warn';
        }
        if (kind && (!event || PRIORITY[kind] > PRIORITY[event.kind])) event = { kind, topic };
      }
    })();

    // Assigned inside the transaction callback, which TypeScript's narrowing can't follow.
    const picked = event as { kind: Kind; topic: TopicRow } | null;
    if (!picked) return;
    const { kind, topic } = picked;
    if (kind !== 'warn') this.broadcast(author.id, room.id);
    // One announcement per message, the most serious one, as a reply to it.
    const custom = { warn: topic.line_warn, label: topic.line_label, mute: topic.line_mute }[kind];
    const lines = custom
      ? [custom]
      : MASCOT_LINES[room.mascot_key as keyof typeof MASCOT_LINES][kind];
    this.ctx.mascots.announce(
      room.id,
      lines,
      {
        name: author.display_name,
        topic: topic.name,
        label: topic.label,
        hours: String(topic.mute_hours),
      },
      message.id,
    );
  }

  /** Closes mutes whose time is up: strikes for that topic reset, clients hear about it. */
  expireDue(): void {
    const due = this.ctx.db
      .prepare('SELECT * FROM mutes WHERE ended_at IS NULL AND until <= ?')
      .all(Date.now()) as MuteRow[];
    for (const mute of due) this.end(mute, null);
  }

  /** Admin: end a mute early. */
  lift(muteId: string, actor: UserRow): Standing {
    const mute = this.ctx.db
      .prepare('SELECT * FROM mutes WHERE id = ? AND ended_at IS NULL')
      .get(muteId) as MuteRow | undefined;
    if (!mute) throw new AppError('NOT_FOUND', 'Mute not found or already over');
    logAdmin(this.ctx.db, actor.id, 'moderation.lift', 'user', mute.user_id, {
      roomId: mute.room_id,
    });
    return this.end(mute, actor.id);
  }

  /** Admin: strikes back to 0 for one topic, or all topics, of a person in a room. */
  reset(userId: string, roomId: string, topicId: string | undefined, actor: UserRow): Standing {
    const { db } = this.ctx;
    if (topicId)
      db.prepare('DELETE FROM strikes WHERE user_id = ? AND room_id = ? AND topic_id = ?').run(
        userId,
        roomId,
        topicId,
      );
    else db.prepare('DELETE FROM strikes WHERE user_id = ? AND room_id = ?').run(userId, roomId);
    logAdmin(db, actor.id, 'moderation.reset', 'user', userId, {
      roomId,
      topicId: topicId ?? null,
    });
    return this.broadcast(userId, roomId);
  }

  dispose(): void {
    clearInterval(this.sweep);
  }

  private end(mute: MuteRow, liftedBy: string | null): Standing {
    const { db } = this.ctx;
    db.transaction(() => {
      db.prepare('UPDATE mutes SET ended_at = ?, lifted_by = ? WHERE id = ?').run(
        Date.now(),
        liftedBy,
        mute.id,
      );
      db.prepare('DELETE FROM strikes WHERE user_id = ? AND room_id = ? AND topic_id = ?').run(
        mute.user_id,
        mute.room_id,
        mute.topic_id,
      );
    })();
    return this.broadcast(mute.user_id, mute.room_id);
  }

  private broadcast(userId: string, roomId: string): Standing {
    const standing = standingOf(this.ctx.db, userId, roomId);
    this.ctx.io.to(ROOM_MEMBERS).emit('moderation:updated', { standing });
    return standing;
  }
}
