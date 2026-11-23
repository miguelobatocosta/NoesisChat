import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { call, emit, nextEvent, startTestServer, type TestServer } from './harness';

let s: TestServer;
beforeEach(async () => {
  s = await startTestServer();
});
afterEach(async () => {
  await s.close();
});

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('invites', () => {
  it('members cannot create, list or revoke invites', async () => {
    const sock = await s.connect(s.user('Ana'));
    expect(await emit(sock, 'admin:invites:create', { expiresIn: '24h' })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(await emit(sock, 'admin:invites:list', {})).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(await emit(sock, 'admin:log:list', {})).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('admin creates a link that works once, lists it with its redemption, and can revoke', async () => {
    const admin = await s.connect(s.user('Admin', 'admin'));
    const { invite, link } = await call(admin, 'admin:invites:create', {
      intendedName: 'Marta',
      expiresIn: '7d',
    });
    expect(link).toMatch(new RegExp(`^${s.origin}/join#[A-Za-z0-9_-]{22}$`));
    expect(invite).toMatchObject({ intendedName: 'Marta', status: 'active', uses: 0 });

    const code = link.split('#')[1]!;
    expect((await s.http('/api/join', json({ code }))).status).toBe(200);
    const { invites } = await call(admin, 'admin:invites:list', {});
    expect(invites[0]).toMatchObject({
      status: 'used',
      uses: 1,
      redemptions: [{ displayName: 'Marta' }],
    });

    const second = await call(admin, 'admin:invites:create', { expiresIn: '24h' });
    await call(admin, 'admin:invites:revoke', { inviteId: second.invite.id });
    const res = await s.http(
      '/api/join',
      json({ code: second.link.split('#')[1]!, displayName: 'Rui' }),
    );
    expect(await res.json()).toMatchObject({ error: { code: 'INVITE_INVALID' } });
  });

  it('uses PUBLIC_URL for links when set', async () => {
    await s.close();
    s = await startTestServer({ PUBLIC_URL: 'https://pausa-demo.trycloudflare.com' });
    const admin = await s.connect(s.user('Admin', 'admin'));
    const { link } = await call(admin, 'admin:invites:create', { expiresIn: '24h' });
    expect(link.startsWith('https://pausa-demo.trycloudflare.com/join#')).toBe(true);
  });
});

describe('member management', () => {
  it('only the host revokes admins; nobody revokes the host or themselves', async () => {
    const hostUser = s.user('Costa', 'host');
    const adminUser = s.user('Admin', 'admin');
    const admin2 = s.user('Admin Dois', 'admin');
    const host = await s.connect(hostUser);
    const admin = await s.connect(adminUser);
    expect(await emit(admin, 'admin:members:revoke', { userId: admin2.id })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(await emit(admin, 'admin:members:revoke', { userId: hostUser.id })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(await emit(admin, 'admin:members:revoke', { userId: adminUser.id })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect((await call(host, 'admin:members:revoke', { userId: admin2.id })).member.id).toBe(
      admin2.id,
    );
  });

  it('roles: only the host promotes; the new role applies on the very next event', async () => {
    const host = await s.connect(s.user('Costa', 'host'));
    const adminSock = await s.connect(s.user('Admin', 'admin'));
    const ruiUser = s.user('Rui');
    const rui = await s.connect(ruiUser);
    expect(
      await emit(adminSock, 'admin:members:setRole', { userId: ruiUser.id, role: 'admin' }),
    ).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(await emit(rui, 'admin:invites:create', { expiresIn: '24h' })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });

    const updated = nextEvent(rui, 'member:updated');
    await call(host, 'admin:members:setRole', { userId: ruiUser.id, role: 'admin' });
    expect((await updated).member).toMatchObject({ id: ruiUser.id, role: 'admin' });
    expect((await emit(rui, 'admin:invites:create', { expiresIn: '24h' })).ok).toBe(true); // same socket, fresh role

    await call(host, 'admin:members:setRole', { userId: ruiUser.id, role: 'member' });
    expect(await emit(rui, 'admin:invites:create', { expiresIn: '24h' })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
  });

  it('every admin action lands in the log, newest first', async () => {
    const host = await s.connect(s.user('Costa', 'host'));
    const rui = s.user('Rui');
    const { invite } = await call(host, 'admin:invites:create', { expiresIn: '24h' });
    await call(host, 'admin:invites:revoke', { inviteId: invite.id });
    await call(host, 'admin:members:setRole', { userId: rui.id, role: 'admin' });
    await call(host, 'admin:members:revoke', { userId: rui.id });
    const { entries } = await call(host, 'admin:log:list', {});
    expect(entries.map((e) => e.action)).toEqual([
      'member.revoke',
      'member.role',
      'invite.revoke',
      'invite.create',
    ]);
    expect(entries[0]).toMatchObject({ actorName: 'Costa', targetId: rui.id });
  });
});
