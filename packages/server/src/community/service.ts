import {
  type CardType,
  type CommunityState,
  MAIN_MASCOT,
  MAIN_ROOM_ID,
  mascotByKey,
  type MascotKey,
  mentionToken,
} from '@pausa/shared';
import { type AppContext, ROOM_MEMBERS } from '../context';
import { AppError } from '../errors';
import { newId } from '../ids';
import { pick } from '../mascots/engine';
import { getUser } from '../members/service';
import { sendMessage } from '../messages/service';
import { getRoomRow } from '../rooms/service';
import { getDebt, insertDebt, listDebts } from './cakes';
import { monthDay, today } from './dates';
import lines from './lines.pt-PT.json';
import { getPerson, listPeople } from './people';

/** When the daily birthday check runs (local time). */
const BIRTHDAY_HOUR = 9;
const TICK_MS = 60_000;

type LineKey = keyof typeof lines;
type Vars = Partial<Record<'name' | 'reason' | 'who' | 'date', string>>;

/**
 * Cakes and office days (D-53/D-54): the shared state, the #geral announcements (posted by the
 * room's mascot, as interactive cards), and the clock that drives birthdays.
 */
export class Community {
  private readonly timer: NodeJS.Timeout;
  private lastLine = new Map<LineKey, string>();

  constructor(
    private readonly ctx: AppContext,
    private readonly now: () => number = Date.now,
    private readonly rng: () => number = Math.random,
  ) {
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref();
  }

  today(): string {
    return today(this.now());
  }

  state(): CommunityState {
    const noshow = this.ctx.db
      .prepare(`SELECT value FROM app_settings WHERE key = 'noshow_limit'`)
      .get() as { value: string } | undefined;
    return {
      people: listPeople(this.ctx.db),
      debts: listDebts(this.ctx.db),
      settings: { noshowLimit: Number(noshow?.value ?? 3) },
      today: this.today(),
    };
  }

  setNoshowLimit(n: number): void {
    this.ctx.db
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES ('noshow_limit', ?)
                ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      )
      .run(String(n));
  }

  /** Tell every client to re-read the state. */
  changed(): void {
    this.ctx.io.to(ROOM_MEMBERS).emit('community:updated');
  }

  /** A person's name as a mention (members get notified) or plain text (guests). */
  nameFor(personId: string): string {
    const p = getPerson(this.ctx.db, personId);
    if (!p) return '?';
    return p.userId ? mentionToken(p.userId) : `**${p.name}**`;
  }

  /** The #geral mascot says a line from community/lines.pt-PT.json, with an optional card. */
  announce(key: LineKey, vars: Vars, card?: { type: CardType; ref: string }): void {
    const room = getRoomRow(this.ctx.db, MAIN_ROOM_ID);
    if (!room) return;
    const mascot = (room.mascot_key ?? MAIN_MASCOT) as MascotKey;
    const bot = getUser(this.ctx.db, mascotByKey(mascot).userId);
    if (!bot) return;
    const line = pick(lines[key], this.rng, this.lastLine.get(key));
    this.lastLine.set(key, line);
    try {
      const { message } = sendMessage(
        this.ctx.db,
        bot,
        {
          roomId: MAIN_ROOM_ID,
          clientId: `community-${newId()}`,
          body: fillLine(line, vars),
          attachmentIds: [],
        },
        card ? { card } : {},
      );
      this.ctx.io.to(ROOM_MEMBERS).emit('message:new', { message });
    } catch (err) {
      if (!(err instanceof AppError)) this.ctx.log.error({ err }, 'community post failed');
    }
  }

  /** Runs every minute; also called directly by tests with a fake clock. */
  tick(at: number = this.now()): void {
    const now = new Date(at);
    if (now.getHours() >= BIRTHDAY_HOUR) this.birthdays(now);
  }

  /** On someone's birthday: one cake debt (once per year) and congratulations. */
  private birthdays(now: Date): void {
    const { db } = this.ctx;
    const iso = today(now.getTime());
    const md = monthDay(now);
    const due = db
      .prepare(
        `SELECT p.id FROM people p WHERE p.birthday_md = ?
           AND NOT EXISTS (SELECT 1 FROM cake_debts d WHERE d.person_id = p.id AND d.kind = 'birthday' AND d.occurred_on = ?)`,
      )
      .all(md, iso) as { id: string }[];
    for (const { id } of due) {
      const debt = insertDebt(db, {
        personId: id,
        reason: 'Aniversário',
        kind: 'birthday',
        occurredOn: iso,
        status: 'owed',
        recordedBy: null,
      });
      this.announce('birthday', { name: this.nameFor(id) }, { type: 'birthday', ref: debt.id });
    }
    if (due.length) this.changed();
  }

  /** The card + line for a freshly recorded milestone. */
  milestoneRecorded(debtId: string, recordedBy: string): void {
    const debt = getDebt(this.ctx.db, debtId);
    const own = debt.status === 'owed';
    this.announce(
      own ? 'selfMilestone' : 'milestone',
      { name: this.nameFor(debt.personId), reason: debt.reason, who: mentionToken(recordedBy) },
      { type: 'milestone', ref: debt.id },
    );
  }

  dispose(): void {
    clearInterval(this.timer);
  }
}

/** Like the mascots' fill(), with the community placeholders. */
function fillLine(line: string, vars: Vars): string {
  return line.replace(/\{(name|reason|who|date)\}/g, (_, k: keyof Vars) => vars[k] ?? '');
}
