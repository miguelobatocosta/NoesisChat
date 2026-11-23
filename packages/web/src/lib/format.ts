const time = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat('pt-PT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const full = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' });

export const formatTime = (ms: number) => time.format(ms);
export const formatFull = (ms: number) => full.format(ms);

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** "Hoje", "Ontem", "23 de novembro", or with the year if it's not this year. */
export function formatDay(
  ms: number,
  labels: { today: string; yesterday: string },
  now = Date.now(),
): string {
  const today = dayKey(now);
  const yesterday = dayKey(now - 24 * 60 * 60 * 1000);
  const key = dayKey(ms);
  if (key === today) return labels.today;
  if (key === yesterday) return labels.yesterday;
  return new Date(ms).getFullYear() === new Date(now).getFullYear()
    ? dayMonth.format(ms)
    : dayMonthYear.format(ms);
}

const relative = new Intl.RelativeTimeFormat('pt-PT', { numeric: 'auto' });

export function formatRelative(ms: number, now = Date.now()): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return relative.format(Math.round(diff / 1000), 'second');
  if (abs < 3_600_000) return relative.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return relative.format(Math.round(diff / 3_600_000), 'hour');
  return relative.format(Math.round(diff / 86_400_000), 'day');
}
