import { useSyncExternalStore } from 'react';

/**
 * Do not disturb (backlog 9), per device: browser notifications are per device, so is silence.
 * Stored in localStorage (a preference, never a token: CLAUDE.md rule 2). Silence blocks every
 * notification, mentions included; the unread count in the title and app icon keeps working.
 */
export interface DndSettings {
  /** Manual pause until this time (ms), or null. */
  until: number | null;
  /** Daily quiet hours, "HH:MM" local time; may cross midnight (19:00 → 09:00). */
  schedule: { enabled: boolean; from: string; to: string };
  /** Saturdays and Sundays are quiet all day. */
  weekends: boolean;
}

export const DEFAULT_DND: DndSettings = {
  until: null,
  schedule: { enabled: false, from: '19:00', to: '09:00' },
  weekends: false,
};

const KEY = 'pausa.dnd';
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const minutes = (hhmm: string) => {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

function inSchedule(s: DndSettings['schedule'], d: Date): boolean {
  const from = minutes(s.from);
  const to = minutes(s.to);
  if (!s.enabled || from === null || to === null || from === to) return false;
  const now = minuteOfDay(d);
  return from < to ? now >= from && now < to : now >= from || now < to;
}

export function isQuiet(s: DndSettings, now: number): boolean {
  const d = new Date(now);
  return (
    (s.until !== null && now < s.until) || inSchedule(s.schedule, d) || (s.weekends && isWeekend(d))
  );
}

/** When the current silence ends (ms), or null if not quiet. Walks forward a minute at a time, ≤ 3 days. */
export function quietUntil(s: DndSettings, now: number): number | null {
  if (!isQuiet(s, now)) return null;
  const start = Math.floor(now / 60_000) * 60_000;
  for (let t = start + 60_000; t < start + 3 * 24 * 3_600_000; t += 60_000) {
    if (!isQuiet(s, t)) return t;
  }
  return null;
}

/** Tomorrow at 09:00 local time. */
export function tomorrowMorning(now: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

function parse(raw: string | null): DndSettings {
  if (!raw) return DEFAULT_DND;
  try {
    const v = JSON.parse(raw) as Partial<DndSettings>;
    return {
      until: typeof v.until === 'number' ? v.until : null,
      schedule: {
        enabled: v.schedule?.enabled === true,
        from: HHMM.test(v.schedule?.from ?? '') ? v.schedule!.from : DEFAULT_DND.schedule.from,
        to: HHMM.test(v.schedule?.to ?? '') ? v.schedule!.to : DEFAULT_DND.schedule.to,
      },
      weekends: v.weekends === true,
    };
  } catch {
    return DEFAULT_DND;
  }
}

let cached: { raw: string | null; value: DndSettings } | null = null;
const listeners = new Set<() => void>();

export function loadDnd(): DndSettings {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    /* storage unavailable: defaults */
  }
  if (!cached || cached.raw !== raw) cached = { raw, value: parse(raw) };
  return cached.value;
}

export function saveDnd(s: DndSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: lasts until reload */
    cached = { raw: JSON.stringify(s), value: s };
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useDnd(): DndSettings {
  return useSyncExternalStore(subscribe, loadDnd);
}
