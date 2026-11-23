import { describe, expect, it } from 'vitest';
import { t } from '../src/i18n';
import ptPT from '../src/i18n/pt-PT.json';

function leaves(node: unknown, prefix = ''): [string, unknown][] {
  if (typeof node !== 'object' || node === null) return [[prefix, node]];
  return Object.entries(node).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

describe('t()', () => {
  it('returns pt-PT strings', () => {
    expect(t('theme.dark')).toBe('Escuro');
  });

  it('fills placeholders', () => {
    expect(t('shell.status', { phase: 1, total: 6 })).toBe('Em construção · fase 1 de 6');
  });

  it('leaves unknown placeholders visible instead of inventing values', () => {
    expect(t('shell.status', { phase: 1 })).toBe('Em construção · fase 1 de {total}');
  });

  it('every message is a non-empty string', () => {
    for (const [key, value] of leaves(ptPT)) {
      expect(typeof value, key).toBe('string');
      expect((value as string).trim(), key).not.toBe('');
    }
  });
});
