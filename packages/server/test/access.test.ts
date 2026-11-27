import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE, type SessionResponse, type SessionState } from '@pausa/shared';
import { AccessVerifier } from '../src/auth/access';

import { startTestServer, type TestServer } from './harness';

const TEAM = 'pausa-test.cloudflareaccess.com';
const AUD = 'a1'.repeat(32);
const ENV = {
  ACCESS_TEAM_DOMAIN: TEAM,
  ACCESS_AUD: AUD,
  ACCESS_EMAIL_DOMAIN: 'noesis.pt',
  OWNER_EMAIL: 'chefe@noesis.pt',
};

const pair = () => generateKeyPairSync('rsa', { modulusLength: 2048 });
const good = pair();
const evil = pair();
const jwks = async () => [{ ...good.publicKey.export({ format: 'jwk' }), kid: 'k1' }];

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
function token(
  claims: Record<string, unknown> = {},
  opts: { key?: KeyObject; header?: Record<string, unknown> } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT', ...opts.header });
  const p = b64({
    aud: [AUD],
    iss: `https://${TEAM}`,
    email: 'ana@noesis.pt',
    iat: now,
    nbf: now,
    exp: now + 3600,
    ...claims,
  });
  const sig = sign('RSA-SHA256', Buffer.from(`${h}.${p}`), opts.key ?? good.privateKey);
  return `${h}.${p}.${sig.toString('base64url')}`;
}

describe('AccessVerifier', () => {
  const settings = { teamDomain: TEAM, aud: AUD, emailDomain: 'noesis.pt', ownerEmail: null };
  const v = new AccessVerifier(settings, jwks);
  const now = Math.floor(Date.now() / 1000);

  it('accepts a valid token and lower-cases the email', async () => {
    expect(await v.email(token({ email: 'Ana@Noesis.PT' }))).toBe('ana@noesis.pt');
    expect(await v.email(token({ aud: AUD }))).toBe('ana@noesis.pt'); // aud as a string
  });

  it('tolerates a minute of clock drift, not more', async () => {
    expect(await v.email(token({ iat: now + 30, nbf: now + 30 }))).toBe('ana@noesis.pt');
    expect(await v.email(token({ exp: now - 30 }))).toBe('ana@noesis.pt');
    expect(await v.email(token({ exp: now - 120 }))).toBeNull();
    expect(await v.email(token({ nbf: now + 300 }))).toBeNull();
  });

  it('rejects forgeries and wrong tokens', async () => {
    const [h, p] = token().split('.');
    for (const bad of [
      token({}, { key: evil.privateKey }), // someone else's key
      token({ aud: ['other'] }),
      token({ iss: 'https://evil.cloudflareaccess.com' }),
      token({ email: 'ana@gmail.com' }), // off-domain
      token({ email: 'not-an-email' }),
      token({}, { header: { kid: 'unknown' } }),
      token({}, { header: { alg: 'HS256' } }),
      `${b64({ alg: 'none', kid: 'k1' })}.${p}.`, // unsigned
      `${h}.${p}.AAAA`,
      'garbage',
      undefined,
      '',
    ]) {
      expect(await v.email(bad)).toBeNull();
    }
  });

  it('keeps working (null) when the keys can’t be fetched', async () => {
    const offline = new AccessVerifier(settings, async () => {
      throw new Error('offline');
    });
    expect(await offline.email(token())).toBeNull();
  });
});

describe('signing in with the Access email', () => {
  let s: TestServer;
  afterEach(async () => {
    await s.close();
  });

  const session = async (jwt?: string, cookie?: string) => {
    const headers: Record<string, string> = {};
    if (jwt) headers['cf-access-jwt-assertion'] = jwt;
    if (cookie) headers['cookie'] = cookie;
    return (await (await s.http('/api/session', { headers })).json()) as SessionState;
  };
  const post = (
    path: string,
    jwt: string | undefined,
    body: unknown = {},
    origin?: string | null,
  ) =>
    s.http(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(jwt ? { 'cf-access-jwt-assertion': jwt } : {}),
      },
      body: JSON.stringify(body),
      ...(origin !== undefined ? { origin } : {}),
    });
  const cookieOf = (res: Response) =>
    (res.headers.get('set-cookie') ?? '').split(';')[0]!.startsWith(`${SESSION_COOKIE}=`)
      ? res.headers.get('set-cookie')!.split(';')[0]!
      : null;

  it('a new colleague: status "new", joins as a member with their email, then signs in on another browser', async () => {
    s = await startTestServer(ENV, { accessKeys: jwks });
    const jwt = token({ email: 'rita@noesis.pt' });
    expect((await session(jwt)).access).toEqual({ email: 'rita@noesis.pt', status: 'new' });

    const joined = await post('/api/access/join', jwt, { displayName: 'Rita' });
    expect(joined.status).toBe(200);
    expect(((await joined.json()) as SessionResponse).user).toMatchObject({
      displayName: 'Rita',
      role: 'member',
    });
    expect(cookieOf(joined)).not.toBeNull();

    expect((await session(jwt)).access?.status).toBe('registered');
    const again = await post('/api/access/signin', jwt);
    expect(again.status).toBe(200);
    const cookie = cookieOf(again)!;
    expect((await session(undefined, cookie)).user?.displayName).toBe('Rita');

    // Joining twice with the same email is refused.
    expect((await post('/api/access/join', jwt, { displayName: 'Rita 2' })).status).toBe(403);
  });

  it('the owner email attaches to the existing host; nobody else becomes admin', async () => {
    s = await startTestServer(ENV, { accessKeys: jwks });
    const host = s.user('Costa', 'host');
    const owner = token({ email: 'chefe@noesis.pt' });
    expect((await session(owner)).access?.status).toBe('registered');

    const res = await post('/api/access/signin', owner);
    expect(((await res.json()) as SessionResponse).user).toMatchObject({
      id: host.id,
      role: 'host',
    });

    const other = await post('/api/access/join', token({ email: 'rui@noesis.pt' }), {
      displayName: 'Rui',
    });
    expect(((await other.json()) as SessionResponse).user.role).toBe('member');
  });

  it('the owner email creates the host when there is none', async () => {
    s = await startTestServer(ENV, { accessKeys: jwks });
    const res = await post('/api/access/join', token({ email: 'chefe@noesis.pt' }), {
      displayName: 'Costa',
    });
    expect(((await res.json()) as SessionResponse).user.role).toBe('host');
  });

  it('an invite account picks up its email on the next visit; a taken email isn’t stolen', async () => {
    s = await startTestServer(ENV, { accessKeys: jwks });
    const ana = s.user('Ana');
    const jwt = token({ email: 'ana@noesis.pt' });
    expect((await session(jwt, ana.cookie)).user?.displayName).toBe('Ana');
    expect((await session(jwt)).access?.status).toBe('registered');

    // Rui (invite account) visiting with Ana's email doesn't take it over.
    const rui = s.user('Rui');
    await session(jwt, rui.cookie);
    const signin = await post('/api/access/signin', jwt);
    expect(((await signin.json()) as SessionResponse).user.id).toBe(ana.id);

    // A member visiting with the owner email doesn't become the owner.
    await session(token({ email: 'chefe@noesis.pt' }), rui.cookie);
    const row = s.ctx.db.prepare('SELECT email FROM users WHERE id = ?').get(rui.id) as {
      email: string | null;
    };
    expect(row.email).toBeNull();
  });

  it('revoked people stay out', async () => {
    s = await startTestServer(ENV, { accessKeys: jwks });
    const jwt = token({ email: 'rita@noesis.pt' });
    const joined = (await (
      await post('/api/access/join', jwt, { displayName: 'Rita' })
    ).json()) as SessionResponse;
    s.ctx.db
      .prepare('UPDATE users SET revoked_at = ? WHERE id = ?')
      .run(Date.now(), joined.user.id);

    expect((await session(jwt)).access?.status).toBe('revoked');
    expect((await post('/api/access/signin', jwt)).status).toBe(403);
    expect((await post('/api/access/join', jwt, { displayName: 'Rita outra' })).status).toBe(403);
  });

  it('needs a valid token and our Origin', async () => {
    s = await startTestServer(ENV, { accessKeys: jwks });
    expect((await post('/api/access/signin', undefined)).status).toBe(401);
    expect((await post('/api/access/signin', token({}, { key: evil.privateKey }))).status).toBe(
      401,
    );
    expect((await post('/api/access/join', token(), { displayName: 'X' }, null)).status).toBe(403);
    expect((await session('forged.header.value')).access).toBeUndefined();
  });

  it('switched off without configuration: invites only, as before', async () => {
    s = await startTestServer({}, { accessKeys: jwks });
    expect((await session(token())).access).toBeUndefined();
    expect((await post('/api/access/signin', token())).status).toBe(401);
  });
});
