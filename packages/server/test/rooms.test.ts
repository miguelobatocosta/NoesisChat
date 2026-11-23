import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAIN_ROOM_ID } from '@pausa/shared';
import { call, cid, emit, nextEvent, startTestServer, type TestServer } from './harness';

let s: TestServer;
beforeEach(async () => {
  s = await startTestServer();
});
afterEach(async () => {
  await s.close();
});

describe('rooms', () => {
  it('lists #geral first, protected', async () => {
    const sock = await s.connect(s.user('Ana'));
    await call(sock, 'rooms:create', { name: 'Aaa' });
    const { rooms } = await call(sock, 'rooms:list', {});
    expect(rooms[0]).toMatchObject({
      id: MAIN_ROOM_ID,
      slug: 'geral',
      isMain: true,
      unread: 0,
      notify: 'mentions',
    });
    expect(rooms.map((r) => r.slug)).toEqual(['geral', 'aaa']);
  });

  it('a new room appears live for everyone else', async () => {
    const ana = await s.connect(s.user('Ana'));
    const rui = await s.connect(s.user('Rui'));
    const created = nextEvent(rui, 'room:created');
    const { room } = await call(ana, 'rooms:create', {
      name: 'Futebol',
      emoji: '⚽',
      description: 'Bola',
    });
    expect(room).toMatchObject({ slug: 'futebol', emoji: '⚽', unread: 0 });
    expect((await created).room).toMatchObject({ id: room.id, name: 'Futebol' });
    expect((await created).room).not.toHaveProperty('unread');
  });

  it('rejects slug collisions and names without letters or numbers', async () => {
    const sock = await s.connect(s.user('Ana'));
    await call(sock, 'rooms:create', { name: 'Comida' });
    expect(await emit(sock, 'rooms:create', { name: 'comida!' })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_EXISTS' },
    });
    expect(await emit(sock, 'rooms:create', { name: 'Geral' })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_EXISTS' },
    });
    expect(await emit(sock, 'rooms:create', { name: '🍕🍕' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
  });

  it('limits room creation to 5 per hour per device', async () => {
    const sock = await s.connect(s.user('Ana'));
    for (let i = 1; i <= 5; i++) await call(sock, 'rooms:create', { name: `Sala ${i}` });
    expect(await emit(sock, 'rooms:create', { name: 'Sala 6' })).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
  });
});

describe('room permission matrix', () => {
  async function setup() {
    const host = await s.connect(s.user('Costa', 'host'));
    const admin = await s.connect(s.user('Admin', 'admin'));
    const creator = await s.connect(s.user('Criadora'));
    const other = await s.connect(s.user('Outro'));
    const { room } = await call(creator, 'rooms:create', { name: 'Futebol' });
    return { host, admin, creator, other, room };
  }

  it('rename: creator, admin and host yes; another member no', async () => {
    const { host, admin, creator, other, room } = await setup();
    expect(await emit(other, 'rooms:update', { roomId: room.id, name: 'Hack' })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(
      (await call(creator, 'rooms:update', { roomId: room.id, name: 'Futebol PT' })).room.slug,
    ).toBe('futebol-pt');
    expect(
      (await call(admin, 'rooms:update', { roomId: room.id, description: 'Só bola' })).room
        .description,
    ).toBe('Só bola');
    expect((await call(host, 'rooms:update', { roomId: room.id, emoji: '⚽' })).room.emoji).toBe(
      '⚽',
    );
  });

  it('#geral: only the host renames it; nobody archives or hides it', async () => {
    const { host, admin } = await setup();
    expect(
      await emit(admin, 'rooms:update', { roomId: MAIN_ROOM_ID, name: 'Outra' }),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(
      (await call(host, 'rooms:update', { roomId: MAIN_ROOM_ID, name: 'Geral' })).room.name,
    ).toBe('Geral');
    expect(
      await emit(host, 'rooms:archive', { roomId: MAIN_ROOM_ID, archived: true }),
    ).toMatchObject({
      error: { code: 'MAIN_ROOM_PROTECTED' },
    });
    expect(await emit(admin, 'prefs:update', { roomId: MAIN_ROOM_ID, hidden: true })).toMatchObject(
      {
        error: { code: 'MAIN_ROOM_PROTECTED' },
      },
    );
  });

  it('archive: creator/admin yes, other no; archived rooms are read-only and broadcast', async () => {
    const { admin, creator, other, room } = await setup();
    await call(creator, 'messages:send', { roomId: room.id, clientId: cid(), body: 'antes' });
    expect(await emit(other, 'rooms:archive', { roomId: room.id, archived: true })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });

    const updated = nextEvent(other, 'room:updated');
    await call(admin, 'rooms:archive', { roomId: room.id, archived: true });
    expect((await updated).room.archivedAt).not.toBeNull();

    expect(
      await emit(creator, 'messages:send', { roomId: room.id, clientId: cid(), body: 'depois' }),
    ).toMatchObject({
      error: { code: 'ROOM_ARCHIVED' },
    });
    expect((await call(other, 'messages:history', { roomId: room.id })).messages).toHaveLength(1); // still readable

    await call(creator, 'rooms:archive', { roomId: room.id, archived: false });
    await call(creator, 'messages:send', { roomId: room.id, clientId: cid(), body: 'de volta' });
  });

  it('prefs: notify level and hide are personal', async () => {
    const { creator, other, room } = await setup();
    expect(
      await call(other, 'prefs:update', { roomId: room.id, notify: 'all', hidden: true }),
    ).toEqual({
      roomId: room.id,
      notify: 'all',
      hidden: true,
    });
    const mine = (await call(other, 'rooms:list', {})).rooms.find((r) => r.id === room.id)!;
    const theirs = (await call(creator, 'rooms:list', {})).rooms.find((r) => r.id === room.id)!;
    expect(mine).toMatchObject({ notify: 'all', hidden: true });
    expect(theirs).toMatchObject({ notify: 'mentions', hidden: false });
  });
});
