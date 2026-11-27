import {
  LIMITS,
  MAIN_MASCOT,
  MASCOTS,
  type MascotKey,
  type Message,
  mascotByKey,
  mascotByUserId,
  nameKey,
  cleanDisplayName,
} from '@pausa/shared';
import { type AppContext, ROOM_MEMBERS } from '../context';
import type { Db } from '../db';
import { AppError } from '../errors';
import { newId } from '../ids';
import { getUser, type UserRow } from '../members/service';
import { sendMessage, toggleReaction } from '../messages/service';
import { getRoomRow, nextMascot, type RoomRow } from '../rooms/service';
import { callsByName, fill, type LineVars, normalize, pick, triggeredLines } from './engine';
import { MASCOT_LINES } from './lines';
import { GRUMPY_SILENCE, PERSONALITIES } from './personalities';

/** A keyword reaction at most once a minute per room; a mention answer once per 10 s per person. */
const KEYWORD_COOLDOWN: readonly [number, number] = [1, 60_000];
const MENTION_COOLDOWN: readonly [number, number] = [1, 10_000];
/** A mascot leaves an emoji on a message at most once per 10 min per room. */
const REACTION_COOLDOWN: readonly [number, number] = [1, 10 * 60_000];
/** Jitter added on top of MASCOT_DELAY_MS so answers feel typed, not instant. */
const JITTER_MS = 1300;

/**
 * Creates the mascot bot users if missing (idempotent, runs at every start), and gives rooms
 * without a mascot one. A person already using a mascot's name keeps it; the mascot gets a suffix.
 */
export function ensureMascots(db: Db): void {
  db.transaction(() => {
    for (const m of MASCOTS) {
      if (getUser(db, m.userId)) continue;
      let name: string = m.name;
      if (db.prepare('SELECT 1 FROM users WHERE name_key = ?').get(nameKey(name)))
        name = `${m.name} (mascote)`;
      db.prepare(
        `INSERT INTO users (id, display_name, name_key, role, created_at, is_bot)
         VALUES (?, ?, ?, 'member', ?, 1)`,
      ).run(m.userId, name, nameKey(name), Date.now());
    }
    db.prepare('UPDATE rooms SET mascot_key = ? WHERE is_main = 1 AND mascot_key IS NULL').run(
      MAIN_MASCOT,
    );
    const orphans = db
      .prepare('SELECT id FROM rooms WHERE mascot_key IS NULL ORDER BY created_at')
      .all() as { id: string }[];
    for (const { id } of orphans)
      db.prepare('UPDATE rooms SET mascot_key = ? WHERE id = ?').run(nextMascot(db), id);
  })();
}

type Vars = LineVars;

/** The host renames a mascot (Phase 18): same name rules as people, and unique. */
export function renameMascot(db: Db, key: MascotKey, rawName: string): UserRow {
  const name = cleanDisplayName(rawName);
  if (name.length < 2 || name.length > LIMITS.displayName)
    throw new AppError('VALIDATION', 'Name must be 2–32 characters');
  const id = mascotByKey(key).userId;
  const clash = db
    .prepare('SELECT id FROM users WHERE name_key = ? AND id != ?')
    .get(nameKey(name), id);
  if (clash) throw new AppError('NAME_TAKEN');
  db.prepare('UPDATE users SET display_name = ?, name_key = ? WHERE id = ?').run(
    name,
    nameKey(name),
    id,
  );
  return getUser(db, id)!;
}

/** Reacts to what people write, after a short delay, through the same send path as everyone. */
export class Mascots {
  private timers = new Set<NodeJS.Timeout>();
  private lastLine = new Map<MascotKey, string>();
  private disposed = false;

  constructor(
    private readonly ctx: AppContext,
    /** Public so tests can make the dice deterministic. */
    public rng: () => number = Math.random,
  ) {}

  /** The mascot's current display name: words of 3+ letters count as calling it (it can be renamed). */
  private currentNames(key: MascotKey): string[] {
    const name = getUser(this.ctx.db, mascotByKey(key).userId)?.display_name ?? '';
    return [name, ...name.split(/\s+/).filter((w) => normalize(w).length >= 3)];
  }

  /** Call after a person's message has been stored and broadcast. */
  onMessage(message: Message, author: UserRow): void {
    if (author.is_bot === 1 || !message.body) return;
    const room = this.talkativeRoom(message.roomId);
    if (!room) return;

    const text = normalize(message.body);
    const vars: Vars = { name: author.display_name, room: `#${room.slug}` };
    const roomKey = room.mascot_key as MascotKey;

    // 1. @mentions of any mascot (at most two answer: fun, not noisy).
    const called = message.mentions
      .map((id) => mascotByUserId(id)?.key)
      .filter((k): k is MascotKey => k !== undefined)
      .slice(0, 2);
    // 2. The room's own mascot called by name in plain text (its fixed nicknames or current name).
    const script = MASCOT_LINES[roomKey];
    const names = { ...script, names: [...script.names, ...this.currentNames(roomKey)] };
    if (called.length === 0 && callsByName(names, text)) called.push(roomKey);

    if (called.length > 0) {
      const [limit, windowMs] = MENTION_COOLDOWN;
      for (const key of called) {
        if (!this.ctx.limiter.hit(`mascot:mention:${key}:${room.id}:${author.id}`, limit, windowMs))
          continue;
        // The grumpy one sometimes can't be bothered: silence, or just "…".
        if (this.rng() < PERSONALITIES[key].ignore) {
          if (this.rng() < 0.5) this.later(key, room.id, [GRUMPY_SILENCE], vars, message.id);
          continue;
        }
        this.later(key, room.id, MASCOT_LINES[key].mention, vars, message.id);
      }
      return;
    }

    // 3. Keywords, for the room's mascot only, when the dice agree (its temperament scales them).
    const lines = triggeredLines(script, text);
    const chance = Math.min(1, this.ctx.config.mascotChance * PERSONALITIES[roomKey].chance);
    const [limit, windowMs] = KEYWORD_COOLDOWN;
    if (
      lines &&
      this.rng() < chance &&
      this.ctx.limiter.hit(`mascot:keyword:${room.id}`, limit, windowMs)
    ) {
      this.later(roomKey, room.id, lines, vars, message.id);
      return;
    }

    // 4. Otherwise, now and then, an emoji in character.
    this.maybeReact(roomKey, room.id, message.id);
  }

  private maybeReact(key: MascotKey, roomId: string, messageId: string): void {
    const p = PERSONALITIES[key];
    // Off when chatter is off (tests, MASCOT_CHANCE=0).
    if (this.ctx.config.mascotChance === 0 || this.rng() >= p.react) return;
    const [limit, windowMs] = REACTION_COOLDOWN;
    if (!this.ctx.limiter.hit(`mascot:react:${roomId}`, limit, windowMs)) return;
    const emoji = p.emojis[Math.floor(this.rng() * p.emojis.length) % p.emojis.length]!;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (this.disposed || !this.talkativeRoom(roomId)) return;
      const bot = getUser(this.ctx.db, mascotByKey(key).userId);
      if (!bot) return;
      try {
        const message = toggleReaction(this.ctx.db, bot, { messageId, emoji });
        this.ctx.io.to(ROOM_MEMBERS).emit('message:updated', { message });
      } catch (err) {
        if (!(err instanceof AppError)) this.ctx.log.error({ err }, 'mascot reaction failed');
      }
    }, this.ctx.config.mascotDelayMs * p.delay);
    this.timers.add(timer);
  }

  /** The room's mascot says hello in a new room. */
  onRoomCreated(roomId: string): void {
    const room = this.talkativeRoom(roomId);
    if (!room) return;
    const key = room.mascot_key as MascotKey;
    this.later(key, room.id, MASCOT_LINES[key].intro, { room: `#${room.slug}` });
  }

  /**
   * The room's mascot says one of `lines` (moderation announcements, D-51), as a reply when given.
   * Same delay, room checks and send path as everything else it says.
   */
  announce(roomId: string, lines: string[], vars: Vars, replyToId?: string): void {
    const room = this.talkativeRoom(roomId);
    if (!room || lines.length === 0) return;
    this.later(
      room.mascot_key as MascotKey,
      room.id,
      lines,
      { room: `#${room.slug}`, ...vars },
      replyToId,
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private talkativeRoom(roomId: string): RoomRow | null {
    const room = getRoomRow(this.ctx.db, roomId);
    if (!room || room.archived_at !== null || room.mascot_enabled !== 1) return null;
    if (!room.mascot_key || !(room.mascot_key in MASCOT_LINES)) return null;
    return room;
  }

  private later(key: MascotKey, roomId: string, lines: string[], vars: Vars, replyToId?: string) {
    const line = pick(lines, this.rng, this.lastLine.get(key));
    this.lastLine.set(key, line);
    const body = fill(line, vars).slice(0, LIMITS.messageLength);
    const base = this.ctx.config.mascotDelayMs * PERSONALITIES[key].delay;
    const delay = base > 0 ? base + Math.floor(this.rng() * JITTER_MS) : 0;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.disposed) this.post(key, roomId, body, replyToId);
    }, delay);
    this.timers.add(timer);
  }

  private post(key: MascotKey, roomId: string, body: string, replyToId?: string): void {
    // Re-check: the room may have been archived or the mascot muted during the delay.
    if (!this.talkativeRoom(roomId)) return;
    const bot = getUser(this.ctx.db, mascotByKey(key).userId);
    if (!bot || bot.revoked_at !== null) return;
    try {
      const { message, created } = sendMessage(this.ctx.db, bot, {
        roomId,
        clientId: `mascot-${newId()}`,
        body,
        replyToId,
        attachmentIds: [],
      });
      if (created) this.ctx.io.to(ROOM_MEMBERS).emit('message:new', { message });
    } catch (err) {
      // e.g. the message it answers was deleted meanwhile: stay quiet.
      if (!(err instanceof AppError)) this.ctx.log.error({ err }, 'mascot post failed');
    }
  }
}
