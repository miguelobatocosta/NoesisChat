import {
  LIMITS,
  MAIN_MASCOT,
  MASCOTS,
  type MascotKey,
  type Message,
  mascotByKey,
  mascotByUserId,
  nameKey,
} from '@pausa/shared';
import { type AppContext, ROOM_MEMBERS } from '../context';
import type { Db } from '../db';
import { AppError } from '../errors';
import { newId } from '../ids';
import { getUser, type UserRow } from '../members/service';
import { sendMessage } from '../messages/service';
import { getRoomRow, nextMascot, type RoomRow } from '../rooms/service';
import { callsByName, fill, normalize, pick, triggeredLines } from './engine';
import { MASCOT_LINES } from './lines';

/** A keyword reaction at most once a minute per room; a mention answer once per 10 s per person. */
const KEYWORD_COOLDOWN: readonly [number, number] = [1, 60_000];
const MENTION_COOLDOWN: readonly [number, number] = [1, 10_000];
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

type Vars = { name?: string; room?: string };

/** Reacts to what people write, after a short delay, through the same send path as everyone. */
export class Mascots {
  private timers = new Set<NodeJS.Timeout>();
  private lastLine = new Map<MascotKey, string>();
  private disposed = false;

  constructor(
    private readonly ctx: AppContext,
    private readonly rng: () => number = Math.random,
  ) {}

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
    // 2. The room's own mascot called by name in plain text.
    if (called.length === 0 && callsByName(MASCOT_LINES[roomKey], text)) called.push(roomKey);

    if (called.length > 0) {
      const [limit, windowMs] = MENTION_COOLDOWN;
      for (const key of called) {
        if (this.ctx.limiter.hit(`mascot:mention:${key}:${room.id}:${author.id}`, limit, windowMs))
          this.later(key, room.id, MASCOT_LINES[key].mention, vars, message.id);
      }
      return;
    }

    // 3. Keywords, for the room's mascot only, when the dice agree.
    const lines = triggeredLines(MASCOT_LINES[roomKey], text);
    if (!lines || this.rng() >= this.ctx.config.mascotChance) return;
    const [limit, windowMs] = KEYWORD_COOLDOWN;
    if (!this.ctx.limiter.hit(`mascot:keyword:${room.id}`, limit, windowMs)) return;
    this.later(roomKey, room.id, lines, vars, message.id);
  }

  /** The room's mascot says hello in a new room. */
  onRoomCreated(roomId: string): void {
    const room = this.talkativeRoom(roomId);
    if (!room) return;
    const key = room.mascot_key as MascotKey;
    this.later(key, room.id, MASCOT_LINES[key].intro, { room: `#${room.slug}` });
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
    const base = this.ctx.config.mascotDelayMs;
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
