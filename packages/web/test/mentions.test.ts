import { describe, expect, it } from 'vitest';
import type { Member } from '@pausa/shared';
import { findTrigger, fromWire, toWire } from '../src/lib/mentions';
import { plainText } from '../src/lib/plaintext';

const member = (id: string, displayName: string, active = true): Member => ({
  id,
  displayName,
  role: 'member',
  active,
  online: true,
  joinedAt: 0,
  lastSeenAt: null,
  isBot: false,
});
const ANA = '01JA0000000000000000000000';
const ANA_RITA = '01JB0000000000000000000000';
const OLD = '01JC0000000000000000000000';
const members = [member(ANA, 'Ana'), member(ANA_RITA, 'Ana Rita'), member(OLD, 'Saiu', false)];

describe('toWire', () => {
  it('prefers the longest matching name', () => {
    expect(toWire('olá @Ana Rita e @Ana!', members)).toBe(`olá <@${ANA_RITA}> e <@${ANA}>!`);
  });
  it('is case-insensitive but needs a word boundary', () => {
    expect(toWire('@ana', members)).toBe(`<@${ANA}>`);
    expect(toWire('@Anabela', members)).toBe('@Anabela');
    expect(toWire('mail@Ana', members)).toBe('mail@Ana');
  });
  it('ignores revoked members and expands :shortcodes:', () => {
    expect(toWire('@Saiu :pizza:', members)).toBe('@Saiu 🍕');
  });
  it('round-trips through fromWire', () => {
    const nameOf = (id: string) => members.find((m) => m.id === id)!.displayName;
    expect(fromWire(toWire('olá @Ana Rita', members), nameOf)).toBe('olá @Ana Rita');
  });
});

describe('findTrigger', () => {
  it('finds @ and : triggers before the caret', () => {
    expect(findTrigger('olá @An', 7)).toEqual({ kind: 'mention', query: 'An', start: 4 });
    expect(findTrigger('bom :piz', 8)).toEqual({ kind: 'emoji', query: 'piz', start: 4 });
    expect(findTrigger('email@x', 7)).toBeNull();
    expect(findTrigger('12:30', 5)).toBeNull();
  });
});

describe('plainText', () => {
  it('strips markdown and resolves mentions for previews', () => {
    expect(plainText(`**olá** <@${ANA}> \`x\``, () => 'Ana')).toBe('olá @Ana x');
    expect(plainText('a'.repeat(200), () => '', 10)).toBe('aaaaaaaaa…');
  });
});
