import { describe, expect, it } from 'vitest';
import type { NotifyLevel } from '@pausa/shared';
import { type NotifyInput, shouldNotify } from '../src/lib/notify';

const levels: NotifyLevel[] = ['all', 'mentions', 'none'];
const bools = [true, false];

describe('shouldNotify: every combination', () => {
  for (const level of levels)
    for (const isMention of bools)
      for (const isReplyToMe of bools)
        for (const isOwn of bools)
          for (const roomActive of bools)
            for (const windowFocused of bools) {
              const input: NotifyInput = {
                level,
                isMention,
                isReplyToMe,
                isOwn,
                roomActive,
                windowFocused,
              };
              const expected =
                !isOwn &&
                !(roomActive && windowFocused) &&
                (level === 'all' || (level === 'mentions' && (isMention || isReplyToMe)));
              it(JSON.stringify(input), () => expect(shouldNotify(input)).toBe(expected));
            }
});

describe('the acceptance cases (PROMPTS Phase 5)', () => {
  const base = { isReplyToMe: false, isOwn: false, roomActive: false, windowFocused: false };
  it('Mentions + mention → notifies', () =>
    expect(shouldNotify({ ...base, level: 'mentions', isMention: true })).toBe(true));
  it('Mentions + no mention → silent', () =>
    expect(shouldNotify({ ...base, level: 'mentions', isMention: false })).toBe(false));
  it('Nothing + mention → silent', () =>
    expect(shouldNotify({ ...base, level: 'none', isMention: true })).toBe(false));
  it('own messages → silent', () =>
    expect(shouldNotify({ ...base, level: 'all', isMention: true, isOwn: true })).toBe(false));
});
