import { afterEach, describe, expect, it } from 'vitest';
import { MAIN_ROOM_ID } from '@pausa/shared';
import { ftsQuery } from '../src/messages/search';
import { call, cid, emit, startTestServer, type ClientSocket, type TestServer } from './harness';

let s: TestServer;
afterEach(async () => {
  await s.close();
});

const say = async (socket: ClientSocket, body: string, roomId = MAIN_ROOM_ID) =>
  (await call(socket, 'messages:send', { roomId, clientId: cid(), body })).message;
const find = async (
  socket: ClientSocket,
  query: string,
  extra: { roomId?: string; userId?: string } = {},
) => (await call(socket, 'search:messages', { query, ...extra })).messages.map((m) => m.body);

describe('search', () => {
  it('ignores accents and case, matches word prefixes, newest first', async () => {
    s = await startTestServer({ MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' });
    const ana = await s.connect(s.user('Ana'));
    await say(ana, 'Quem quer um Café?');
    await say(ana, 'a reunião de hoje');
    await say(ana, 'mais um cafe, por favor');

    expect(await find(ana, 'cafe')).toEqual(['mais um cafe, por favor', 'Quem quer um Café?']);
    expect(await find(ana, 'CAFÉ')).toHaveLength(2);
    expect(await find(ana, 'reuni')).toEqual(['a reunião de hoje']);
    expect(await find(ana, 'cafe favor')).toEqual(['mais um cafe, por favor']); // all words must match
  });

  it('filters by room and by person', async () => {
    s = await startTestServer({ MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' });
    const anaUser = s.user('Ana');
    const ana = await s.connect(anaUser);
    const rui = await s.connect(s.user('Rui'));
    const { room } = await call(ana, 'rooms:create', { name: 'Petiscos' });
    await say(ana, 'bifana no geral');
    await say(rui, 'bifana na sala', room.id);

    expect(await find(ana, 'bifana', { roomId: room.id })).toEqual(['bifana na sala']);
    expect(await find(ana, 'bifana', { userId: anaUser.id })).toEqual(['bifana no geral']);
  });

  it('follows edits and deletes', async () => {
    s = await startTestServer({ MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' });
    const ana = await s.connect(s.user('Ana'));
    const edited = await say(ana, 'texto antigo');
    const gone = await say(ana, 'mensagem secreta');
    await call(ana, 'messages:edit', { messageId: edited.id, body: 'texto novo' });
    await call(ana, 'messages:delete', { messageId: gone.id });

    expect(await find(ana, 'antigo')).toEqual([]);
    expect(await find(ana, 'novo')).toEqual(['texto novo']);
    expect(await find(ana, 'secreta')).toEqual([]);
  });

  it('archived rooms stay searchable', async () => {
    s = await startTestServer({ MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' });
    const ana = await s.connect(s.user('Ana'));
    const { room } = await call(ana, 'rooms:create', { name: 'Antiga' });
    await say(ana, 'memórias boas', room.id);
    await call(ana, 'rooms:archive', { roomId: room.id, archived: true });
    expect(await find(ana, 'memorias')).toEqual(['memórias boas']);
  });

  it('FTS syntax in the query is harmless; too-short queries are rejected', async () => {
    s = await startTestServer({ MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' });
    const ana = await s.connect(s.user('Ana'));
    await say(ana, 'ola mundo');
    for (const q of ['"ola', 'ola*', 'ola OR mundo', 'NEAR(ola)', '-- ola', '()^:']) {
      expect((await emit(ana, 'search:messages', { query: q })).ok).toBe(true);
    }
    expect(await emit(ana, 'search:messages', { query: 'a' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
  });

  it('builds quoted prefix terms', () => {
    expect(ftsQuery('Café "OR" reuni*')).toBe('"Café"* "OR"* "reuni"*');
    expect(ftsQuery('--- ()')).toBeNull();
  });
});
