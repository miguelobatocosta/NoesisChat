import { createPublicKey, type JsonWebKey, type KeyObject, verify } from 'node:crypto';
import type { Config } from '../config';

/**
 * Cloudflare Access sign-in (D-52). Access puts a signed JWT in `Cf-Access-Jwt-Assertion` on every
 * request behind the gate. We verify it ourselves (RS256 against the team's published keys), so a
 * forged email header, or a request on a bypassed path like /join, proves nothing.
 * The token is never logged.
 */
export const ACCESS_HEADER = 'cf-access-jwt-assertion';

/** Clock leeway: the host PC's clock has drifted before (the "Forbidden" of 2026-11-27). */
const LEEWAY_S = 60;
const KEYS_TTL_MS = 60 * 60_000;
const REFETCH_MIN_MS = 60_000;

export type FetchKeys = (teamDomain: string) => Promise<(JsonWebKey & { kid?: string })[]>;

/** The only network call Pausa makes to a third party: the Access team's public signing keys. */
export const fetchCloudflareKeys: FetchKeys = async (teamDomain) => {
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Access certs: HTTP ${res.status}`);
  const body = (await res.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
  return body.keys ?? [];
};

const b64url = (s: string) => Buffer.from(s, 'base64url');
const parseJson = (s: string): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(b64url(s).toString('utf8'));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export class AccessVerifier {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly settings: NonNullable<Config['access']>,
    private readonly fetchKeys: FetchKeys = fetchCloudflareKeys,
    private readonly now: () => number = Date.now,
  ) {}

  /** The verified, lower-cased email, or null for anything missing, invalid or off-domain. */
  async email(token: string | string[] | undefined): Promise<string | null> {
    if (typeof token !== 'string' || token.length > 8192) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts as [string, string, string];
    const header = parseJson(h);
    const claims = parseJson(p);
    if (!header || !claims) return null;
    // Only RS256: refuses "none", HS256 key confusion and anything else.
    if (header['alg'] !== 'RS256' || typeof header['kid'] !== 'string') return null;

    const key = await this.key(header['kid']);
    if (!key) return null;
    const signed = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, b64url(sig));
    if (!signed) return null;

    const now = this.now() / 1000;
    const aud = claims['aud'];
    const audOk = Array.isArray(aud) ? aud.includes(this.settings.aud) : aud === this.settings.aud;
    if (!audOk) return null;
    if (claims['iss'] !== `https://${this.settings.teamDomain}`) return null;
    if (typeof claims['exp'] !== 'number' || claims['exp'] + LEEWAY_S < now) return null;
    if (typeof claims['nbf'] === 'number' && claims['nbf'] - LEEWAY_S > now) return null;
    if (typeof claims['iat'] === 'number' && claims['iat'] - LEEWAY_S > now) return null;

    const email = typeof claims['email'] === 'string' ? claims['email'].trim().toLowerCase() : '';
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return null;
    const domain = this.settings.emailDomain;
    if (domain && !email.endsWith(`@${domain}`)) return null;
    return email;
  }

  private async key(kid: string): Promise<KeyObject | null> {
    const stale = this.now() - this.fetchedAt > KEYS_TTL_MS;
    const unknownKid = !this.keys.has(kid) && this.now() - this.fetchedAt > REFETCH_MIN_MS;
    if (stale || unknownKid) await this.refresh();
    return this.keys.get(kid) ?? null;
  }

  private refresh(): Promise<void> {
    this.inflight ??= this.fetchKeys(this.settings.teamDomain)
      .then((jwks) => {
        const next = new Map<string, KeyObject>();
        for (const jwk of jwks) {
          if (!jwk.kid || jwk.kty !== 'RSA') continue;
          try {
            next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
          } catch {
            /* skip malformed keys */
          }
        }
        if (next.size > 0) this.keys = next;
      })
      .catch(() => {
        /* keep the old keys; sign-in by email waits, invites still work */
      })
      .finally(() => {
        this.fetchedAt = this.now();
        this.inflight = null;
      });
    return this.inflight;
  }
}
