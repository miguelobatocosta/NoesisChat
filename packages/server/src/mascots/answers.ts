import type { Db } from '../db';
import { listDebts } from '../community/cakes';
import { daysBetween, today } from '../community/dates';
import { officeDays } from '../community/office';
import { listPeople, personOfUser } from '../community/people';
import type { UserRow } from '../members/service';
import { hasWord } from './engine';
import type { LineVars } from './engine';

/**
 * Mascots answering questions about cakes and office days with real data (Phase 19), e.g.
 * "Dona Lurdes, quem deve mais bolos?". Only when someone calls or mentions a mascot.
 */
export type AnswerKey =
  | 'owesMost'
  | 'nobodyOwes'
  | 'broughtMost'
  | 'nobodyBrought'
  | 'myDebt'
  | 'myDebtNone'
  | 'officeWhen'
  | 'officeUnknown'
  | 'cakeWho'
  | 'cakeNobody';

type Question = 'owesMost' | 'broughtMost' | 'myDebt' | 'office' | 'cakeWho';

/** Which question a (normalized: no accents, lower-case) message asks, if any. */
export function detectQuestion(text: string): Question | null {
  const has = (w: string) => hasWord(text, w);
  if (has('quem trouxe') || has('trouxe mais') || has('trouxeram mais')) return 'broughtMost';
  if (has('quem leva') || has('quem traz') || has('quem vai trazer')) return 'cakeWho';
  if (has('quem deve') || has('deve mais') || has('devem mais') || has('caloteiro'))
    return 'owesMost';
  if (has('devo') || has('quanto devo') || has('quantos bolos devo')) return 'myDebt';
  if ((has('quando') || has('que dia')) && (has('escritorio') || has('office') || has('vamos')))
    return 'office';
  return null;
}

const showDate = (iso: string) => iso.split('-').reverse().join('/').slice(0, 5);
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function dayName(iso: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${showDate(iso)}`;
}

/** The answer line to use and its placeholders, or null when it isn't a question we know. */
export function answer(
  db: Db,
  text: string,
  author: UserRow,
  now = Date.now(),
): { key: AnswerKey; vars: LineVars & Record<string, string> } | null {
  const q = detectQuestion(text);
  if (!q) return null;
  const todayIso = today(now);
  const people = new Map(listPeople(db).map((p) => [p.id, p.name]));
  const debts = listDebts(db);
  const owed = debts.filter((d) => d.status === 'owed');

  if (q === 'owesMost') {
    const byPerson = new Map<string, string[]>();
    for (const d of owed)
      byPerson.set(d.personId, [...(byPerson.get(d.personId) ?? []), d.occurredOn]);
    // The oldest debt wins (same as the "Caloteiro-mor" on the Bolos page); ties → more cakes.
    const top = [...byPerson]
      .map(([id, dates]) => [id, [...dates].sort()] as const)
      .sort(([, a], [, b]) => a[0]!.localeCompare(b[0]!) || b.length - a.length)[0];
    if (!top) return { key: 'nobodyOwes', vars: {} };
    const [personId, dates] = top;
    return {
      key: 'owesMost',
      vars: {
        who: people.get(personId) ?? '?',
        count: String(dates.length),
        days: String(daysBetween(dates.sort()[0]!, todayIso)),
      },
    };
  }

  if (q === 'broughtMost') {
    const counts = new Map<string, number>();
    for (const d of debts)
      if (d.status === 'paid') counts.set(d.personId, (counts.get(d.personId) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (!top) return { key: 'nobodyBrought', vars: {} };
    return { key: 'broughtMost', vars: { who: people.get(top[0]) ?? '?', count: String(top[1]) } };
  }

  if (q === 'myDebt') {
    const me = personOfUser(db, author.id);
    const mine = owed
      .filter((d) => d.personId === me?.id)
      .map((d) => d.occurredOn)
      .sort();
    if (mine.length === 0) return { key: 'myDebtNone', vars: {} };
    return {
      key: 'myDebt',
      vars: { count: String(mine.length), days: String(daysBetween(mine[0]!, todayIso)) },
    };
  }

  const next = officeDays(db, todayIso).find((d) => d.date >= todayIso);
  if (q === 'office') {
    if (!next) return { key: 'officeUnknown', vars: {} };
    return { key: 'officeWhen', vars: { date: dayName(next.date) } };
  }
  // cakeWho
  if (!next) return { key: 'officeUnknown', vars: {} };
  const bringers = owed
    .filter((d) => d.pledgedOn === next.date)
    .map((d) => people.get(d.personId) ?? '?');
  if (bringers.length === 0) return { key: 'cakeNobody', vars: { date: dayName(next.date) } };
  return { key: 'cakeWho', vars: { date: dayName(next.date), who: bringers.join(', ') } };
}
