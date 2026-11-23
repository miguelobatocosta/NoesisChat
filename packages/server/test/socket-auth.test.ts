import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAIN_ROOM_ID } from '@pausa/shared';
import { revokeDevice } from '../src/auth/sessions';
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

function connectError(sock: ReturnType<TestServer['socket']>): Promise<Error> {
  return new Promise((resolve, reject) => {
    sock.once('connect', () => reject(new Error('should not connect')));
    sock.once('connect_error', resolve);
  });
}

describe('socket handshake', () => {
  it('rejects a socket with no cookie', async () => {
    const err = await connectError(s.socket(null));
    expect(err.message).toBe('UNAUTHORIZED');
  });

  it('rejects a revoked device', async () => {
    const ana = s.user('Ana');
    revokeDevice(s.ctx.db, ana.deviceId);
    expect((await connectError(s.socket(ana))).message).toBe('UNAUTHORIZED');
  });

  it('rejects a foreign Origin before authentication (cross-site WebSocket hijacking)', async () => {
    const ana = s.user('Ana');
    const err = await connectError(s.socket(ana, { origin: 'https://evil.example' }));
    expect(err.message).not.toBe('UNAUTHORIZED'); // refused at the transport, never reached auth
  });

  it('a client with the URL but no session receives nothing (forwarded-link scenario)', async () => {
    const ana = s.user('Ana');
    const sock = await s.connect(ana);
    const outsider = s.socket(null);
    const seen = collect(outsider, 'message:new');
    const roomsSeen = collect(outsider, 'room:created');
    await connectError(outsider).catch(() => undefined);
    await call(sock, 'messages:send', { roomId: MAIN_ROOM_ID, clientId: cid(), body: 'segredo' });
    await call(sock, 'rooms:create', { name: 'Privado' });
    await sleep(150);
    expect(seen).toEqual([]);
    expect(roomsSeen).toEqual([]);
    expect(outsider.connected).toBe(false);
  });

  it('an unacknowledged event is ignored, a malformed payload gets VALIDATION', async () => {
    const sock = await s.connect(s.user('Ana'));
    (sock.emit as (n: string, p: unknown) => void)('rooms:list', {}); // no ack: no crash, no reply
    const res = await emit(sock, 'messages:history', { roomId: 'not-an-id' });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });
});

describe('revocation', () => {
  it('a revoked member is told and disconnected within 2s, and cannot reconnect', async () => {
    const host = s.user('Costa', 'host');
    const rui = s.user('Rui');
    const hostSock = await s.connect(host);
    const ruiSock = await s.connect(rui);

    const started = Date.now();
    const told = nextEvent(ruiSock, 'session:revoked');
    const gone = new Promise<void>((resolve) => ruiSock.once('disconnect', () => resolve()));
    await call(hostSock, 'admin:members:revoke', { userId: rui.id });
    await told;
    await gone;
    expect(Date.now() - started).toBeLessThan(2000);

    expect((await connectError(s.socket(rui))).message).toBe('UNAUTHORIZED');
    expect((await s.http('/api/session', { user: rui })).status).toBe(401);
  });

  it('presence: online on connect, offline after the last socket closes', async () => {
    const ana = s.user('Ana');
    const rui = s.user('Rui');
    const anaSock = await s.connect(ana);
    const online = nextEvent(anaSock, 'presence');
    const ruiSock = await s.connect(rui);
    expect(await online).toEqual({ userId: rui.id, online: true });
    const members = await call(anaSock, 'members:list', {});
    expect(members.members.find((m) => m.id === rui.id)?.online).toBe(true);
    const offline = nextEvent(anaSock, 'presence');
    ruiSock.disconnect();
    expect(await offline).toEqual({ userId: rui.id, online: false });
  });
});
