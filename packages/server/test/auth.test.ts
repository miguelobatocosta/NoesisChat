import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '@pausa/shared';
import { createInvite } from '../src/auth/invites';
import { clientIp } from '../src/clientIp';
import { issueHostLink } from '../src/cli/init';
import { nextEvent, startTestServer, type TestServer } from './harness';

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

function invite(opts: Parameters<typeof createInvite>[1] = { createdBy: null }) {
  return createInvite(s.ctx.db, opts);
}

describe('POST /api/join', () => {
  it('redeems a valid invite and sets a hardened session cookie', async () => {
    const { code } = invite();
    const res = await s.http('/api/join', json({ code, displayName: 'Ana' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { displayName: string; role: string } };
    expect(body.user).toMatchObject({ displayName: 'Ana', role: 'member' });

    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_-]{43};`));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure'); // plain-http localhost

    const session = await s.http('/api/session', { headers: { cookie: cookie.split(';')[0]! } });
    expect(session.status).toBe(200);
    expect(((await session.json()) as { user: { displayName: string } }).user.displayName).toBe(
      'Ana',
    );
  });

  it('never returns the token in the body', async () => {
    const { code } = invite();
    const res = await s.http('/api/join', json({ code, displayName: 'Ana' }));
    const token = res.headers.get('set-cookie')!.split(';')[0]!.split('=')[1]!;
    expect(await res.text()).not.toContain(token);
  });

  it('sets Secure when the browser is on https (tunnel)', async () => {
    s.ctx.origins.add('https://abc.trycloudflare.com');
    const { code } = invite();
    const res = await s.http('/api/join', {
      ...json({ code, displayName: 'Ana' }),
      origin: 'https://abc.trycloudflare.com',
    });
    expect(res.headers.get('set-cookie')).toContain('Secure');
  });

  it.each([
    [
      'expired',
      () => {
        const { invite: inv, code } = invite();
        s.ctx.db
          .prepare('UPDATE invites SET expires_at = ? WHERE id = ?')
          .run(Date.now() - 1, inv.id);
        return code;
      },
    ],
    [
      'revoked',
      () => {
        const { invite: inv, code } = invite();
        s.ctx.db.prepare('UPDATE invites SET revoked_at = ? WHERE id = ?').run(Date.now(), inv.id);
        return code;
      },
    ],
    ['unknown', () => 'A'.repeat(22)],
  ])('rejects a %s invite with the same generic error', async (_label, make) => {
    const res = await s.http('/api/join', json({ code: make(), displayName: 'Ana' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'INVITE_INVALID' } });
  });

  it('rejects a used (exhausted) invite', async () => {
    const { code } = invite();
    expect((await s.http('/api/join', json({ code, displayName: 'Ana' }))).status).toBe(200);
    const again = await s.http('/api/join', json({ code, displayName: 'Rui' }));
    expect(await again.json()).toMatchObject({ error: { code: 'INVITE_INVALID' } });
  });

  it('rejects a malformed code before touching the database', async () => {
    const res = await s.http('/api/join', json({ code: "' OR 1=1 --", displayName: 'Ana' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION' } });
  });

  it('rejects duplicate display names regardless of case and accents', async () => {
    expect(
      (await s.http('/api/join', json({ code: invite().code, displayName: 'José' }))).status,
    ).toBe(200);
    const res = await s.http('/api/join', json({ code: invite().code, displayName: 'jose ' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'NAME_TAKEN' } });
  });

  it('locks the name to the invite’s intended name', async () => {
    const { code } = invite({ createdBy: null, intendedName: 'Marta Silva' });
    const res = await s.http('/api/join', json({ code, displayName: 'Someone Else' }));
    expect(((await res.json()) as { user: { displayName: string } }).user.displayName).toBe(
      'Marta Silva',
    );
  });

  it('rejects a foreign Origin, and a request with no Origin or Sec-Fetch-Site', async () => {
    const { code } = invite();
    const foreign = await s.http('/api/join', {
      ...json({ code, displayName: 'Ana' }),
      origin: 'https://evil.example',
    });
    expect(foreign.status).toBe(403);
    const none = await s.http('/api/join', { ...json({ code, displayName: 'Ana' }), origin: null });
    expect(none.status).toBe(403);
  });

  it('rate-limits joins per client IP (CF-Connecting-IP trusted from loopback)', async () => {
    const attempt = (ip: string) =>
      s.http('/api/join', {
        ...json({ code: 'B'.repeat(22), displayName: 'Ana' }),
        headers: { 'cf-connecting-ip': ip, 'content-type': 'application/json' },
      });
    for (let i = 0; i < 5; i++) expect((await attempt('203.0.113.7')).status).toBe(400);
    expect((await attempt('203.0.113.7')).status).toBe(429);
    expect((await attempt('203.0.113.8')).status).toBe(400); // different client, own bucket
  });

  it('broadcasts a new member to connected users', async () => {
    const ana = s.user('Ana');
    const sock = await s.connect(ana);
    const event = nextEvent(sock, 'member:updated');
    await s.http('/api/join', json({ code: invite().code, displayName: 'Rui' }));
    expect((await event).member.displayName).toBe('Rui');
  });
});

describe('clientIp (CLAUDE.md rule 8)', () => {
  const req = (peer: string, header?: string) =>
    ({
      socket: { remoteAddress: peer },
      headers: header ? { 'cf-connecting-ip': header } : {},
    }) as unknown as IncomingMessage;

  it('uses CF-Connecting-IP only when the peer is loopback', () => {
    expect(clientIp(req('127.0.0.1', '198.51.100.1'))).toBe('198.51.100.1');
    expect(clientIp(req('::1', '198.51.100.1'))).toBe('198.51.100.1');
    expect(clientIp(req('192.168.1.20', '198.51.100.1'))).toBe('192.168.1.20');
  });
  it('ignores garbage in the header', () => {
    expect(clientIp(req('127.0.0.1', '<script>'))).toBe('127.0.0.1');
  });
});

describe('session and logout', () => {
  it('GET /api/session returns user: null without a cookie or with a bad one', async () => {
    expect(await (await s.http('/api/session')).json()).toEqual({ ok: true, user: null });
    const bad = await s.http('/api/session', {
      headers: { cookie: `${SESSION_COOKIE}=${'x'.repeat(43)}` },
    });
    expect(await bad.json()).toEqual({ ok: true, user: null });
  });

  it('logout revokes the device, clears the cookie and disconnects its sockets', async () => {
    const ana = s.user('Ana');
    const sock = await s.connect(ana);
    const revoked = nextEvent(sock, 'session:revoked');
    const res = await s.http('/api/logout', { method: 'POST', user: ana });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    await revoked;
    expect(await (await s.http('/api/session', { user: ana })).json()).toMatchObject({
      user: null,
    });
  });

  it('logout requires our Origin', async () => {
    const ana = s.user('Ana');
    expect(
      (await s.http('/api/logout', { method: 'POST', user: ana, origin: 'https://evil.example' }))
        .status,
    ).toBe(403);
    expect(await (await s.http('/api/session', { user: ana })).json()).toMatchObject({
      user: { displayName: 'Ana' },
    });
  });
});

describe('host bootstrap (pnpm server:init)', () => {
  it('first issues a host invite, then device links for the host', async () => {
    const first = issueHostLink(s.ctx.db, s.config, { name: 'Costa' });
    expect(first.kind).toBe('host-invite');
    const code = first.link!.split('#')[1]!;
    const res = await s.http('/api/join', json({ code }));
    expect(
      ((await res.json()) as { user: { role: string; displayName: string } }).user,
    ).toMatchObject({
      role: 'host',
      displayName: 'Costa',
    });

    expect(issueHostLink(s.ctx.db, s.config, { ifNeeded: true }).kind).toBe('none');
    const second = issueHostLink(s.ctx.db, s.config);
    expect(second.kind).toBe('host-device');
    const res2 = await s.http('/api/join', json({ code: second.link!.split('#')[1]! }));
    expect(((await res2.json()) as { user: { role: string } }).user.role).toBe('host');
    const hosts = s.ctx.db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'host'`).get() as {
      n: number;
    };
    expect(hosts.n).toBe(1);
  });

  it('refuses a second host', async () => {
    const a = createInvite(s.ctx.db, { createdBy: null, grantRole: 'host' });
    const b = createInvite(s.ctx.db, { createdBy: null, grantRole: 'host' });
    expect((await s.http('/api/join', json({ code: a.code, displayName: 'Costa' }))).status).toBe(
      200,
    );
    const res = await s.http('/api/join', json({ code: b.code, displayName: 'Intruso' }));
    expect(await res.json()).toMatchObject({ error: { code: 'INVITE_INVALID' } });
  });
});
