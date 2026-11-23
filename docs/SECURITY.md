# SECURITY.md — threat model and evidence

Scope: Pausa v0.1 (web demo), one Node server on the host PC, reachable through a Cloudflare quick
tunnel with an email gate. Reviewed 2026-11-23 against SPEC §7 and CLAUDE.md rules 1–10.
`pnpm audit`: no known vulnerabilities on that date.

## What we protect

Colleagues' messages, images, names and sessions; the host PC itself; and the employer's trust (the
app carries Noesis colours).

## Threats and mitigations

| # | Threat | Mitigation | Evidence |
|---|---|---|---|
| 1 | **Leaked URL** (someone forwards the tunnel link) | Cloudflare email gate (`--allowed-mail`) before the app; inside, nothing without a session cookie | `scripts/demo.mjs`; `socket-auth.test.ts` › "a client with the URL but no session receives nothing"; `uploads.test.ts` › files need a session |
| 2 | **Leaked invite** | 128-bit code, stored as SHA-256, single use, expires (24 h/7 d), revocable; code travels in the URL fragment so it never reaches server or proxy logs; generic error for every invite failure | `auth/invites.ts`; `auth.test.ts` › expired/revoked/unknown/used/malformed invites; `admin.test.ts` › revoke |
| 3 | **Brute-forcing invites** | 2¹²⁸ space plus 5 joins/min per client IP; the real client IP comes from `CF-Connecting-IP`, trusted only from loopback | `auth/routes.ts`, `clientIp.ts`; `auth.test.ts` › rate limit and clientIp tests |
| 4 | **Stolen or copied session** | 256-bit token in an `HttpOnly; SameSite=Strict; Secure` cookie, never readable by JS, never in a body, URL or log; hash-only storage; per-device revocation (logout) and per-member revocation, effective within 2 s | `auth/tokens.ts`; `auth.test.ts` › cookie flags, "never returns the token in the body", logout; `socket-auth.test.ts` › revoked within 2 s |
| 5 | **Cross-site requests / WebSocket hijacking** (a malicious page using the victim's cookie) | SameSite=Strict + `Origin` must equal PUBLIC_URL (or localhost) on every POST and every socket handshake; missing Origin only accepted with `Sec-Fetch-Site: same-origin` | `auth/origin.ts`; `auth.test.ts` › foreign/missing Origin; `socket-auth.test.ts` › foreign Origin refused before auth |
| 6 | **Malicious member: XSS** | Messages render to React elements from a small markdown subset; no `dangerouslySetInnerHTML` (lint-enforced); links only http(s) with `noopener noreferrer`; strict CSP with no inline script | `lib/markdown.tsx`; `markdown.test.tsx` › XSS payloads; `security.ts`; `health.test.ts` › CSP; E2E › no CSP violations |
| 7 | **Malicious member: privilege escalation** | Roles re-read from the DB on every event (never trusted from the client or the socket's past); zod strips unknown fields such as `userId`/`createdAt` | `realtime/index.ts` registerHandler; `admin.test.ts` › role matrix; `messages.test.ts` › "never trusts a client-supplied author" |
| 8 | **Malicious member: flooding** | Per-device rate limits (send 10/10 s, typing 1/2 s, rooms 5/h, uploads 30/10 min, 60/10 s other); payload caps (4,000-char messages, 64 KB socket frames, 4 KB join body, 10 MB images, 20 distinct reactions/message) | `rateLimit.ts`; `rooms.test.ts`, `messages.test.ts` › rate limits |
| 9 | **Malicious upload** | Type decided by magic bytes (PNG/JPEG/GIF/WebP only; SVG and everything else refused); random file names; served with exact MIME, `nosniff`, behind the session; unsent uploads private to the uploader; orphans purged after 24 h | `uploads/`; `uploads.test.ts` › exe-named-png, SVG, size, cross-user attach, cleanup |
| 10 | **Location leak in photos** | JPEG/PNG re-encoded in the browser before upload (drops EXIF incl. GPS) | `lib/imageprep.ts`; E2E › "a phone JPEG is stripped of GPS" |
| 11 | **Internet scanner hitting the tunnel URL** | Email gate first; `/health` returns only `{ok:true}`; no version banner; server binds 127.0.0.1, so only cloudflared reaches it | `app.ts`, `config.ts` defaults; `config.test.ts` › "safe defaults" |
| 12 | **Clickjacking** | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | `security.ts`; `health.test.ts` |
| 13 | **SQL injection** | Every query is a prepared statement; IDs validated as ULIDs before use | `shared/test/text.test.ts` › "rejects client-supplied ids that are not ULIDs"; `auth.test.ts` › malformed code |
| 14 | **Tampered schema** | Migration checksums; startup refuses an edited migration | `migrations.test.ts` |
| 15 | **Data loss** | WAL; `pnpm backup` (online backup + uploads, keep 14); restore moves current data aside | `backup.test.ts` › backup → wipe → restore with checksums |

## Residual risks (accepted for the demo, say them out loud)

1. **The host can read everything.** Messages are not end-to-end encrypted. Stated in the join screen's privacy note.
2. **The data lives on one personal PC.** Theft of the PC exposes the database (enable BitLocker); a
   dead disk loses it unless backups are copied off the PC (OPERATIONS §6).
3. **A stolen, unlocked laptop with a live session** can read the chat until an admin revokes that member.
   Sessions last up to a year by design; revocation is the control.
4. **Quick tunnels are for testing.** No uptime guarantee; the URL changes on restart. Use a named tunnel
   with Cloudflare Access for anything longer (OPERATIONS §8).
5. **Cloudflare terminates TLS** and can see traffic in transit. Acceptable for social chat; not for
   anything confidential (house rule 2).
6. **Unofficial use of the Noesis identity** until Marketing approves (D-01).
7. **Rate limits are in memory** and reset on restart; fine for one process and ≤ 50 users.

## Re-running this review

`/security-review` in Claude Code, `pnpm audit`, `pnpm test`, `pnpm test:e2e`. Update this file with
the date and anything new.
