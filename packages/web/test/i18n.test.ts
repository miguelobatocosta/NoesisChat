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
    expect(t('typing.two', { a: 'Ana', b: 'Rui' })).toBe('Ana e Rui estão a escrever…');
  });

  it('leaves unknown placeholders visible instead of inventing values', () => {
    expect(t('typing.two', { a: 'Ana' })).toBe('Ana e {b} estão a escrever…');
  });

  it('has a message for every error code the client can show', async () => {
    const { ERROR_CODES } = await import('@pausa/shared');
    for (const code of [...ERROR_CODES, 'TIMEOUT', 'OFFLINE'] as const) {
      expect(t(`errors.${code}`)).not.toBe(`errors.${code}`);
    }
  });

  it('every message is a non-empty string', () => {
    for (const [key, value] of leaves(ptPT)) {
      expect(typeof value, key).toBe('string');
      expect((value as string).trim(), key).not.toBe('');
    }
  });
});
