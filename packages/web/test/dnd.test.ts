import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DND,
  type DndSettings,
  isQuiet,
  quietUntil,
  tomorrowMorning,
} from '../src/lib/dnd';
import { shouldNotify } from '../src/lib/notify';

// Local-time dates, so the tests don't depend on the machine's time zone.
const at = (y: number, mo: number, d: number, h: number, mi = 0) =>
  new Date(y, mo - 1, d, h, mi).getTime();
const WED = (h: number, mi = 0) => at(2026, 11, 25, h, mi); // a Wednesday
const SAT = (h: number) => at(2026, 11, 28, h);

const evening: DndSettings = {
  ...DEFAULT_DND,
  schedule: { enabled: true, from: '19:00', to: '09:00' },
};

describe('isQuiet', () => {
  it('is never quiet by default', () => {
    expect(isQuiet(DEFAULT_DND, WED(23))).toBe(false);
  });

  it('a manual pause lasts until its time', () => {
    const s = { ...DEFAULT_DND, until: WED(15) };
    expect(isQuiet(s, WED(14, 59))).toBe(true);
    expect(isQuiet(s, WED(15))).toBe(false);
  });

  it('quiet hours can cross midnight', () => {
    expect(isQuiet(evening, WED(18, 59))).toBe(false);
    expect(isQuiet(evening, WED(19))).toBe(true);
    expect(isQuiet(evening, WED(23, 30))).toBe(true);
    expect(isQuiet(evening, at(2026, 11, 26, 8, 59))).toBe(true);
    expect(isQuiet(evening, at(2026, 11, 26, 9))).toBe(false);
  });

  it('daytime quiet hours too, and switched-off hours do nothing', () => {
    const lunch = { ...DEFAULT_DND, schedule: { enabled: true, from: '13:00', to: '14:00' } };
    expect(isQuiet(lunch, WED(13, 30))).toBe(true);
    expect(isQuiet(lunch, WED(14))).toBe(false);
    expect(
      isQuiet({ ...evening, schedule: { ...evening.schedule, enabled: false } }, WED(23)),
    ).toBe(false);
  });

  it('weekends are quiet all day when chosen', () => {
    expect(isQuiet({ ...DEFAULT_DND, weekends: true }, SAT(12))).toBe(true);
    expect(isQuiet({ ...DEFAULT_DND, weekends: true }, WED(12))).toBe(false);
  });
});

describe('quietUntil', () => {
  it('tells when the silence ends', () => {
    expect(quietUntil(evening, WED(22))).toBe(at(2026, 11, 26, 9));
    expect(quietUntil(evening, WED(12))).toBeNull();
    expect(quietUntil({ ...DEFAULT_DND, until: WED(15) }, WED(14))).toBe(WED(15));
  });

  it('tomorrow morning is 09:00 the next day', () => {
    expect(tomorrowMorning(WED(22))).toBe(at(2026, 11, 26, 9));
  });
});

describe('shouldNotify while quiet', () => {
  it('silences everything, mentions included', () => {
    const base = {
      level: 'all' as const,
      isMention: true,
      isReplyToMe: true,
      isOwn: false,
      roomActive: false,
      windowFocused: false,
    };
    expect(shouldNotify(base)).toBe(true);
    expect(shouldNotify({ ...base, quiet: true })).toBe(false);
  });
});
