# PROMPTS.md — phased build prompts for Claude Code

How to use: run one phase per session (or `/next-phase`). Paste the prompt, let Claude plan in plan mode,
review the plan, approve, then let it build. Don't start a phase until the previous one meets its
acceptance criteria. Clear context between phases (`/clear`). CLAUDE.md and the docs carry the memory.

Each prompt follows the same shape: **Goal → Build → Tests → Acceptance → Stop.**

---

## Phase 0 · Kickoff review (no code)

```
Read CLAUDE.md and every file in docs/. Do not write code.

Then give me:
1. A critique of SPEC.md: contradictions, missing pieces, anything over-engineered for ≤150 users,
   anything under-specified that will bite in later phases. Be blunt.
2. The 5 riskiest technical areas in this project, and how each phase de-risks them.
3. Any OPEN item in DECISIONS.md that blocks Phases 1–4. Propose a default for each.
4. A list of the exact packages (with current stable versions from `npm view`) you intend to use.

Stop there and wait for my answers. I will update the docs before Phase 1.
```

---

## Phase 1 · Monorepo scaffold

```
Phase 1: scaffold the monorepo. No product features.

Build:
- pnpm workspace with packages/shared, packages/server, packages/desktop as per SPEC §4.1
- TypeScript strict project references; ESLint + Prettier; Vitest in shared and server; Playwright set up
  for Electron in desktop/e2e
- desktop: electron-vite + React; secure BrowserWindow defaults (contextIsolation, sandbox, no
  nodeIntegration, CSP), typed preload exposing only `appInfo()`; single-instance lock
- server: Fastify app with GET /health returning { ok, version, name }; config loader (env + JSON file,
  validated with zod); data dir creation
- Root scripts exactly as listed in CLAUDE.md "Commands"
- tokens.css from BRAND.md §3 and bundled Raleway woff2 (400/500/600/700); a blank window that shows
  "Pausa" in Raleway on the brand header, light/dark following the OS

Tests: shared smoke test; server /health integration test; one Playwright test that launches the app
and asserts the header renders.

Acceptance: `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` all pass from a
clean clone. `pnpm dev` opens the window. Zero external network requests from the renderer.

Stop. Update PROGRESS.md, commit, and show me the tree and the scripts.
```

---

## Phase 2 · Server core: rooms and messages (no auth yet, dev-only user)

```
Phase 2: server core. Use a hardcoded dev user injected only when NODE_ENV=development; real auth
comes in Phase 3. Keep that seam explicit (one function to replace).

Build:
- Migration runner + migrations/0001_init.sql implementing SPEC §5 (all tables, indexes, FTS5 table with
  triggers kept in sync), seed #geral with is_main = 1
- ULID generation server-side
- Socket.IO attached to Fastify. Event schemas in shared/src/events.ts (zod) for: rooms:list, rooms:create,
  rooms:update, rooms:archive, messages:history, messages:send, messages:edit, messages:delete,
  reactions:toggle, typing, read:mark, and server events message:new/updated/deleted, room:created/
  updated/archived, reaction:updated, typing
- Uniform ack envelope { ok, data } | { ok:false, error:{code,message} }
- Permission rules from SPEC §2 enforced server-side (main room can't be archived; only author edits; etc.)
- Rate limits from SPEC §6.2

Tests (write first): every event happy path + validation failure + permission failure; history pagination
(before/after cursors, limit cap); FTS index stays in sync after edit/delete; main room protections;
rate limit triggers.

Acceptance: two socket.io-client instances in a test can create a room, exchange messages, edit, delete,
react, and see each other's events in order. Coverage of server/src ≥ 80%.

Stop. Update PROGRESS.md, commit, summarize the protocol as implemented vs SPEC (list any deviations).
```

---

## Phase 3 · Auth: invites, device tokens, revocation

```
Phase 3: replace the dev user with real auth per SPEC §6.1, §6.2 and §7.

Build:
- Host bootstrap: on first start in host mode, create the host user + host device token
- Invites: create/list/revoke (host+admin), 128-bit code, hashed, expiry required, max uses; invite string
  format `pausa1.<base64url(JSON{u,c,n?})>` encoded/decoded in shared with zod validation
- POST /api/join: redeem invite → user + device → return token once; rate limit 5/min/IP; constant-time
  compare; generic error messages (don't leak whether a code exists)
- Socket handshake auth: hash token, look up device, reject revoked, attach userId/role; update last_seen
- Revoke member / revoke device: mark revoked, emit session:revoked, disconnect sockets within 2s
- Roles: promote/demote admin (host only)
- Remove the dev-user seam entirely (grep to prove it)

Tests (write first): expired invite, exhausted invite, revoked invite, reused code, malformed invite string,
bad token, revoked token mid-session (socket gets session:revoked and is disconnected), member trying admin
actions, admin trying host-only actions, brute-force rate limit on /api/join.

Acceptance: the "forwarded installer" scenario is covered by a test: a client with no/invalid token can't
receive a single room or message event.

Stop. Update PROGRESS.md, commit, and list every endpoint/event with its required role.
```

---

## Phase 4 · Desktop shell: host vs join, secure storage, tray, deep links

```
Phase 4: the Electron shell around the client. Minimal UI; full chat UI is Phase 5.

Build:
- First-run onboarding: "Join with invite" (default) and a small "Host a server" link (SPEC §3.1)
- Host mode: start packages/server embedded in the main process (data dir in app.getPath('userData')/server
  unless the host picks another), connect the renderer to 127.0.0.1; powerSaveBlocker while hosting;
  banner "Your PC is the server…"
- Join mode: decode invite, call /api/join, store token with safeStorage (encrypted file in userData),
  never expose the raw token to the renderer: the main process owns the socket connection OR passes the
  token once through a validated IPC call (choose one, justify it in the commit)
- Register `pausa://` protocol; handle deep links on first launch and when already running
  (second-instance), validate with the shared zod schema
- Tray: Open, Do Not Disturb, Quit; close-to-tray; quitting as host shows a confirm ("Everyone will be
  disconnected")
- Connection state machine: connected / reconnecting (exponential backoff with jitter) / offline, exposed
  to the renderer
- Settings: theme (System/Light/Dark), language (System/pt-PT/en), launch at login

Tests: Playwright: host onboarding end-to-end creates a server and lands in #geral; join flow against a
test server with a generated invite; deep link handling; second instance focuses the first.

Acceptance: I can run two instances on one machine (separate userData dirs via a dev flag), one hosting,
one joining via invite string, and both show "connected".

Stop. Update PROGRESS.md, commit, and show me screenshots of onboarding in light and dark.
```

---

## Phase 5 · Chat UI with Noesis branding

```
Phase 5: the main chat experience. Follow BRAND.md exactly; run its QA checklist at the end.

Build (SPEC §3.2, §3.3):
- Layout: brand header, navy sidebar (rooms with unread/mention badges, online members, me + status),
  room header, virtualized message list, composer
- Message rendering: author grouping (5 min), day separators, markdown subset → React elements (no raw HTML),
  auto-links, code blocks, "edited", "message deleted", reply quote with jump-to-original
- Composer: multiline (Enter sends, Shift+Enter newline), emoji picker (bundled), :shortcode: and @mention
  autocomplete, reply mode, edit last message with ↑
- Optimistic send with tempId, retry on failure
- Reactions UI with hover "who reacted"
- Typing indicator, presence dots, unread tracking with read:mark when the room is visible and focused
- History: infinite scroll up with scroll-position preservation; "jump to latest" pill
- Ctrl+K quick switcher; Alt+↑/↓ room navigation; full keyboard focus visibility
- All strings via i18n (pt-PT + en)

Tests: Playwright: send/receive between two clients, edit, delete, react, reply jump, unread badge
increments and clears, mention highlights. Unit tests for the markdown renderer including XSS payloads
(<img onerror>, javascript: links, nested markdown).

Acceptance: BRAND.md §8 checklist passes (paste it with ticks); no contrast failures (run axe-core in the
Playwright test); scrolling 5,000 messages stays smooth.

Stop. Update PROGRESS.md, commit, screenshots of a busy #geral in light and dark.
```

---

## Phase 6 · Topic rooms management

```
Phase 6: rooms lifecycle (SPEC §2, §3.2).

Build: "New room" dialog (name → slug, emoji, description, duplicate-name check), room settings (rename,
description, emoji; creator/admin/host only), archive/unarchive (archived rooms hidden, readable from an
"Archived" section, read-only), per-user hide and notification level (All / Mentions / Nothing).
#geral: cannot be archived or hidden, rename host-only.

Tests: permission matrix for every room action × role; slug collisions; archived room rejects new messages.

Acceptance: a member creates #futebol, another sees it appear live; the creator renames it; a different
member can't; admin archives it; it's read-only for everyone.

Stop. Update PROGRESS.md, commit.
```

---

## Phase 7 · Sharing: images, files, link previews

```
Phase 7: sharing (SPEC §3.4, §7.6, §7.7).

Build:
- POST /api/uploads (multipart, streaming to disk, size cap from settings, magic-byte MIME detection,
  blocked extensions, random on-disk names, sha256)
- Signed, expiring file URLs (HMAC, 1h) served by GET /files/:id with correct headers
- Client: paste, drag-drop, file picker; upload progress; client-side thumbnail (canvas → WebP ≤640px);
  image grid in messages; lightbox; file cards with name/size/download
- Orphan cleanup job (unattached > 24h)
- EXIF GPS stripping per DECISIONS D-28 default
- Link previews behind a host setting (default off): server-side unfurl with the full SSRF guard in SPEC §7.6;
  preview card in the message

Tests (write first): oversized file, spoofed extension (.png that is an exe), blocked type, expired signed
URL, tampered signature, member fetching a file by guessing an id without signature, SSRF attempts to
127.0.0.1, 10.0.0.0/8, 169.254.169.254, [::1], a public host that redirects to a private IP, and DNS rebinding
(resolve-then-connect to the checked IP).

Acceptance: sharing a 20 MB video file and a pasted screenshot works between two clients; all SSRF tests pass.

Stop. Update PROGRESS.md, commit.
```

---

## Phase 8 · Notifications, mentions, search

```
Phase 8: SPEC §3.5 and §3.6.

Build: mentions table populated on send/edit; native notifications from the main process per room
notify level, DND and quiet hours; click notification → focus app → open room at message; taskbar badge /
overlay icon with unread count; FTS5 search with filters (room, author, has:file), result highlighting and
jump-to-context.

Tests: notification decision function as a pure unit (all combinations of level × mention × DND × focus);
search correctness incl. diacritics (pt-PT: "café" matches "cafe"). Configure FTS5 with
`unicode61 remove_diacritics 2`.

Acceptance: muted room + mention → notifies; muted room + no mention → silent; DND → silent; own messages → silent.

Stop. Update PROGRESS.md, commit.
```

---

## Phase 9 · Host admin panel, backups, privacy

```
Phase 9: SPEC §3.7, §7.9, §8.

Build: admin panel (host/admin only, hidden for members): members (role, last seen, devices, revoke),
invites (create with expiry/uses/intended name, copy string and pausa:// link, QR optional, revoke,
redemption history), rooms (archive/rename), storage (db, uploads, free disk, quota warning), backups
(run now, daily schedule, keep N, open folder), server settings (bind address, public URL, upload cap,
link previews on/off).
Backups via better-sqlite3 .backup() + uploads manifest; documented restore procedure in docs/OPERATIONS.md
and a tested restore script.
Privacy: in-app privacy note (pt-PT + en), "delete my account" (anonymize messages to "Former member",
delete avatar and devices).

Tests: backup → wipe → restore reproduces rooms/messages/files (checksums); delete-account anonymizes
correctly and is irreversible; members can't call admin endpoints.

Acceptance: I can onboard a colleague end-to-end from the admin panel without touching a terminal.

Stop. Update PROGRESS.md, commit.
```

---

## Phase 10 · Exposure and resilience

```
Phase 10: getting colleagues connected. Read DECISIONS D-20 first and ask me which option I chose
if it's still OPEN.

Build:
- docs/OPERATIONS.md: step-by-step setup for the chosen exposure (e.g. Cloudflare named tunnel as a
  Windows service pointing at 127.0.0.1:4747, WebSocket enabled), plus LAN mode
- Admin setting "Public URL" used in generated invites; startup self-check that calls the public URL's
  /health and shows the result in the admin panel
- Client resilience: offline outbox (queued sends with tempIds flush on reconnect, in order), gap-fill via
  messages:history after reconnect, clock-skew-safe ordering (server ULIDs only)
- Graceful server shutdown (notify clients "host going offline", flush WAL)
- Load script: 50 simulated clients, 5 msgs/min each for 10 min; report p95 ack latency and memory

Tests: kill the server mid-conversation → clients show offline → restart → queued messages delivered once,
no duplicates, order preserved.

Acceptance: load test p95 ack < 150 ms on the host PC; zero lost/duplicated messages in the chaos test.

Stop. Update PROGRESS.md, commit, paste the load test report.
```

---

## Phase 11 · Packaging, auto-update, release

```
Phase 11: ship it (SPEC §9). Check DECISIONS D-00, D-01, D-21, D-25 and ask about any still OPEN.

Build:
- electron-builder config: NSIS, per-user install (no admin), app ID and name from config, icon set,
  file associations none, protocol pausa:// registered by the installer
- Signing hook: no-op without a cert, uses env-provided cert/service when configured
- electron-updater generic provider → <publicUrl>/updates/; admin panel "Publish update" uploads
  installer + latest.yml into the server's updates dir; client checks on launch + every 6h, prompts to restart
- Version from package.json; CHANGELOG.md; `pnpm release` script that builds, generates checksums and
  prints the files to upload
- docs/INSTALL-pt.md and docs/INSTALL-en.md for colleagues (one page: install, paste invite, done; what
  the SmartScreen warning looks like if unsigned)

Tests: install on a clean Windows VM/user, join via deep link, publish v0.1.1, client updates itself.

Acceptance: a non-technical colleague installs and joins in under 2 minutes using INSTALL-pt.md alone.

Stop. Update PROGRESS.md, commit, tag v0.1.0.
```

---

## Phase 12 · Security review and hardening

```
Phase 12: run /security-review across the whole repo. Then fix everything rated high or medium.

Also verify, with evidence (file + line or test name), each item of:
Electron security checklist (contextIsolation, sandbox, nodeIntegration off, CSP, no remote module,
navigation/new-window blocked, openExternal validated, IPC validated, devtools off in prod, no
`webSecurity:false`, safeStorage for tokens), SPEC §7 items 1–9, dependency audit (`pnpm audit`, no high).

Deliver docs/SECURITY.md: threat model (forwarded installer, stolen laptop, malicious member, internet
scanner hitting the tunnel URL, malicious link/upload), mitigations, residual risks.

Stop. Update PROGRESS.md, commit.
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
