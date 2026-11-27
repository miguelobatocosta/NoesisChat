import type { CakeDebt, CommunityState, Person } from '@pausa/shared';

/** Whole days from an ISO date to another (b − a), in local time. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number];
  return Math.round(
    (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000,
  );
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa'. */
export const showDate = (iso: string) => iso.split('-').reverse().join('/');
/** 'MM-DD' → 'dd/mm'. */
export const showMonthDay = (md: string) => md.split('-').reverse().join('/');

export interface Debtor {
  person: Person;
  debts: CakeDebt[];
  /** Days since the oldest open debt. */
  oldestDays: number;
}

/** People who owe, oldest debt first (the top is the "Caloteiro-mor"). */
export function debtors(c: CommunityState): Debtor[] {
  const byId = new Map(c.people.map((p) => [p.id, p]));
  const groups = new Map<string, CakeDebt[]>();
  for (const d of c.debts) {
    if (d.status !== 'owed') continue;
    groups.set(d.personId, [...(groups.get(d.personId) ?? []), d]);
  }
  return [...groups]
    .map(([id, debts]) => ({
      person: byId.get(id)!,
      debts,
      oldestDays: Math.max(...debts.map((d) => daysBetween(d.occurredOn, c.today))),
    }))
    .filter((d) => d.person)
    .sort((a, b) => b.oldestDays - a.oldestDays || b.debts.length - a.debts.length);
}

export const pending = (c: CommunityState) => c.debts.filter((d) => d.status === 'pending');

export const paid = (c: CommunityState) =>
  c.debts
    .filter((d) => d.status === 'paid')
    .sort((a, b) => (b.paidOn ?? b.occurredOn).localeCompare(a.paidOn ?? a.occurredOn));

/** Upcoming birthdays, soonest first. */
export function birthdays(c: CommunityState): { person: Person; inDays: number }[] {
  const year = Number(c.today.slice(0, 4));
  return c.people
    .filter((p) => p.birthday)
    .map((person) => {
      let next = `${year}-${person.birthday}`;
      if (next < c.today) next = `${year + 1}-${person.birthday}`;
      return { person, inDays: daysBetween(c.today, next) };
    })
    .sort((a, b) => a.inDays - b.inDays);
}

/** Who brought the most cakes (paid debts), for the fun counters. */
export function topBakers(c: CommunityState, n = 3): { person: Person; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of c.debts)
    if (d.status === 'paid') counts.set(d.personId, (counts.get(d.personId) ?? 0) + 1);
  const byId = new Map(c.people.map((p) => [p.id, p]));
  return [...counts]
    .map(([id, count]) => ({ person: byId.get(id)!, count }))
    .filter((x) => x.person)
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** Milestone presets; labels live in pt-PT.json under cakes.reasons. */
export const REASON_KEYS = [
  'birthday',
  'house',
  'child',
  'wedding',
  'joined',
  'anniversary',
  'certification',
  'promotion',
  'car',
  'justBecause',
] as const;
export type ReasonKey = (typeof REASON_KEYS)[number];

// --- office days (D-54) -----------------------------------------------------------------------------

/** Mon = 1 … Fri = 5 for an ISO date. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1;
}

/** ISO date of a weekday (1..5) in the week starting on `monday`. */
export function dateInWeek(monday: string, weekday: number): string {
  const [y, m, d] = monday.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d + weekday - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Who's expected on a day: said "Vou", or voted for that weekday and didn't say "Não vou". */
export function goingIds(c: CommunityState, date: string): string[] {
  const week = c.weeks.find((w) => w.weekStart === weekStartOf(date));
  const wd = weekdayOf(date);
  return c.people
    .filter((p) => p.inTeam)
    .filter((p) => {
      const a = c.attendance.find((x) => x.date === date && x.personId === p.id);
      if (a?.plan === 'going') return true;
      if (a?.plan === 'not_going') return false;
      return !!week?.votes.some((v) => v.personId === p.id && v.weekday === wd);
    })
    .map((p) => p.id);
}

/** The Monday of the week containing this date. */
export function weekStartOf(iso: string): string {
  // dateInWeek counts from its first argument, so going back (weekday − 1) days lands on Monday.
  return dateInWeek(iso, 2 - weekdayOf(iso));
}

/** Per person: presence over closed days, unjustified absences, and how many count towards N. */
export function attendanceStats(c: CommunityState) {
  const closed = new Set(c.days.filter((d) => d.closed).map((d) => d.date));
  return c.people
    .filter((p) => p.inTeam)
    .map((person) => {
      const rows = c.attendance.filter((a) => a.personId === person.id && closed.has(a.date));
      const present = rows.filter((a) => a.status === 'present').length;
      const unjustified = rows.filter((a) => a.judgement === 'unjustified').length;
      const towards = rows.filter((a) => a.judgement === 'unjustified' && !a.counted).length;
      return {
        person,
        present,
        total: rows.length,
        unjustified,
        towards,
      };
    })
    .sort((a, b) => b.towards - a.towards || a.person.name.localeCompare(b.person.name, 'pt-PT'));
}

/** Excuses and "Não vou" reasons, newest first: the Livro de desculpas. */
export function excuses(c: CommunityState) {
  return c.attendance
    .filter((a) => a.excuse || a.planReason)
    .map((a) => ({ ...a, text: (a.excuse ?? a.planReason)! }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** How stale a debt is, for the bar colour (--stale-1..4) and its funny label (stale.*). */
export function staleness(days: number): {
  level: 1 | 2 | 3 | 4;
  key: 'fresh' | 'dusty' | 'fossil' | 'heritage';
} {
  if (days < 30) return { level: 1, key: 'fresh' };
  if (days < 90) return { level: 2, key: 'dusty' };
  if (days < 180) return { level: 3, key: 'fossil' };
  return { level: 4, key: 'heritage' };
}
