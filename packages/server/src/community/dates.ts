/** Local-calendar helpers (the host PC's time zone, Lisbon). Dates travel as 'YYYY-MM-DD'. */

const pad = (n: number) => String(n).padStart(2, '0');

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const today = (now: number) => isoDate(new Date(now));

/** 'MM-DD' of a date. */
export const monthDay = (d: Date) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local midnight of an ISO date. */
export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Whole days between two ISO dates (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000);
}

/** Monday of the week containing this date. */
export function weekStart(iso: string): string {
  const d = parseIso(iso);
  const back = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - back);
  return isoDate(d);
}

/**
 * Dates as they come out of an Excel paste: 'dd/mm/yyyy' (or with '-' / '.'), 'yyyy-mm-dd', or an
 * Excel serial number (days since 1899-12-30). Returns null when it isn't a real date.
 */
export function parseSheetDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
    if (y < 100) y += 2000;
  } else if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const base = new Date(1899, 11, 30);
    base.setDate(base.getDate() + Math.floor(Number(s)));
    return isoDate(base);
  } else return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return isoDate(date);
}
