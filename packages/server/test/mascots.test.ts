import { afterEach, describe, expect, it } from 'vitest';
import { MAIN_ROOM_ID, mascotByKey, MASCOTS, mentionToken, type Message } from '@pausa/shared';
import { sendMessage } from '../src/messages/service';
import { getUser } from '../src/members/service';
import { MASCOT_LINES } from '../src/mascots/lines';
import { call, cid, collect, emit, sleep, startTestServer, type TestServer } from './harness';

// Mascots answer immediately in tests; MASCOT_CHANCE decides whether keywords trigger.
const ALWAYS = { MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '1' };
const NEVER = { MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' };

let s: TestServer;
afterEach(async () => {
  await s.close();
});

const lurdes = mascotByKey('lurdes');
const lurdesLines = MASCOT_LINES.lurdes;
const allLines = (key: keyof typeof MASCOT_LINES) => {
  const l = MASCOT_LINES[key];
  return [...l.intro, ...l.mention, ...l.triggers.flatMap((t) => t.lines)];
};
/** Lines are templates; compare without the {name}/{room} placeholders' values. */
const matchesOneOf = (body: string | null, lines: string[]) =>
  lines.some((line) => {
    const pattern = line
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\{name\\\}|\\\{room\\\}/g, '.+');
    return new RegExp(`^${pattern}$`, 's').test(body ?? '');
  });

const fromMascot = (events: { message: Message }[]) =>
  events.map((e) => e.message).filter((m) => MASCOTS.some((x) => x.userId === m.userId));

describe('mascot users', () => {
  it('exist as bot members, never online, with #geral on Dona Lurdes', async () => {
    s = await startTestServer(NEVER);
    const ana = await s.connect(s.user('Ana', 'host'));
    const { members } = await call(ana, 'members:list', {});
    for (const m of MASCOTS) {
      expect(members.find((x) => x.id === m.userId)).toMatchObject({
        displayName: m.name,
        isBot: true,
        online: false,
        active: true,
      });
    }
    expect(members.find((x) => x.displayName === 'Ana')?.isBot).toBe(false);
    const { rooms } = await call(ana, 'rooms:list', {});
    expect(rooms.find((r) => r.id === MAIN_ROOM_ID)).toMatchObject({
      mascotKey: 'lurdes',
      mascotEnabled: true,
    });
  });

  it('cannot be revoked or promoted', async () => {
    s = await startTestServer(NEVER);
    const host = await s.connect(s.user('Ana', 'host'));
    const revoke = await emit(host, 'admin:members:revoke', { userId: lurdes.userId });
    expect(revoke).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    const promote = await emit(host, 'admin:members:setRole', {
      userId: lurdes.userId,
      role: 'admin',
    });
    expect(promote).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('a person can’t take a mascot’s name', async () => {
    s = await startTestServer(NEVER);
    expect(() => s.user('Dona Lurdes')).toThrow();
  });
});

describe('talking', () => {
  it('answers an @mention as a reply, and everyone sees it', async () => {
    s = await startTestServer(NEVER); // keywords off: only the mention can trigger
    const ana = await s.connect(s.user('Ana'));
    const rui = await s.connect(s.user('Rui'));
    const ruiNew = collect(rui, 'message:new');

    const { message } = await call(ana, 'messages:send', {
      roomId: MAIN_ROOM_ID,
      clientId: cid(),
      body: `olá ${mentionToken(lurdes.userId)}`,
    });
    await sleep(150);

    const replies = fromMascot(ruiNew);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ userId: lurdes.userId, roomId: MAIN_ROOM_ID });
    expect(replies[0]!.replyTo?.id).toBe(message.id);
    expect(matchesOneOf(replies[0]!.body, lurdesLines.mention)).toBe(true);
  });

  it('answers its name in plain text like a mention', async () => {
    s = await startTestServer(NEVER);
    const ana = await s.connect(s.user('Ana'));
    const events = collect(ana, 'message:new');
    await call(ana, 'messages:send', {
      roomId: MAIN_ROOM_ID,
      clientId: cid(),
      body: 'Ó Dona Lurdes, já sabe a última?',
    });
    await sleep(150);
    expect(fromMascot(events)).toHaveLength(1);
  });

  it('reacts to its keywords when the dice say so, then cools down', async () => {
    s = await startTestServer(ALWAYS);
    const ana = await s.connect(s.user('Ana'));
    const events = collect(ana, 'message:new');
    const keyword = lurdesLines.triggers[0]!.words[0]!;

    await call(ana, 'messages:send', { roomId: MAIN_ROOM_ID, clientId: cid(), body: keyword });
    await sleep(150);
    await call(ana, 'messages:send', { roomId: MAIN_ROOM_ID, clientId: cid(), body: keyword });
    await sleep(150);

    const replies = fromMascot(events);
    expect(replies).toHaveLength(1); // the second one hits the per-room cooldown
    expect(matchesOneOf(replies[0]!.body, lurdesLines.triggers[0]!.lines)).toBe(true);
  });

  it('stays quiet on keywords when the dice say no', async () => {
    s = await startTestServer(NEVER);
    const ana = await s.connect(s.user('Ana'));
    const events = collect(ana, 'message:new');
    const keyword = lurdesLines.triggers[0]!.words[0]!;
    await call(ana, 'messages:send', { roomId: MAIN_ROOM_ID, clientId: cid(), body: keyword });
    await sleep(150);
    expect(fromMascot(events)).toHaveLength(0);
  });

  it('never answers a mascot, so two mascots can’t loop', async () => {
    s = await startTestServer(ALWAYS);
    const ana = await s.connect(s.user('Ana'));
    const events = collect(ana, 'message:new');
    const bolacha = getUser(s.ctx.db, mascotByKey('bolacha').userId)!;
    // A mascot saying Dona Lurdes' name and a keyword, posted directly as the bot.
    const { message } = sendMessage(s.ctx.db, bolacha, {
      roomId: MAIN_ROOM_ID,
      clientId: cid(),
      body: `${mentionToken(lurdes.userId)} ${lurdesLines.triggers[0]!.words[0]}`,
      attachmentIds: [],
    });
    s.ctx.mascots.onMessage(message, bolacha);
    await sleep(150);
    expect(fromMascot(events)).toHaveLength(0);
  });

  it('mentions get their own short cooldown per person', async () => {
    s = await startTestServer(NEVER);
    const ana = await s.connect(s.user('Ana'));
    const events = collect(ana, 'message:new');
    for (let i = 0; i < 3; i++) {
      await call(ana, 'messages:send', {
        roomId: MAIN_ROOM_ID,
        clientId: cid(),
        body: `${mentionToken(lurdes.userId)} ${i}`,
      });
    }
    await sleep(150);
    expect(fromMascot(events)).toHaveLength(1);
  });

  it('is silent where it is switched off, and in archived rooms', async () => {
    s = await startTestServer(ALWAYS);
    const anaUser = s.user('Ana');
    const ana = await s.connect(anaUser);
    const events = collect(ana, 'message:new');

    const { room } = await call(ana, 'rooms:create', { name: 'Silêncio' });
    await sleep(150);
    events.length = 0; // drop the introduction
    const mascot = mascotByKey(room.mascotKey!);
    await call(ana, 'rooms:update', { roomId: room.id, mascotEnabled: false });
    const { message } = await call(ana, 'messages:send', {
      roomId: room.id,
      clientId: cid(),
      body: mentionToken(mascot.userId),
    });
    await sleep(150);
    expect(fromMascot(events)).toHaveLength(0);

    await call(ana, 'rooms:update', { roomId: room.id, mascotEnabled: true });
    await call(ana, 'rooms:archive', { roomId: room.id, archived: true });
    // Archived rooms reject new messages, so replay the hook as if one had slipped through.
    s.ctx.mascots.onMessage(message, getUser(s.ctx.db, anaUser.id)!);
    await sleep(150);
    expect(fromMascot(events)).toHaveLength(0);
  });
});

describe('rooms', () => {
  it('a new room gets the least-used mascot, who introduces itself', async () => {
    s = await startTestServer(NEVER);
    const ana = await s.connect(s.user('Ana'));
    const events = collect(ana, 'message:new');

    const first = (await call(ana, 'rooms:create', { name: 'Petiscos' })).room;
    const second = (await call(ana, 'rooms:create', { name: 'Futebol' })).room;
    await sleep(150);

    expect(first.mascotKey).toBe('bolacha');
    expect(second.mascotKey).toBe('faisca');
    const intros = fromMascot(events);
    expect(intros.map((m) => [m.roomId, m.userId])).toEqual([
      [first.id, mascotByKey('bolacha').userId],
      [second.id, mascotByKey('faisca').userId],
    ]);
    expect(matchesOneOf(intros[0]!.body, MASCOT_LINES.bolacha.intro)).toBe(true);
  });

  it('only someone who manages the room changes its mascot', async () => {
    s = await startTestServer(NEVER);
    const ana = await s.connect(s.user('Ana'));
    const rui = await s.connect(s.user('Rui'));
    const { room } = await call(ana, 'rooms:create', { name: 'Petiscos' });

    const denied = await emit(rui, 'rooms:update', { roomId: room.id, mascotKey: 'pixel' });
    expect(denied).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });

    const updated = collect(rui, 'room:updated');
    const ok = await call(ana, 'rooms:update', { roomId: room.id, mascotKey: 'pixel' });
    expect(ok.room.mascotKey).toBe('pixel');
    await sleep(50);
    expect(updated[0]?.room.mascotKey).toBe('pixel');

    const bad = await emit(ana, 'rooms:update', { roomId: room.id, mascotKey: 'dragão' });
    expect(bad).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('mascot messages come back through sync after a reconnect', async () => {
    s = await startTestServer(NEVER);
    const ana = await s.connect(s.user('Ana'));
    const { message } = await call(ana, 'messages:send', {
      roomId: MAIN_ROOM_ID,
      clientId: cid(),
      body: mentionToken(lurdes.userId),
    });
    await sleep(150);
    const { messages } = await call(ana, 'messages:sync', {
      roomId: MAIN_ROOM_ID,
      sinceSeq: message.seq,
    });
    expect(messages.map((m) => m.userId)).toContain(lurdes.userId);
  });
});

describe('lines', () => {
  it('every mascot has intro, mention and keyword lines within the message limit', () => {
    for (const m of MASCOTS) {
      const l = MASCOT_LINES[m.key];
      expect(l.intro.length).toBeGreaterThan(0);
      expect(l.mention.length).toBeGreaterThan(2);
      expect(l.triggers.length).toBeGreaterThan(0);
      for (const line of allLines(m.key)) expect(line.length).toBeLessThan(400);
    }
  });
});
