import { afterEach, describe, expect, it } from 'vitest';
import {
  MAIN_ROOM_ID,
  mascotByKey,
  MASCOT_KEYS,
  MASCOTS,
  mentionToken,
  type Message,
} from '@pausa/shared';
import communityLines from '../src/community/lines.pt-PT.json';
import { MASCOT_LINES } from '../src/mascots/lines';
import { PERSONALITIES } from '../src/mascots/personalities';
import { call, cid, collect, emit, sleep, startTestServer, type TestServer } from './harness';

let s: TestServer;
afterEach(async () => {
  await s?.close();
});

const fromMascot = (events: { message: Message }[]) =>
  events.map((e) => e.message).filter((m) => MASCOTS.some((x) => x.userId === m.userId));

describe('names: the host renames, nobody else', () => {
  it('host renames; everyone hears it; admins and members can’t; names stay unique', async () => {
    s = await startTestServer({ MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' });
    const host = await s.connect(s.user('Costa', 'host'));
    const admin = await s.connect(s.user('Ana', 'admin'));
    const updates = collect(admin, 'member:updated');

    const res = await call(host, 'admin:mascots:rename', { key: 'ferreira', name: 'Avó Rosa' });
    expect(res.member).toMatchObject({
      id: mascotByKey('ferreira').userId,
      displayName: 'Avó Rosa',
      isBot: true,
    });
    await sleep(30);
    expect(updates.at(-1)?.member.displayName).toBe('Avó Rosa');

    expect(
      await emit(admin, 'admin:mascots:rename', { key: 'nuvem', name: 'Bichano' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(await emit(host, 'admin:mascots:rename', { key: 'nuvem', name: 'Ana' })).toMatchObject({
      ok: false,
      error: { code: 'NAME_TAKEN' },
    });
    expect((await call(admin, 'admin:log:list', {})).entries[0]).toMatchObject({
      action: 'mascot.rename',
    });
  });

  it('a renamed mascot answers to its new name', async () => {
    s = await startTestServer({ MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' });
    const host = await s.connect(s.user('Costa', 'host'));
    await call(host, 'admin:mascots:rename', { key: 'lurdes', name: 'Mamã Graça' });
    const events = collect(host, 'message:new');
    await call(host, 'messages:send', {
      roomId: MAIN_ROOM_ID,
      clientId: cid(),
      body: 'Ó Graça, anda cá',
    });
    await sleep(80);
    expect(fromMascot(events)).toHaveLength(1);
  });

  it('defaults fit the personalities', () => {
    expect(mascotByKey('ferreira').name).toBe('Avó Dores');
    expect(mascotByKey('pixel').name).toBe('Tio Pixel');
  });
});

describe('temperament', () => {
  it('the grumpy cat can ignore a mention; the granny never does', async () => {
    s = await startTestServer({ MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' });
    const ana = await s.connect(s.user('Ana'));
    const events = collect(ana, 'message:new');
    // Dice low enough to trip the cat's ignore (0.3), never the granny's (0).
    let n = 0;
    s.ctx.mascots.rng = () => (n++ === 0 ? 0.1 : 0.9);
    await call(ana, 'messages:send', {
      roomId: MAIN_ROOM_ID,
      clientId: cid(),
      body: mentionToken(mascotByKey('nuvem').userId),
    });
    await sleep(50);
    expect(fromMascot(events)).toHaveLength(0);

    n = 0;
    await call(ana, 'messages:send', {
      roomId: MAIN_ROOM_ID,
      clientId: cid(),
      body: mentionToken(mascotByKey('ferreira').userId),
    });
    await sleep(50);
    expect(fromMascot(events).map((m) => m.userId)).toEqual([mascotByKey('ferreira').userId]);
  });

  it('now and then an emoji in character, at most once per 10 min per room', async () => {
    s = await startTestServer({ MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0.01' });
    const ana = await s.connect(s.user('Ana'));
    const updates = collect(ana, 'message:updated');
    s.ctx.mascots.rng = () => 0; // always react
    for (let i = 0; i < 3; i++)
      await call(ana, 'messages:send', {
        roomId: MAIN_ROOM_ID,
        clientId: cid(),
        body: `mensagem ${i}`,
      });
    await sleep(80);
    expect(updates).toHaveLength(1);
    const reaction = updates[0]!.message.reactions[0]!;
    expect(PERSONALITIES.lurdes.emojis).toContain(reaction.emoji);
    expect(reaction.userIds).toEqual([mascotByKey('lurdes').userId]);
  });

  it('#geral announcements speak in the voice of #geral’s mascot', async () => {
    s = await startTestServer({ MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' });
    const host = await s.connect(s.user('Costa', 'host'));
    await call(host, 'rooms:update', { roomId: MAIN_ROOM_ID, mascotKey: 'faisca' });
    const events = collect(host, 'message:new');
    const me = (await call(host, 'community:state', {})).people[0]!;
    await call(host, 'cakes:record', {
      personId: me.id,
      reason: 'Teste',
      occurredOn: '2026-01-01',
    });
    await sleep(50);
    const said = fromMascot(events)[0]!;
    expect(said.userId).toBe(mascotByKey('faisca').userId);
    expect(said.body).toContain('!!!');
  });
});

describe('lines', () => {
  const PLACEHOLDERS = /\{(\w+)\}/g;
  const CHAT_OK = new Set([
    'name',
    'room',
    'topic',
    'label',
    'hours',
    'who',
    'count',
    'days',
    'date',
  ]);
  const COMMUNITY_OK = new Set(['name', 'reason', 'who', 'date', 'count', 'cake']);

  it('chat lines: complete for every mascot, known placeholders, no line shared between mascots', () => {
    const seen = new Map<string, string>();
    for (const key of MASCOT_KEYS) {
      const l = MASCOT_LINES[key];
      expect(l.intro.length, key).toBeGreaterThanOrEqual(3);
      expect(l.mention.length, key).toBeGreaterThanOrEqual(8);
      expect(l.triggers.length, key).toBeGreaterThanOrEqual(5);
      for (const kind of ['warn', 'label', 'mute'] as const)
        expect(l[kind].length, key).toBeGreaterThanOrEqual(3);
      const all = [
        ...l.intro,
        ...l.mention,
        ...l.triggers.flatMap((t) => t.lines),
        ...l.warn,
        ...l.label,
        ...l.mute,
      ];
      for (const line of all) {
        expect(line.length).toBeLessThan(400);
        for (const [, p] of line.matchAll(PLACEHOLDERS))
          expect(CHAT_OK.has(p!), `${key}: {${p}}`).toBe(true);
        expect(seen.get(line), `"${line}" in ${key} and ${seen.get(line)}`).toBeUndefined();
        seen.set(line, key);
      }
    }
  });

  it('community lines: every mascot has every event, known placeholders', () => {
    const voices = communityLines as Record<string, Record<string, string[]>>;
    const events = Object.keys(voices['lurdes']!);
    for (const key of MASCOT_KEYS) {
      expect(Object.keys(voices[key] ?? {}).sort(), key).toEqual([...events].sort());
      for (const line of Object.values(voices[key]!).flat())
        for (const [, p] of line.matchAll(PLACEHOLDERS))
          expect(COMMUNITY_OK.has(p!), `${key}: {${p}}`).toBe(true);
    }
  });
});
