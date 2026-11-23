import { describe, expect, it } from 'vitest';
import {
  ClientEventSchemas,
  cleanDisplayName,
  extractMentionIds,
  InviteCode,
  isEmoji,
  JoinRequest,
  mentionToken,
  nameKey,
  slugify,
} from '../src/index';

const A = '01JA0000000000000000000000';
const B = '01JB0000000000000000000000';

describe('names', () => {
  it('cleans display names but keeps case and accents', () => {
    expect(cleanDisplayName('  José   Silva ')).toBe('José Silva');
  });
  it('makes José, jose and JOSÉ collide (D-32)', () => {
    expect(nameKey('José')).toBe(nameKey('jose '));
    expect(nameKey('JOSÉ')).toBe('jose');
    expect(nameKey('Ana  Rita')).toBe('ana rita');
  });
});

describe('slugify', () => {
  it.each([
    ['Futebol & Cia', 'futebol-cia'],
    ['Comida 🍕', 'comida'],
    ['Ação!', 'acao'],
    ['🍕🍕', ''],
  ])('%s → %s', (input, out) => expect(slugify(input)).toBe(out));
});

describe('mentions', () => {
  it('extracts unique ids in order', () => {
    expect(
      extractMentionIds(`hi ${mentionToken(A)} and ${mentionToken(B)} ${mentionToken(A)}`),
    ).toEqual([A, B]);
  });
  it('ignores malformed tokens and plain @names', () => {
    expect(extractMentionIds('<@nope> @Costa <@01JA>')).toEqual([]);
  });
});

describe('isEmoji', () => {
  it.each(['👍', '❤️', '🇵🇹', '👨‍👩‍👧', '👍🏽'])('accepts %s', (e) => expect(isEmoji(e)).toBe(true));
  it.each(['a', '123', '#', '👍abc', '<script>', '', '👍'.repeat(9)])('rejects %s', (e) =>
    expect(isEmoji(e)).toBe(false),
  );
});

describe('schemas', () => {
  it('validates invite codes strictly', () => {
    expect(InviteCode.safeParse('A'.repeat(22)).success).toBe(true);
    expect(InviteCode.safeParse('A'.repeat(21)).success).toBe(false);
    expect(InviteCode.safeParse('A'.repeat(21) + '=').success).toBe(false);
  });
  it('trims display names and enforces length', () => {
    expect(JoinRequest.parse({ code: 'A'.repeat(22), displayName: '  Ana ' }).displayName).toBe(
      'Ana',
    );
    expect(JoinRequest.safeParse({ code: 'A'.repeat(22), displayName: 'A' }).success).toBe(false);
  });
  it('defaults attachmentIds and caps message length', () => {
    const ok = ClientEventSchemas['messages:send'].parse({
      roomId: A,
      clientId: 'abcdefgh',
      body: 'olá',
    });
    expect(ok.attachmentIds).toEqual([]);
    expect(
      ClientEventSchemas['messages:send'].safeParse({
        roomId: A,
        clientId: 'abcdefgh',
        body: 'x'.repeat(4001),
      }).success,
    ).toBe(false);
  });
  it('rejects client-supplied ids that are not ULIDs', () => {
    expect(ClientEventSchemas['messages:delete'].safeParse({ messageId: '1 OR 1=1' }).success).toBe(
      false,
    );
  });
});
