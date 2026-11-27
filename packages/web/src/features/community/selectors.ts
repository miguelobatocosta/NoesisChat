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
