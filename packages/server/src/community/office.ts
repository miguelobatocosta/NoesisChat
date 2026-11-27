import type {
  Attendance,
  ClientEventPayload,
  Judgement,
  OfficeDay,
  OfficeWeek,
} from '@pausa/shared';
import type { Db } from '../db';
import { AppError } from '../errors';
import type { UserRow } from '../members/service';
import { insertDebt } from './cakes';
import { addDays, parseIso, weekStart } from './dates';
import { personOfUser, requirePerson } from './people';

/**
 * Office days (D-54). The week is voted Friday 12:00 → Monday 10:00 (Mon–Fri, several choices);
 * most votes wins, a tie goes to Wednesday if it's among the tied days, else the earliest.
 * On the day people check in; at the end of it absences are settled: advance notice = justified,
 * an excuse = pending (an admin judges), nothing = unjustified. N unjustified = one cake.
 */

const WEDNESDAY = 3;
const isStaff = (u: UserRow) => u.role === 'host' || u.role === 'admin';

interface AttendanceRow {
  date: string;
  person_id: string;
  plan: 'going' | 'not_going' | null;
  plan_reason: string | null;
  planned_at: number | null;
  status: 'present' | 'absent' | null;
  excuse: string | null;
  judgement: Judgement | null;
  marked_by: string | null;
  noshow_debt: string | null;
}

/** Monday 00:00 local, in ms: a plan made before the day starts is advance notice. */
const dayStart = (date: string) => parseIso(date).getTime();

const toAttendance = (r: AttendanceRow): Attendance => ({
  date: r.date,
  personId: r.person_id,
  plan: r.plan,
  planReason: r.plan_reason,
  noticeGiven: r.plan === 'not_going' && r.planned_at !== null && r.planned_at < dayStart(r.date),
  status: r.status,
  excuse: r.excuse,
  judgement: r.judgement,
  counted: r.noshow_debt !== null,
});

// --- reads ---------------------------------------------------------------------------------------

export function officeWeeks(db: Db, todayIso: string): OfficeWeek[] {
  const rows = db
    .prepare(`SELECT * FROM office_weeks WHERE week_start >= ? ORDER BY week_start`)
    .all(weekStart(todayIso)) as {
    week_start: string;
    status: 'voting' | 'decided';
    chosen_on: string | null;
  }[];
  const votes = db.prepare('SELECT person_id, weekday FROM office_votes WHERE week_start = ?');
  return rows.map((w) => ({
    weekStart: w.week_start,
    status: w.status,
    chosenOn: w.chosen_on,
    votes: (votes.all(w.week_start) as { person_id: string; weekday: number }[]).map((v) => ({
      personId: v.person_id,
      weekday: v.weekday,
    })),
  }));
}

export function officeDays(db: Db, todayIso: string): OfficeDay[] {
  const rows = db
    .prepare(
      `SELECT * FROM (SELECT * FROM office_days WHERE date < ? ORDER BY date DESC LIMIT 12)
       UNION SELECT * FROM office_days WHERE date >= ? ORDER BY date`,
    )
    .all(todayIso, todayIso) as {
    date: string;
    week_start: string;
    source: OfficeDay['source'];
    closed_at: number | null;
  }[];
  return rows.map((d) => ({
    date: d.date,
    weekStart: d.week_start,
    source: d.source,
    closed: d.closed_at !== null,
  }));
}

export function attendanceFor(db: Db, dates: string[]): Attendance[] {
  if (dates.length === 0) return [];
  const rows = db
    .prepare(`SELECT * FROM attendance WHERE date IN (${dates.map(() => '?').join(',')})`)
    .all(...dates) as AttendanceRow[];
  return rows.map(toAttendance);
}

const getDay = (db: Db, date: string) =>
  db.prepare('SELECT * FROM office_days WHERE date = ?').get(date) as
    | {
        date: string;
        closed_at: number | null;
        nominated_at: number | null;
        reminded_at: number | null;
        opened_at: number | null;
      }
    | undefined;

function requireDay(db: Db, date: string) {
  const day = getDay(db, date);
  if (!day) throw new AppError('NOT_FOUND', 'Not an office day');
  return day;
}

function upsertAttendance(db: Db, date: string, personId: string, set: Record<string, unknown>) {
  db.prepare('INSERT OR IGNORE INTO attendance (date, person_id) VALUES (?, ?)').run(
    date,
    personId,
  );
  const cols = Object.keys(set);
  db.prepare(
    `UPDATE attendance SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE date = ? AND person_id = ?`,
  ).run(...Object.values(set), date, personId);
}

function myPerson(db: Db, actor: UserRow) {
  const p = personOfUser(db, actor.id);
  if (!p) throw new AppError('FORBIDDEN', 'No person for this account');
  return p;
}

// --- the week ------------------------------------------------------------------------------------

/** Opens the vote for a week (idempotent). Returns true when it was just opened. */
export function openWeek(db: Db, monday: string, now: number): boolean {
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO office_weeks (week_start, status, opened_at) VALUES (?, 'voting', ?)`,
    )
    .run(monday, now);
  return res.changes > 0;
}

/** The winning weekday: most votes; ties → Wednesday if tied, else the earliest; no votes → Wednesday. */
export function pickWeekday(counts: Map<number, number>): number {
  const max = Math.max(0, ...counts.values());
  if (max === 0) return WEDNESDAY;
  const tied = [...counts]
    .filter(([, n]) => n === max)
    .map(([d]) => d)
    .sort();
  return tied.includes(WEDNESDAY) ? WEDNESDAY : tied[0]!;
}

/** Closes a week's vote and creates its office day. Returns the date, or null if already decided. */
export function decideWeek(db: Db, monday: string, now: number): string | null {
  return db.transaction(() => {
    openWeek(db, monday, now);
    const week = db.prepare('SELECT status FROM office_weeks WHERE week_start = ?').get(monday) as {
      status: string;
    };
    if (week.status === 'decided') return null;
    const counts = new Map<number, number>();
    for (const v of db
      .prepare('SELECT weekday FROM office_votes WHERE week_start = ?')
      .all(monday) as { weekday: number }[])
      counts.set(v.weekday, (counts.get(v.weekday) ?? 0) + 1);
    const date = addDays(monday, pickWeekday(counts) - 1);
    db.prepare(
      `UPDATE office_weeks SET status = 'decided', chosen_on = ? WHERE week_start = ?`,
    ).run(date, monday);
    db.prepare(
      `INSERT OR IGNORE INTO office_days (date, week_start, source) VALUES (?, ?, 'vote')`,
    ).run(date, monday);
    return date;
  })();
}

export function vote(db: Db, actor: UserRow, input: ClientEventPayload<'office:vote'>): void {
  const week = db
    .prepare('SELECT status FROM office_weeks WHERE week_start = ?')
    .get(input.weekStart) as { status: string } | undefined;
  if (!week || week.status !== 'voting') throw new AppError('VALIDATION', 'Voting is closed');
  const me = myPerson(db, actor);
  db.transaction(() => {
    db.prepare('DELETE FROM office_votes WHERE week_start = ? AND person_id = ?').run(
      input.weekStart,
      me.id,
    );
    const insert = db.prepare(
      'INSERT INTO office_votes (week_start, person_id, weekday) VALUES (?, ?, ?)',
    );
    for (const d of new Set(input.weekdays)) insert.run(input.weekStart, me.id, d);
  })();
}

/** Admin: change the week's day (holidays, exceptions). Moves plans made for the old day. */
export function setDay(db: Db, actor: UserRow, monday: string, date: string, now: number): void {
  if (weekStart(date) !== monday) throw new AppError('VALIDATION', 'That date is not in this week');
  db.transaction(() => {
    openWeek(db, monday, now);
    const old = (
      db.prepare('SELECT chosen_on FROM office_weeks WHERE week_start = ?').get(monday) as {
        chosen_on: string | null;
      }
    ).chosen_on;
    db.prepare(
      `UPDATE office_weeks SET status = 'decided', chosen_on = ?, decided_by = ? WHERE week_start = ?`,
    ).run(date, actor.id, monday);
    db.prepare(
      `INSERT OR IGNORE INTO office_days (date, week_start, source) VALUES (?, ?, 'admin')`,
    ).run(date, monday);
    if (old && old !== date && !getDay(db, old)?.closed_at) {
      db.prepare('DELETE FROM attendance WHERE date = ?').run(old);
      db.prepare('DELETE FROM office_days WHERE date = ?').run(old);
      db.prepare(
        `UPDATE cake_debts SET pledged_on = ? WHERE pledged_on = ? AND status = 'owed'`,
      ).run(date, old);
    }
  })();
}

/** Admin: an extra office day. */
export function addDay(db: Db, date: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO office_days (date, week_start, source) VALUES (?, ?, 'admin')`,
  ).run(date, weekStart(date));
}

// --- the day -------------------------------------------------------------------------------------

export function plan(
  db: Db,
  actor: UserRow,
  input: ClientEventPayload<'office:plan'>,
  now: number,
  todayIso: string,
) {
  const day = requireDay(db, input.date);
  if (day.closed_at || input.date < todayIso) throw new AppError('VALIDATION', 'That day is over');
  const me = myPerson(db, actor);
  upsertAttendance(db, input.date, me.id, {
    plan: input.plan,
    plan_reason: input.plan === 'not_going' ? (input.reason ?? null) : null,
    planned_at: now,
  });
}

export function checkIn(db: Db, actor: UserRow, date: string, todayIso: string) {
  requireDay(db, date);
  if (date !== todayIso) throw new AppError('VALIDATION', 'Check-in is on the day');
  const me = myPerson(db, actor);
  upsertAttendance(db, date, me.id, { status: 'present', judgement: null, marked_by: actor.id });
}

/** Someone who is there (or an admin) marks a colleague present or absent. */
export function mark(
  db: Db,
  actor: UserRow,
  input: ClientEventPayload<'office:mark'>,
  todayIso: string,
) {
  const day = requireDay(db, input.date);
  if (day.closed_at && !isStaff(actor)) throw new AppError('VALIDATION', 'That day is closed');
  if (input.date > todayIso) throw new AppError('VALIDATION', 'Not yet');
  requirePerson(db, input.personId);
  const me = personOfUser(db, actor.id);
  const iAmThere =
    !!me &&
    (db
      .prepare(`SELECT 1 FROM attendance WHERE date = ? AND person_id = ? AND status = 'present'`)
      .get(input.date, me.id) as unknown) !== undefined;
  if (!iAmThere && !isStaff(actor))
    throw new AppError('FORBIDDEN', 'Only someone who is there can mark others');
  upsertAttendance(db, input.date, input.personId, { status: input.status, marked_by: actor.id });
}

/** My excuse for an absence: an admin then judges it. */
export function excuse(db: Db, actor: UserRow, input: ClientEventPayload<'office:excuse'>) {
  requireDay(db, input.date);
  const me = myPerson(db, actor);
  const row = db
    .prepare('SELECT judgement FROM attendance WHERE date = ? AND person_id = ?')
    .get(input.date, me.id) as { judgement: Judgement | null } | undefined;
  if (row?.judgement === 'justified') return;
  upsertAttendance(db, input.date, me.id, {
    excuse: input.excuse,
    ...(row?.judgement === 'unjustified' ? { judgement: 'pending' } : {}),
  });
}

export function judge(db: Db, input: ClientEventPayload<'admin:office:judge'>) {
  requireDay(db, input.date);
  upsertAttendance(db, input.date, input.personId, {
    status: 'absent',
    judgement: input.judgement,
  });
}

/**
 * Settles a finished day: everyone in the team who didn't check in is absent; advance notice →
 * justified, an excuse → pending, nothing → unjustified. Promised cakes that didn't arrive go back
 * to the queue. Returns false if the day was already closed.
 */
export function closeDay(db: Db, date: string, now: number): boolean {
  return db.transaction(() => {
    const day = getDay(db, date);
    if (!day || day.closed_at) return false;
    const team = db.prepare('SELECT id FROM people WHERE in_team = 1').all() as { id: string }[];
    for (const { id } of team) {
      const row = db
        .prepare('SELECT * FROM attendance WHERE date = ? AND person_id = ?')
        .get(date, id) as AttendanceRow | undefined;
      if (row?.status === 'present') continue;
      const notice =
        row?.plan === 'not_going' && row.planned_at !== null && row.planned_at < dayStart(date);
      const judgement: Judgement = notice ? 'justified' : row?.excuse ? 'pending' : 'unjustified';
      upsertAttendance(db, date, id, {
        status: 'absent',
        judgement: row?.judgement === 'justified' ? 'justified' : judgement,
      });
    }
    db.prepare(
      `UPDATE cake_debts SET pledged_on = NULL, pledge_kind = NULL WHERE pledged_on = ? AND status = 'owed'`,
    ).run(date);
    db.prepare('UPDATE office_days SET closed_at = ? WHERE date = ?').run(now, date);
    return true;
  })();
}

/**
 * Whoever reached N unjustified absences (not yet counted) owes a cake; those absences are then
 * counted, so the tally starts again. Returns the people who just got a debt.
 */
export function settleNoShows(db: Db, limit: number, todayIso: string): string[] {
  const due = db
    .prepare(
      `SELECT person_id, COUNT(*) AS n FROM attendance
       WHERE judgement = 'unjustified' AND noshow_debt IS NULL GROUP BY person_id HAVING n >= ?`,
    )
    .all(limit) as { person_id: string; n: number }[];
  for (const { person_id } of due) {
    const rows = db
      .prepare(
        `SELECT date FROM attendance WHERE person_id = ? AND judgement = 'unjustified' AND noshow_debt IS NULL ORDER BY date LIMIT ?`,
      )
      .all(person_id, limit) as { date: string }[];
    const debt = insertDebt(db, {
      personId: person_id,
      reason: `${limit} faltas sem aviso`,
      kind: 'noshow',
      occurredOn: todayIso,
      status: 'owed',
      recordedBy: null,
    });
    const mark = db.prepare(
      'UPDATE attendance SET noshow_debt = ? WHERE date = ? AND person_id = ?',
    );
    for (const r of rows) mark.run(debt.id, r.date, person_id);
  }
  return due.map((d) => d.person_id);
}

/** Who's expected on a day: planned to go, or voted for that weekday without saying otherwise. */
export function goingOn(db: Db, date: string): string[] {
  const monday = weekStart(date);
  const weekday = ((parseIso(date).getDay() + 6) % 7) + 1;
  return (
    db
      .prepare(
        `SELECT p.id FROM people p WHERE p.in_team = 1 AND (
           EXISTS (SELECT 1 FROM attendance a WHERE a.date = ? AND a.person_id = p.id AND a.plan = 'going')
           OR (EXISTS (SELECT 1 FROM office_votes v WHERE v.week_start = ? AND v.person_id = p.id AND v.weekday = ?)
               AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.date = ? AND a.person_id = p.id AND a.plan = 'not_going')))`,
      )
      .all(date, monday, weekday, date) as { id: string }[]
  ).map((r) => r.id);
}

/** Day before: if nobody promised a cake, the oldest debt among those going is nominated. */
export function nominate(db: Db, date: string): { debtId: string; personId: string } | null {
  if (db.prepare(`SELECT 1 FROM cake_debts WHERE pledged_on = ? AND status = 'owed'`).get(date))
    return null;
  const going = goingOn(db, date);
  if (going.length === 0) return null;
  const debt = db
    .prepare(
      `SELECT id, person_id FROM cake_debts WHERE status = 'owed' AND pledged_on IS NULL
       AND person_id IN (${going.map(() => '?').join(',')}) ORDER BY occurred_on, created_at LIMIT 1`,
    )
    .get(...going) as { id: string; person_id: string } | undefined;
  if (!debt) return null;
  db.prepare(`UPDATE cake_debts SET pledged_on = ?, pledge_kind = 'nominated' WHERE id = ?`).run(
    date,
    debt.id,
  );
  return { debtId: debt.id, personId: debt.person_id };
}

export const dayFlags = getDay;
