import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAIN_ROOM_ID, mentionToken, type Message } from '@pausa/shared';
import { getUser } from '../src/members/service';
import { sendMessage } from '../src/messages/service';
import {
  call,
  cid,
  collect,
  emit,
  nextEvent,
  sleep,
  startTestServer,
  type TestServer,
} from './harness';

let s: TestServer;
beforeEach(async () => {
  s = await startTestServer();
});
afterEach(async () => {
  await s.close();
});

const send = (
  sock: Awaited<ReturnType<TestServer['connect']>>,
  body: string,
  extra: Record<string, unknown> = {},
) => call(sock, 'messages:send', { roomId: MAIN_ROOM_ID, clientId: cid(), body, ...extra });

describe('two clients, end to end', () => {
  it('create room, exchange, edit, delete, react — and see each other’s events in order', async () => {
    const ana = await s.connect(s.user('Ana'));
    const rui = await s.connect(s.user('Rui'));
    const ruiNew = collect(rui, 'message:new');
    const ruiUpd = collect(rui, 'message:updated');

    const { room } = await call(ana, 'rooms:create', { name: 'Petiscos' });
    const m1 = (
      await call(ana, 'messages:send', { roomId: room.id, clientId: cid(), body: 'olá **Rui**' })
    ).message;
    const m2 = (
      await call(rui, 'messages:send', {
        roomId: room.id,
        clientId: cid(),
        body: 'olá Ana',
        replyToId: m1.id,
      })
    ).message;
    await call(ana, 'messages:edit', { messageId: m1.id, body: 'olá Rui!' });
    await call(rui, 'reactions:toggle', { messageId: m1.id, emoji: '👍' });
    await call(ana, 'messages:delete', { messageId: m1.id });
    await sleep(100);

    expect(ruiNew.map((e) => e.message.id)).toEqual([m1.id, m2.id]);
    expect(m2.replyTo).toMatchObject({
      id: m1.id,
      userId: m1.userId,
      body: 'olá **Rui**',
      deleted: false,
    });
    expect(
      ruiUpd.map((e) => [e.message.body, e.message.reactions.length, e.message.deletedAt !== null]),
    ).toEqual([
      ['olá Rui!', 0, false],
      ['olá Rui!', 1, false],
      [null, 0, true],
    ]);
    const seqs = ruiUpd.map((e) => e.message.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });
});

describe('send', () => {
  it('validates input', async () => {
    const sock = await s.connect(s.user('Ana'));
    expect(
      await emit(sock, 'messages:send', { roomId: MAIN_ROOM_ID, clientId: cid(), body: '   ' }),
    ).toMatchObject({
      error: { code: 'EMPTY_MESSAGE' },
    });
    expect(
      await emit(sock, 'messages:send', {
        roomId: MAIN_ROOM_ID,
        clientId: cid(),
        body: 'x'.repeat(4001),
      }),
    ).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(
      await emit(sock, 'messages:send', {
        roomId: '01JZZZZZZZZZZZZZZZZZZZZZZZ',
        clientId: cid(),
        body: 'x',
      }),
    ).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    expect(
      await emit(sock, 'messages:send', { roomId: MAIN_ROOM_ID, clientId: 'x', body: 'x' }),
    ).toMatchObject({
      error: { code: 'VALIDATION' },
    });
  });

  it('never trusts a client-supplied author or timestamp', async () => {
    const ana = s.user('Ana');
    const rui = s.user('Rui');
    const sock = await s.connect(ana);
    const res = await emit(sock, 'messages:send', {
      roomId: MAIN_ROOM_ID,
      clientId: cid(),
      body: 'oi',
      userId: rui.id,
      createdAt: 0,
    } as never);
    expect(res.ok && res.data.message.userId).toBe(ana.id);
    expect(res.ok && res.data.message.createdAt).toBeGreaterThan(0);
  });

  it('is idempotent on clientId (D-38)', async () => {
    const ana = await s.connect(s.user('Ana'));
    const rui = await s.connect(s.user('Rui'));
    const seen = collect(rui, 'message:new');
    const clientId = cid();
    const a = await call(ana, 'messages:send', { roomId: MAIN_ROOM_ID, clientId, body: 'uma vez' });
    const b = await call(ana, 'messages:send', { roomId: MAIN_ROOM_ID, clientId, body: 'uma vez' });
    await sleep(100);
    expect(b.message.id).toBe(a.message.id);
    expect(seen).toHaveLength(1);
  });

  it('stores mentions only for real users, and counts them as unread mentions', async () => {
    const ana = s.user('Ana');
    const rui = s.user('Rui');
    const anaSock = await s.connect(ana);
    const ruiSock = await s.connect(rui);
    const { message } = await send(
      anaSock,
      `olá ${mentionToken(rui.id)} e ${mentionToken('01JZZZZZZZZZZZZZZZZZZZZZZZ')}`,
    );
    expect(message.mentions).toEqual([rui.id]);
    const geral = (await call(ruiSock, 'rooms:list', {})).rooms[0]!;
    expect(geral).toMatchObject({ unread: 1, mentions: 1 });
    const mine = (await call(anaSock, 'rooms:list', {})).rooms[0]!;
    expect(mine).toMatchObject({ unread: 0, mentions: 0 }); // own messages never count
  });

  it('replies must target a live message in the same room', async () => {
    const sock = await s.connect(s.user('Ana'));
    const { room } = await call(sock, 'rooms:create', { name: 'Outra' });
    const other = (
      await call(sock, 'messages:send', { roomId: room.id, clientId: cid(), body: 'lá' })
    ).message;
    expect(
      await emit(sock, 'messages:send', {
        roomId: MAIN_ROOM_ID,
        clientId: cid(),
        body: 'cá',
        replyToId: other.id,
      }),
    ).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('rate-limits sends to 10 per 10s', async () => {
    const sock = await s.connect(s.user('Ana'));
    for (let i = 0; i < 10; i++) await send(sock, `m${i}`);
    expect(
      await emit(sock, 'messages:send', { roomId: MAIN_ROOM_ID, clientId: cid(), body: 'm10' }),
    ).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
  });
});

describe('edit and delete permissions', () => {
  it('only the author edits; members can’t delete others; admins can (and it is logged)', async () => {
    const ana = await s.connect(s.user('Ana'));
    const rui = await s.connect(s.user('Rui'));
    const adminUser = s.user('Admin', 'admin');
    const admin = await s.connect(adminUser);
    const { message } = await send(ana, 'meu');

    expect(await emit(rui, 'messages:edit', { messageId: message.id, body: 'teu' })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(
      await emit(admin, 'messages:edit', { messageId: message.id, body: 'teu' }),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(await emit(rui, 'messages:delete', { messageId: message.id })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });

    const deleted = (await call(admin, 'messages:delete', { messageId: message.id })).message;
    expect(deleted).toMatchObject({ body: null, reactions: [], attachments: [] });
    expect(deleted.deletedAt).not.toBeNull();
    const log = s.ctx.db
      .prepare(`SELECT * FROM admin_log WHERE action = 'message.delete'`)
      .all() as { actor_id: string }[];
    expect(log).toHaveLength(1);
    expect(log[0]!.actor_id).toBe(adminUser.id);

    // The body is really gone from the database (D-34), not just hidden.
    const row = s.ctx.db.prepare('SELECT body FROM messages WHERE id = ?').get(message.id) as {
      body: string | null;
    };
    expect(row.body).toBeNull();
    expect(
      await emit(ana, 'messages:edit', { messageId: message.id, body: 'ressuscitar' }),
    ).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('edits recompute mentions and mark edited', async () => {
    const rui = s.user('Rui');
    const ana = await s.connect(s.user('Ana'));
    const { message } = await send(ana, 'sem menção');
    const edited = (
      await call(ana, 'messages:edit', {
        messageId: message.id,
        body: `com ${mentionToken(rui.id)}`,
      })
    ).message;
    expect(edited.mentions).toEqual([rui.id]);
    expect(edited.editedAt).not.toBeNull();
    expect(edited.seq).toBeGreaterThan(message.seq);
  });
});

describe('reactions', () => {
  it('toggle on and off, grouped by emoji', async () => {
    const ana = s.user('Ana');
    const rui = s.user('Rui');
    const a = await s.connect(ana);
    const r = await s.connect(rui);
    const { message } = await send(a, 'reage');
    await call(a, 'reactions:toggle', { messageId: message.id, emoji: '😂' });
    const both = (await call(r, 'reactions:toggle', { messageId: message.id, emoji: '😂' }))
      .message;
    expect(both.reactions).toEqual([{ emoji: '😂', userIds: [ana.id, rui.id] }]);
    const off = (await call(a, 'reactions:toggle', { messageId: message.id, emoji: '😂' })).message;
    expect(off.reactions).toEqual([{ emoji: '😂', userIds: [rui.id] }]);
    expect(
      await emit(a, 'reactions:toggle', { messageId: message.id, emoji: 'lol' }),
    ).toMatchObject({ error: { code: 'VALIDATION' } });
  });
});

describe('history and sync', () => {
  /** Seeds through the service layer (the socket path is rate-limited to 10 sends per 10s). */
  async function seed(
    sock: Awaited<ReturnType<TestServer['connect']>>,
    n: number,
  ): Promise<Message[]> {
    const { members } = await call(sock, 'members:list', {});
    const actor = getUser(s.ctx.db, members[0]!.id)!;
    return Array.from(
      { length: n },
      (_, i) =>
        sendMessage(s.ctx.db, actor, {
          roomId: MAIN_ROOM_ID,
          clientId: cid(),
          body: `m${i}`,
          attachmentIds: [],
        }).message,
    );
  }

  it('pages backwards 50 at a time, oldest→newest within a page', async () => {
    const sock = await s.connect(s.user('Ana'));
    const all = await seed(sock, 120);
    const p1 = await call(sock, 'messages:history', { roomId: MAIN_ROOM_ID });
    expect(p1.messages).toHaveLength(50);
    expect(p1.hasMore).toBe(true);
    expect(p1.messages.at(-1)!.id).toBe(all.at(-1)!.id);
    const p2 = await call(sock, 'messages:history', {
      roomId: MAIN_ROOM_ID,
      before: p1.messages[0]!.id,
    });
    const p3 = await call(sock, 'messages:history', {
      roomId: MAIN_ROOM_ID,
      before: p2.messages[0]!.id,
    });
    expect(p3.messages).toHaveLength(20);
    expect(p3.hasMore).toBe(false);
    expect([...p3.messages, ...p2.messages, ...p1.messages].map((m) => m.id)).toEqual(
      all.map((m) => m.id),
    );
    expect(await emit(sock, 'messages:history', { roomId: MAIN_ROOM_ID, limit: 51 })).toMatchObject(
      { error: { code: 'VALIDATION' } },
    );
  });

  it('a client that was offline catches up on new messages, edits, deletes and reactions', async () => {
    const ana = await s.connect(s.user('Ana'));
    const ruiUser = s.user('Rui');
    const rui = await s.connect(ruiUser);
    const kept = (await send(ana, 'fica')).message;
    const doomed = (await send(ana, 'vai')).message;
    const sinceSeq = (await call(rui, 'messages:sync', { roomId: MAIN_ROOM_ID, sinceSeq: 0 }))
      .latestSeq;
    rui.disconnect();

    await call(ana, 'messages:edit', { messageId: kept.id, body: 'fica (editado)' });
    await call(ana, 'messages:delete', { messageId: doomed.id });
    await call(ana, 'reactions:toggle', { messageId: kept.id, emoji: '🎉' });
    const fresh = (await send(ana, 'novo')).message;

    const back = await s.connect(ruiUser);
    const res = await call(back, 'messages:sync', { roomId: MAIN_ROOM_ID, sinceSeq });
    expect(res.truncated).toBe(false);
    const byId = new Map(res.messages.map((m) => [m.id, m]));
    expect(byId.get(kept.id)).toMatchObject({
      body: 'fica (editado)',
      reactions: [{ emoji: '🎉' }],
    });
    expect(byId.get(doomed.id)).toMatchObject({ body: null });
    expect(byId.get(fresh.id)).toMatchObject({ body: 'novo' });
    expect(res.messages).toHaveLength(3); // each changed message once, with its latest state
    expect(res.latestSeq).toBeGreaterThan(sinceSeq);
  });

  it('flags truncation beyond 200 changes', async () => {
    const sock = await s.connect(s.user('Ana'));
    await seed(sock, 201);
    const res = await call(sock, 'messages:sync', { roomId: MAIN_ROOM_ID, sinceSeq: 0 });
    expect(res).toMatchObject({ truncated: true, messages: [] });
  });
});

describe('read state, typing', () => {
  it('read:mark moves forward only and clears unread', async () => {
    const ana = await s.connect(s.user('Ana'));
    const rui = await s.connect(s.user('Rui'));
    const m1 = (await send(ana, 'um')).message;
    const m2 = (await send(ana, 'dois')).message;
    expect((await call(rui, 'rooms:list', {})).rooms[0]!.unread).toBe(2);
    await call(rui, 'read:mark', { roomId: MAIN_ROOM_ID, messageId: m2.id });
    const back = await call(rui, 'read:mark', { roomId: MAIN_ROOM_ID, messageId: m1.id });
    expect(back.lastReadId).toBe(m2.id);
    expect((await call(rui, 'rooms:list', {})).rooms[0]!.unread).toBe(0);
  });

  it('newcomers start with existing history read', async () => {
    const ana = await s.connect(s.user('Ana'));
    await send(ana, 'antigo');
    const late = await s.connect(s.user('Tardio'));
    expect((await call(late, 'rooms:list', {})).rooms[0]!.unread).toBe(0);
  });

  it('typing reaches others, not the sender, and is throttled', async () => {
    const anaUser = s.user('Ana');
    const ana = await s.connect(anaUser);
    const rui = await s.connect(s.user('Rui'));
    const selfSeen = collect(ana, 'typing');
    const got = nextEvent(rui, 'typing');
    await call(ana, 'typing', { roomId: MAIN_ROOM_ID });
    expect(await got).toEqual({ roomId: MAIN_ROOM_ID, userId: anaUser.id });
    expect(await emit(ana, 'typing', { roomId: MAIN_ROOM_ID })).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
    await sleep(50);
    expect(selfSeen).toEqual([]);
  });
});
