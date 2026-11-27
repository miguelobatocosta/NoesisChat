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
import { addDays, monthDay, today, weekStart } from './dates';
import lines from './lines.pt-PT.json';
import {
  attendanceFor,
  closeDay,
  dayFlags,
  decideWeek,
  goingOn,
  nominate,
  officeDays,
  officeWeeks,
  openWeek,
  settleNoShows,
} from './office';
import { getPerson, listPeople } from './people';

/** Local times that drive the week (D-53/D-54). */
const BIRTHDAY_HOUR = 9;
const POLL_OPENS = { weekday: 5, hour: 12 }; // Friday 12:00
const POLL_CLOSES = { weekday: 1, hour: 10 }; // Monday 10:00
const NOMINATE_HOUR = 12; // day before
const REMINDER_HOUR = 17; // day before
const DAY_CARD_HOUR = 8; // on the day
const TICK_MS = 60_000;

type LineKey = keyof (typeof lines)['lurdes'];
/** Each mascot's voice; any line a mascot lacks falls back to Dona Lurdes (the #geral default). */
const VOICES = lines as Record<string, Partial<Record<LineKey, string[]>>>;
type Vars = Partial<Record<'name' | 'reason' | 'who' | 'date' | 'count' | 'cake', string>>;

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

  noshowLimit(): number {
    const row = this.ctx.db
      .prepare(`SELECT value FROM app_settings WHERE key = 'noshow_limit'`)
      .get() as { value: string } | undefined;
    return Number(row?.value ?? 3);
  }

  state(): CommunityState {
    const { db } = this.ctx;
    const todayIso = this.today();
    const days = officeDays(db, todayIso);
    return {
      people: listPeople(db),
      debts: listDebts(db),
      weeks: officeWeeks(db, todayIso),
      days,
      attendance: attendanceFor(
        db,
        days.map((d) => d.date),
      ),
      settings: { noshowLimit: this.noshowLimit() },
      today: todayIso,
    };
  }

  /** After a judgement or a closed day: whoever reached N unjustified absences owes a cake. */
  settleNoShows(todayIso = this.today()): void {
    const limit = this.noshowLimit();
    for (const personId of settleNoShows(this.ctx.db, limit, todayIso))
      this.announce('noshow', { name: this.nameFor(personId), count: String(limit) });
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
    const pool = VOICES[mascot]?.[key] ?? lines.lurdes[key];
    const line = pick(pool, this.rng, this.lastLine.get(key));
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
    this.office(now);
  }

  /** The office week: poll, decision, day-before nomination and reminder, morning card, closing. */
  private office(now: Date): void {
    const { db } = this.ctx;
    const at = now.getTime();
    const iso = today(at);
    const weekday = ((now.getDay() + 6) % 7) + 1; // Mon = 1 … Sun = 7
    const hour = now.getHours();
    let changed = false;

    // Friday 12:00 → the vote for next week opens (also catches up on Sat/Sun).
    if (
      weekday > POLL_OPENS.weekday ||
      (weekday === POLL_OPENS.weekday && hour >= POLL_OPENS.hour)
    ) {
      const next = addDays(weekStart(iso), 7);
      if (openWeek(db, next, at)) {
        this.announce('poll', { date: showDate(next) }, { type: 'officePoll', ref: next });
        changed = true;
      }
    }
    // Monday 10:00 → decided (or later in the week if the PC was off).
    const monday = weekStart(iso);
    // Only weeks whose vote was opened: a first start mid-week never invents a day nobody voted on.
    const opened = !!db.prepare('SELECT 1 FROM office_weeks WHERE week_start = ?').get(monday);
    if (opened && (weekday > POLL_CLOSES.weekday || hour >= POLL_CLOSES.hour)) {
      const date = decideWeek(db, monday, at);
      if (date) {
        if (date >= iso)
          this.announce('decided', { date: weekdayName(date) }, { type: 'officeDay', ref: date });
        changed = true;
      }
    }
    // Days ahead and today.
    for (const day of officeDays(db, iso)) {
      const flags = dayFlags(db, day.date)!;
      const tomorrow = addDays(iso, 1);
      if (day.date === tomorrow && hour >= NOMINATE_HOUR && !flags.nominated_at) {
        const pick = nominate(db, day.date);
        db.prepare('UPDATE office_days SET nominated_at = ? WHERE date = ?').run(at, day.date);
        if (pick) {
          const debt = getDebt(db, pick.debtId);
          this.announce(
            'nominated',
            { name: this.nameFor(pick.personId), reason: debt.reason, date: weekdayName(day.date) },
            { type: 'cakeCall', ref: day.date },
          );
        }
        changed = true;
      }
      if (day.date === tomorrow && hour >= REMINDER_HOUR && !flags.reminded_at) {
        db.prepare('UPDATE office_days SET reminded_at = ? WHERE date = ?').run(at, day.date);
        const cake = db
          .prepare(`SELECT person_id FROM cake_debts WHERE pledged_on = ? AND status = 'owed'`)
          .all(day.date) as { person_id: string }[];
        this.announce(
          'reminder',
          {
            date: weekdayName(day.date),
            count: String(goingOn(db, day.date).length),
            cake: cake.length ? cake.map((c) => this.nameFor(c.person_id)).join(', ') : '🤷',
          },
          { type: 'officeDay', ref: day.date },
        );
      }
      if (day.date === iso && hour >= DAY_CARD_HOUR && !flags.opened_at) {
        db.prepare('UPDATE office_days SET opened_at = ? WHERE date = ?').run(at, day.date);
        this.announce('dayStart', {}, { type: 'officeDay', ref: day.date });
      }
    }
    // Yesterday and before: settle attendance.
    const open = db
      .prepare('SELECT date FROM office_days WHERE closed_at IS NULL AND date < ?')
      .all(iso) as { date: string }[];
    for (const { date } of open) if (closeDay(db, date, at)) changed = true;
    if (open.length) this.settleNoShows(iso);
    if (changed) this.changed();
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
  return line.replace(
    /\{(name|reason|who|date|count|cake)\}/g,
    (_, k: keyof Vars) => vars[k] ?? '',
  );
}

const showDate = (iso: string) => iso.split('-').reverse().join('/');
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** "quarta, 03/12" */
function weekdayName(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${showDate(iso).slice(0, 5)}`;
}
