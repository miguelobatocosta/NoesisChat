# PROMPTS.md — phased build prompts for Claude Code

> **Status 2026-11-23:** all six phases were built in one session at the owner's request ("do everything
> in one go"), in the order 1 → 2+4 (server with real auth) → 5 (server) → 3+4+5 (web) → 6. Deviations are
> in DECISIONS D-39…D-47. Keep these prompts: they're the script for re-running the build as a live demo,
> and the template for backlog items (SPEC §11).

How to use: one phase per session (or `/next-phase`). Paste the prompt, let Claude plan in plan mode,
review the plan, approve, then let it build. Don't start a phase until the previous one meets its
acceptance criteria. Clear context between phases (`/clear`). CLAUDE.md and the docs carry the memory.

Shape of every prompt: **Goal → Build → Tests → Acceptance → Show → Stop.**
"Show" is the demo rule: every phase ends with something you can put on a screen.

Seven sessions in total: Phase 0 (review) + Phases 1–6.

---

## Phase 0 · Kickoff check (no code)

```
Read CLAUDE.md and every file in docs/ (ignore _archive/). Do not write code.

Then give me:
1. A blunt critique of SPEC.md: contradictions, gaps that will bite in Phases 1–6, anything still
   over-built for a 10–20 person demo.
2. The exact packages you'll use with current stable versions from `npm view`, plus the output of
   `node --version` and `pnpm --version`, and the exact pnpm setting that allows better-sqlite3's
   install script for that pnpm version.
3. Any OPEN item in DECISIONS.md that blocks Phases 1–3.

Stop there and wait for my answers. I'll update the docs before Phase 1.
```

---

## Phase 1 · Scaffold → branded empty shell

```
Phase 1: scaffold the monorepo and serve a branded empty page. No chat features.

Build:
- pnpm workspace: packages/shared, packages/server, packages/web per SPEC §4.1; allow better-sqlite3's
  install script in pnpm-workspace.yaml (CLAUDE.md "pnpm gotcha")
- TypeScript strict project references; ESLint + Prettier; Vitest in shared and server; Playwright (Chromium)
- server: Fastify, GET /health → { ok: true }, config loader (env + optional JSON, validated with zod:
  PORT, BIND, DATA_DIR, PUBLIC_URL, APP_NAME, UPLOAD_MAX_MB), data dir creation, security headers and CSP
  from CLAUDE.md rule 4 on every response, serves packages/web's build in production
- web: Vite + React; tokens.css from BRAND.md §3; bundled Raleway woff2 (400/500/600/700); brand header
  with the BRAND.md §6 text placeholder; theme follows prefers-color-scheme with a System/Light/Dark
  toggle; `t()` helper reading i18n/pt-PT.json
- Root scripts: dev, start, test, test:e2e, lint, typecheck (CLAUDE.md "Commands")

Tests: shared smoke test; server test for /health and for the security headers; Playwright: page loads,
header renders, zero requests to any host other than the app's own origin.

Acceptance: from a clean clone `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
all pass. `pnpm start` serves the branded shell on http://localhost:4747.

Show: screenshots of the shell in light and dark.
Stop. Update PROGRESS.md, commit, show me the tree and the scripts.
```

---

## Phase 2 · Server core: rooms, messages, sync

```
Phase 2: the realtime server. No real auth yet: in NODE_ENV=development only, a dev seam picks the user
from a `devUser` handshake param (creating the user on first use) so two clients can be two people.
Keep the seam in ONE function that Phase 4 deletes.

Build:
- Migration runner + migrations/0001_init.sql implementing SPEC §5 (all tables and indexes, change_seq
  counter, #geral seeded with is_main = 1)
- Monotonic ULIDs; change-sequence bump on every message mutation, in the same transaction (D-33)
- Socket.IO attached to Fastify; event schemas in shared/src/events.ts (zod) for every client→server and
  server→client event in SPEC §6.2 except the admin:* events
- Uniform ack envelope; permissions from SPEC §2 enforced server-side; rate limits from SPEC §6.2
- Mentions parsed from <@ULID> tokens (D-32); idempotent send on (user_id, client_id) (D-38);
  delete wipes body (D-34)

Tests (write first): every event's happy path + validation failure + permission failure; history paging
and limit cap; messages:sync returns new messages, edits, tombstones and reaction changes since a seq,
and sets truncated over 200; duplicate clientId returns the original message; #geral can't be archived
or renamed by non-host; rate limits trigger.

Acceptance: in one test, two socket.io-client instances create a room, exchange messages, edit, delete,
react and see each other's events in order; a third client that was disconnected meanwhile catches up
completely via messages:sync. Coverage of server/src ≥ 80%.

Show: the test output.
Stop. Update PROGRESS.md, commit, list any deviation from SPEC §6.2.
```

---

## Phase 3 · Chat UI (first demo moment)

```
Phase 3: the chat experience in the browser, on the Phase 2 server with the dev seam. Follow BRAND.md
exactly and run its §8 checklist at the end.

Build (SPEC §3.2, §3.3):
- Layout: brand header with connection pill, navy sidebar (rooms with unread/mention badges, online
  members, me + menu), room header, virtualized message list, composer
- Messages: author grouping (5 min), day separators, markdown subset → React elements (no raw HTML),
  auto-links, code blocks, "edited", tombstones, mentions rendered from <@ULID>, reply quote with
  jump-to-original
- Composer: Enter sends, Shift+Enter newline, bundled emoji picker, :shortcode: and @mention
  autocomplete (inserts tokens), reply mode, ↑ edits my last message
- Optimistic send with clientId and retry; reactions with who-reacted on hover; typing; presence;
  unread tracking with read:mark when the room is visible and the window focused
- History: infinite scroll up with scroll-position preservation; "jump to latest" pill
- Reconnect: keep the highest seq per loaded room, call rooms:list + messages:sync after reconnecting
- "+ New room" dialog (name → slug, emoji, description, duplicate check)
- Ctrl+K quick switcher; Alt+↑/↓ between rooms; visible focus everywhere
- Dev-only: open http://localhost:5173/?devUser=ana and ?devUser=rui in two windows

Tests: unit tests for the markdown renderer including XSS payloads (<img onerror>, javascript: links,
nested markdown, a <@ULID> inside a code span). Playwright with two browser contexts: send/receive, edit,
delete, react, reply jump, unread badge increments and clears, mention highlight, new room appears live,
server restart → both reconnect and nothing is lost or duplicated.

Acceptance: BRAND.md §8 checklist passes (paste it with ticks); axe-core in Playwright reports no
contrast failures in light or dark; 5,000 seeded messages scroll smoothly.

Show: screenshots of a busy #geral in light and dark, two windows side by side.
Stop. Update PROGRESS.md, commit.
```

---

## Phase 4 · Invites, sessions, admin

```
Phase 4: replace the dev seam with real auth (SPEC §3.1, §3.6, §3.7, §6, §7) and add the admin panel.

Build:
- `pnpm server:init`: creates the host user and prints a one-time host invite link (PUBLIC_URL or localhost)
- Invites over Socket.IO (admin:invites:*): 128-bit code, hashed, expiry required, single use;
  link <PUBLIC_URL>/join#<code>
- Join page: reads the code from the fragment, shows house rules + privacy note (§3.7), display name
  (prefilled/locked from the invite, unique after normalization), POST /api/join → session cookie
- Session cookie per CLAUDE.md rule 2; handshake auth from the cookie; Origin check on handshake and
  POSTs (rule 3); POST /api/logout
- Client IP from CF-Connecting-IP only when the peer is loopback (rule 8); /api/join rate limit uses it
- Revoke member / device → session:revoked + disconnect within 2s; promote/demote admin (host only)
- Admin panel UI: invites (create, copy link, revoke, redemptions), members (role, last seen, devices,
  revoke), log; "delete" in the message menu for admins; every admin action written to admin_log
- Delete the dev seam entirely (grep to prove it)

Tests (write first): expired, exhausted, revoked and malformed invites; reused code; missing/unknown/
revoked cookie; revoked mid-session (socket receives session:revoked and is disconnected within 2s);
wrong Origin on handshake and on POST; member calling admin events; admin calling host-only events;
duplicate display name ("José" vs "jose "); join rate limit keyed on CF-Connecting-IP from loopback only,
ignored from any other peer; admin_log rows written.

Acceptance: a test proves a browser with the URL but no cookie receives no room, message, member or file
data. Playwright runs the full flow: server:init → host joins → host creates invite → second context
joins via the link → both chat → host revokes → second context is kicked to the join page.

Show: the join flow in screenshots, and the admin panel.
Stop. Update PROGRESS.md, commit, list every endpoint/event with its required role.
```

---

## Phase 5 · Images, notifications, room settings

```
Phase 5: SPEC §3.4, §3.5 and the rest of room management.

Build:
- POST /api/uploads: multipart streamed to disk, size cap from config, magic-byte allowlist (PNG, JPEG,
  GIF, WebP), random on-disk names, sha256; GET /files/:id with cookie auth and the headers in SPEC §6.1
- Client: paste, drag-drop, picker; upload progress; JPEG/PNG re-encoded through a canvas before upload
  (D-28); image grid in messages; lightbox
- Orphan cleanup job (unattached > 24h)
- Notifications: permission asked after the first sent message; one pure decision function
  (level × mention × reply-to-me × own message × room focused × window focused); tab-title count and
  navigator.setAppBadge where supported
- Room settings (rename, emoji, description: creator/admin/host; #geral rename host-only), archive/unarchive
  (archived rooms read-only, listed under "Arquivadas"), per-user hide and notification level

Tests (write first): oversized file; a .png that is really an exe; SVG rejected; file fetch without a cookie;
archived room rejects new messages; permission matrix for every room action × role; the notification
decision function over every combination.

Acceptance: a pasted screenshot and a phone JPEG are shared between two users, and the stored JPEG has no
GPS tag (check with an EXIF reader in the test). Room on "Mentions" + mention → notifies; "Mentions" + no
mention → silent; "Nothing" + mention → silent; own messages → silent.

Show: a message with three images and the lightbox open; a notification on screen.
Stop. Update PROGRESS.md, commit.
```

---

## Phase 6 · Go live: tunnel, PWA, backups, security pass

```
Phase 6: make it demo-ready. Read DECISIONS D-00 and D-20 first and remind me of the network check
if D-00 is still OPEN.

Build:
- scripts/demo.mjs as `pnpm demo`: builds, starts `cloudflared tunnel --url http://localhost:4747
  --allowed-mail <ALLOWED_MAIL from .env>`, parses the trycloudflare URL from cloudflared's output,
  starts the server with PUBLIC_URL set, prints the URL and (if the host has no device yet) a host invite
  link. Clear error if cloudflared isn't installed or ALLOWED_MAIL is empty. Ctrl+C stops both cleanly.
- Graceful shutdown: server:shutdown to clients, close sockets and DB
- PWA: manifest.webmanifest, placeholder icon set (not the Noesis logo), minimal pass-through service
  worker that caches nothing (SPEC §9)
- scripts/backup.mjs as `pnpm backup` (db via .backup() + copy of uploads/, keep 14) and a tested restore
- docs/OPERATIONS.md: install prerequisites on Windows, start/stop, keep the PC awake, backup/restore and
  copying backups off the PC, manual account deletion, changing the allow-list, moving to a named tunnel +
  own domain + Cloudflare Access
- docs/DEMO.md: a 5-minute demo script (what to click, what to say)
- Run /security-review on the whole repo; fix everything high or medium. Write docs/SECURITY.md: threat
  model (leaked URL, leaked invite, malicious member, internet scanner hitting the tunnel, malicious upload,
  stolen laptop with a live cookie), mitigations with file/test evidence, residual risks. `pnpm audit`:
  no high.

Tests: backup → wipe → restore reproduces rooms, messages and images (checksums); with the tunnel running,
stop and restart only the server → clients show offline, reconnect and catch up with no duplicates.

Acceptance: from a colleague's laptop on the office network, the whole DEMO.md script runs. SPEC §10 is
fully ticked.

Show: the ticked SPEC §10 list.
Stop. Update PROGRESS.md, commit, tag v0.1.0.
```

---

## Reusable prompts (any time)

**When Claude drifts or over-builds:**
```
Stop. Re-read CLAUDE.md "Don't" and the current phase prompt. List what you've done that's outside this
phase's scope, revert it, and continue only with what the phase asks.
```

**Bug report template:**
```
Bug: <what happened>. Expected: <what should happen>. Steps: <1,2,3>. Logs: <paste>.
First write a failing test that reproduces it. Then fix. Then show me the test passing.
```

**Brand check:** `/brand-check`  ·  **Security pass:** `/security-review`  ·  **Next phase:** `/next-phase`
