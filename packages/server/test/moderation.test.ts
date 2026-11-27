import { afterEach, describe, expect, it } from 'vitest';
import { MAIN_ROOM_ID, mascotByKey, MASCOTS, type Message, type Topic } from '@pausa/shared';
import { getUser } from '../src/members/service';
import {
  call,
  cid,
  collect,
  emit,
  sleep,
  startTestServer,
  type TestServer,
  type ClientSocket,
} from './harness';

// Mascots answer immediately; random keyword chatter off so only moderation speaks.
const ENV = { MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' };

let s: TestServer;
afterEach(async () => {
  await s.close();
});

const fromMascot = (events: { message: Message }[]) =>
  events.map((e) => e.message).filter((m) => MASCOTS.some((x) => x.userId === m.userId));

async function topic(admin: ClientSocket, name: string): Promise<Topic> {
  const { topics } = await call(admin, 'admin:topics:list', {});
  return topics.find((t) => t.name === name)!;
}

/** Sets small thresholds on a topic so tests reach them quickly. */
async function tune(
  admin: ClientSocket,
  name: string,
  labelAt: number,
  muteAt: number,
  extra: Partial<Topic> = {},
) {
  const t = await topic(admin, name);
  const { topic: updated } = await call(admin, 'admin:topics:update', {
    topicId: t.id,
    name: t.name,
    keywords: t.keywords,
    label: t.label,
    labelAt,
    muteAt,
    muteHours: t.muteHours,
    enabled: t.enabled,
    lines: t.lines,
    ...extra,
  });
  return updated;
}

const say = (socket: ClientSocket, roomId: string, body: string) =>
  call(socket, 'messages:send', { roomId, clientId: cid(), body });

async function setup() {
  s = await startTestServer(ENV);
  const admin = await s.connect(s.user('Ana', 'host'));
  const ruiUser = s.user('Rui');
  const rui = await s.connect(ruiUser);
  const { room } = await call(admin, 'rooms:create', { name: 'Escritório' });
  await sleep(50); // the mascot's intro
  return { admin, rui, ruiUser, room };
}

describe('topics', () => {
  it('15 starter topics are seeded once, and only admins see or edit them', async () => {
    s = await startTestServer(ENV);
    const admin = await s.connect(s.user('Ana', 'host'));
    const member = await s.connect(s.user('Rui'));
    const { topics } = await call(admin, 'admin:topics:list', {});
    expect(topics).toHaveLength(15);
    expect(topics[0]).toMatchObject({
      name: 'Trabalho',
      label: 'nerd',
      labelAt: 15,
      muteAt: 30,
      muteHours: 24,
      enabled: true,
    });

    expect(await emit(member, 'admin:topics:list', {})).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });

    // Seeding again (as at every start) adds nothing.
    const { ensureTopics } = await import('../src/moderation/topics');
    ensureTopics(s.ctx.db);
    expect((await call(admin, 'admin:topics:list', {})).topics).toHaveLength(15);
  });

  it('rejects a mute threshold at or below the label threshold', async () => {
    s = await startTestServer(ENV);
    const admin = await s.connect(s.user('Ana', 'host'));
    const t = await topic(admin, 'Trabalho');
    const res = await emit(admin, 'admin:topics:update', {
      topicId: t.id,
      name: t.name,
      keywords: t.keywords,
      label: t.label,
      labelAt: 5,
      muteAt: 5,
      muteHours: 24,
      enabled: true,
      lines: t.lines,
    });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });
});

describe('strikes and labels', () => {
  it('one strike per topic per message; label at the threshold, announced as a reply', async () => {
    const { admin, rui, ruiUser, room } = await setup();
    await tune(admin, 'Trabalho', 2, 4);
    const events = collect(admin, 'message:new');
    const updates = collect(admin, 'moderation:updated');

    // Two Trabalho words in one message: still one strike.
    await say(rui, room.id, 'Mais uma reunião sobre o Jira…');
    await sleep(80);
    expect(fromMascot(events)).toHaveLength(0);
    expect((await call(admin, 'moderation:standings', { roomId: room.id })).standings).toEqual([]);

    const { message } = await say(rui, room.id, 'a reuniao foi longa'); // no accent, still counts
    await sleep(80);
    const { standings } = await call(rui, 'moderation:standings', { roomId: room.id });
    expect(standings).toEqual([
      { roomId: room.id, userId: ruiUser.id, labels: ['nerd'], mutedUntil: null, mutedTopic: null },
    ]);
    expect(updates.at(-1)?.standing.labels).toEqual(['nerd']);

    const said = fromMascot(events);
    expect(said).toHaveLength(1);
    expect(said[0]!.replyTo?.id).toBe(message.id);
    expect(said[0]!.body).toContain('nerd');
  });

  it('different topics in one message count once each', async () => {
    const { admin, rui, ruiUser, room } = await setup();
    await tune(admin, 'Trabalho', 1, 3);
    await tune(admin, 'Café', 1, 3);
    await say(rui, room.id, 'café antes da reunião');
    await sleep(80);
    const { standings } = await call(admin, 'moderation:standings', { roomId: room.id });
    expect(standings[0]).toMatchObject({ userId: ruiUser.id, labels: ['nerd', 'cafeinado'] });
  });

  it('mascots don’t count, nor rooms with the mascot off or archived', async () => {
    const { admin, rui, room } = await setup();
    await tune(admin, 'Trabalho', 1, 3);

    const lurdes = getUser(s.ctx.db, mascotByKey('lurdes').userId)!;
    s.ctx.moderator.onMessage(
      { ...(await say(admin, room.id, 'olá')).message, body: 'reunião' },
      lurdes,
    );

    await call(admin, 'rooms:update', { roomId: room.id, mascotEnabled: false });
    await say(rui, room.id, 'reunião');
    await sleep(80);
    expect((await call(admin, 'moderation:standings', { roomId: room.id })).standings).toEqual([]);
  });

  it('custom lines from the portal replace the mascot’s own', async () => {
    const { admin, rui, room } = await setup();
    await tune(admin, 'Trabalho', 1, 3, {
      lines: { warn: '', label: '{name} é {label} por causa de {topic}!', mute: '' },
    });
    const events = collect(admin, 'message:new');
    await say(rui, room.id, 'sprint');
    await sleep(80);
    expect(fromMascot(events)[0]?.body).toBe('Rui é nerd por causa de Trabalho!');
  });
});

describe('mutes', () => {
  it('warns, then mutes at the threshold: no sending or editing there, reactions and other rooms fine', async () => {
    const { admin, rui, ruiUser, room } = await setup();
    // Warning at 7 - 5 = 2.
    await tune(admin, 'Trabalho', 1, 7, { lines: { warn: 'AVISO {name}', label: '', mute: '' } });
    const events = collect(admin, 'message:new');

    const first = await say(rui, room.id, 'reunião');
    await sleep(60);
    await say(rui, room.id, 'reunião');
    await sleep(60);
    expect(fromMascot(events).at(-1)?.body).toBe('AVISO Rui');

    for (let i = 0; i < 5; i++) {
      await say(rui, room.id, 'reunião');
    }
    await sleep(80);
    const { standings } = await call(admin, 'moderation:standings', { roomId: room.id });
    expect(standings[0]).toMatchObject({ userId: ruiUser.id, mutedTopic: 'Trabalho' });
    expect(standings[0]!.mutedUntil).toBeGreaterThan(Date.now() + 23 * 3_600_000);

    expect(
      await emit(rui, 'messages:send', { roomId: room.id, clientId: cid(), body: 'olá' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'MUTED' },
    });
    expect(
      await emit(rui, 'messages:edit', { messageId: first.message.id, body: 'editado' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'MUTED' },
    });
    await call(rui, 'reactions:toggle', { messageId: first.message.id, emoji: '👍' });
    await say(rui, MAIN_ROOM_ID, 'ainda posso falar aqui');

    const { entries } = await call(admin, 'admin:log:list', {});
    expect(entries.find((e) => e.action === 'mascot.mute')).toMatchObject({
      actorId: null,
      targetId: ruiUser.id,
    });
  });

  it('never mutes in #geral, only labels', async () => {
    s = await startTestServer(ENV);
    const admin = await s.connect(s.user('Ana', 'host'));
    const ruiUser = s.user('Rui');
    const rui = await s.connect(ruiUser);
    await tune(admin, 'Trabalho', 1, 2);
    for (let i = 0; i < 4; i++) await say(rui, MAIN_ROOM_ID, 'reunião');
    await sleep(80);
    const { standings } = await call(admin, 'moderation:standings', { roomId: MAIN_ROOM_ID });
    expect(standings).toEqual([
      {
        roomId: MAIN_ROOM_ID,
        userId: ruiUser.id,
        labels: ['nerd'],
        mutedUntil: null,
        mutedTopic: null,
      },
    ]);
  });

  it('when the time is up, strikes reset and everyone hears about it', async () => {
    const { admin, rui, ruiUser, room } = await setup();
    await tune(admin, 'Trabalho', 1, 2);
    await say(rui, room.id, 'reunião');
    await say(rui, room.id, 'reunião');
    await sleep(60);
    const updates = collect(admin, 'moderation:updated');

    s.ctx.db.prepare('UPDATE mutes SET until = ?').run(Date.now() - 1);
    s.ctx.moderator.expireDue();
    await sleep(60);

    expect(updates.at(-1)?.standing).toEqual({
      roomId: room.id,
      userId: ruiUser.id,
      labels: [],
      mutedUntil: null,
      mutedTopic: null,
    });
    await say(rui, room.id, 'voltei');
  });

  it('admins lift mutes and reset strikes; members can’t; both are logged', async () => {
    const { admin, rui, ruiUser, room } = await setup();
    await tune(admin, 'Trabalho', 1, 2);
    await say(rui, room.id, 'reunião');
    await say(rui, room.id, 'reunião');
    await sleep(60);

    const { mutes, strikes } = await call(admin, 'admin:moderation:list', {});
    expect(mutes).toHaveLength(1);
    // Strikes stay at the mute threshold until the mute ends.
    expect(strikes[0]).toMatchObject({ userId: ruiUser.id, topicName: 'Trabalho', count: 2 });
    expect(await emit(rui, 'admin:moderation:lift', { muteId: mutes[0]!.id })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });

    const lifted = await call(admin, 'admin:moderation:lift', { muteId: mutes[0]!.id });
    expect(lifted.standing).toMatchObject({ mutedUntil: null, labels: [] });
    await say(rui, room.id, 'reunião'); // allowed again, strike 1 → label
    await sleep(60);
    expect((await call(admin, 'admin:moderation:list', {})).strikes[0]).toMatchObject({
      userId: ruiUser.id,
      count: 1,
    });

    const reset = await call(admin, 'admin:moderation:reset', {
      userId: ruiUser.id,
      roomId: room.id,
    });
    expect(reset.standing.labels).toEqual([]);

    const actions = (await call(admin, 'admin:log:list', {})).entries.map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['moderation.lift', 'moderation.reset', 'topic.update']),
    );
  });
});
