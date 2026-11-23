import ptPT from './pt-PT.json';

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every valid message key, checked at compile time ("theme.dark", "shell.status", …). */
export type MessageKey = Leaves<typeof ptPT>;

/**
 * Looks up a pt-PT string (CLAUDE.md rule 7). `{name}` placeholders are filled from `vars`.
 * Adding a locale later means adding a JSON file and choosing it here; components don't change.
 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let node: unknown = ptPT;
  for (const part of key.split('.')) {
    node =
      typeof node === 'object' && node !== null
        ? (node as Record<string, unknown>)[part]
        : undefined;
  }
  if (typeof node !== 'string') return key;
  if (!vars) return node;
  return node.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
