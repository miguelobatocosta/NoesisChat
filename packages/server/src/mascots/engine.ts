import type { MascotScript } from './lines';

/** Lowercase, no accents, mention tokens removed: "Café" and "cafe" match the same keyword. */
export function normalize(text: string): string {
  return text
    .replace(/<@[0-9A-Z]{26}>/g, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word (or whole-phrase) match on normalized text. */
export function hasWord(normalizedText: string, word: string): boolean {
  const w = escapeRegExp(normalize(word));
  return new RegExp(`(^|[^\\p{L}\\p{N}])${w}($|[^\\p{L}\\p{N}])`, 'u').test(normalizedText);
}

export function callsByName(script: MascotScript, normalizedText: string): boolean {
  return script.names.some((n) => hasWord(normalizedText, n));
}

export function triggeredLines(script: MascotScript, normalizedText: string): string[] | null {
  return (
    script.triggers.find((t) => t.words.some((w) => hasWord(normalizedText, w)))?.lines ?? null
  );
}

export type LineVars = Partial<
  Record<'name' | 'room' | 'topic' | 'label' | 'hours' | 'who' | 'count' | 'days' | 'date', string>
>;

export function fill(line: string, vars: LineVars): string {
  return line.replace(
    /\{(name|room|topic|label|hours|who|count|days|date)\}/g,
    (_, k: keyof LineVars) => vars[k] ?? '',
  );
}

/** Picks a line, avoiding the one used last time when there's a choice. */
export function pick(lines: string[], rng: () => number, last?: string): string {
  const pool = lines.length > 1 ? lines.filter((l) => l !== last) : lines;
  return pool[Math.floor(rng() * pool.length) % pool.length]!;
}
