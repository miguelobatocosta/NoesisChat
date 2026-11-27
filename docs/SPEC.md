# Pausa — Product & Technical Spec

Status: v2.1 (web demo, built), 2026-11-23. Owner: Costa. Supersedes the Electron plan in `_archive/`.
v2.1 records what changed while building; each change is also a decision in DECISIONS.md (D-39…D-46).
Anything marked **[OPEN]** is tracked in `DECISIONS.md`.

---

## 1. Purpose and scope

A private place for colleagues to talk and share things **unrelated to work**: memes, sport, food,
weekend plans, photos. Invite-only. Styled with the Noesis visual identity.

**This is a demo first.** It shows how quickly a working, secure, good-looking app can be built with
Claude Code. Size: a pilot of 10–20 people; design ceiling 50. Nothing here needs to scale beyond that.

**In scope (v1 = demo):** `#geral` + topic rooms, text with a markdown subset, replies, reactions,
mentions, edit/delete, typing, presence, unread counts, image paste/drop, browser notifications while
the app is open, invites and revocation, a minimal admin panel, house rules and privacy note, light/dark
theme, installable as a PWA, backup script.

**Backlog (not v1, in priority order):** stable URL (named tunnel + own domain + Cloudflare Access),
second device, narrow/mobile layout, search, non-image files, thumbnails, link previews, self-service
account deletion, Do Not Disturb, English locale. See §11.

**Out of scope:** desktop installer, DMs, private rooms, voice/video, native mobile apps, end-to-end
encryption, bots, Web Push.

**Non-goals:** replacing Teams for work. Being anonymous or hidden from the employer.

---

## 2. Users and roles

| Role | Who | Can |
|---|---|---|
| **host** | Costa (exactly one) | Everything admin can, plus promote/demote admins, server settings |
| **admin** | Trusted members | Issue/revoke invites, revoke members, archive/rename any room, delete any message |
| **member** | Everyone else | Read/post in all rooms, create topic rooms, edit/archive rooms they created, edit/delete own messages |

All rooms are visible to all members. Members can set a room's notification level or hide it for themselves.
Every admin/host action is written to `admin_log` (who, what, when, target).

---

## 3. Core UX

### 3.1 Joining
- **Host bootstrap (once):** `pnpm server:init` creates a one-time host invite link (and, once a host
  exists, a link that signs the host in on another browser). The host joins in the browser like everyone
  else. There is no host-only UI or host mode. `pnpm server:invite` creates member invites from the terminal.
- **Colleague:** clicks the invite link `<PUBLIC_URL>/join#<code>` → passes Cloudflare's email PIN screen
  (if the tunnel is gated, §4) → sees the house rules and privacy note (§3.7) → picks a display name
  (prefilled and locked if the invite names the person) → lands in `#geral`.
- Display names are unique after normalization (NFKC, lowercase, trimmed): "José" and "jose " collide.

### 3.2 Layout (desktop browsers, min width 960px)
```
┌──────────────┬───────────────────────────────────────────┐
│ Brand header │  # room-name · description   [● ligado]  │
│──────────────│───────────────────────────────────────────│
│ # geral   ●3 │                                           │
│ # futebol    │   message list (virtualized, newest at    │
│ # comida  ●1 │   bottom, day separators, grouped by      │
│ # memes      │   author within 5 min)                    │
│ + New room   │                                           │
│──────────────│───────────────────────────────────────────│
│ Online (12)  │  [reply preview]                          │
│ avatar list  │  composer: text · emoji · image · send    │
│──────────────│                                           │
│ me · menu    │                                           │
└──────────────┴───────────────────────────────────────────┘
```
- `#geral` pinned first, can't be archived or hidden, renamed by host only.
- Unread badge per room; bold room name when unread; mention badge distinct (mint dot).
- Connection pill in the header: connected / reconnecting / server offline.
- Narrower windows aren't supported in v1 (backlog). Don't build a broken half-responsive layout.

### 3.3 Messages
- Markdown subset: `**bold**`, `_italic_`, `` `code` ``, fenced code, auto-linked `http(s)` URLs, line breaks.
- Emoji picker (bundled, no CDN). `:shortcode:` autocomplete.
- **Mentions:** the composer's `@` autocomplete inserts a token `<@USER_ULID>` into the body. The server
  parses tokens, ignores unknown IDs, fills `mentions`. The renderer shows the current display name.
  Plain text `@Costa` is just text.
- Reply: quote a message (single level); clicking the quote scrolls to the original.
- **Edit** own message: shows "edited"; no edit history is kept.
- **Delete** own message: body is wiped and attachments are deleted; a tombstone shows "message deleted".
- Reactions: toggle emoji; counts; who reacted on hover.
- Optimistic send with a client ID → replaced on server ack; failed sends show retry. The server dedupes
  on `(user_id, client_id)`, so a retry after a dropped ack never creates a duplicate.
- Max message length: 4,000 chars.

### 3.4 Images
- Paste, drag-drop or pick images; up to 10 per message; 10 MB each (host-configurable).
- Accepted types, decided by **magic bytes** on the server: PNG, JPEG, GIF, WebP. Everything else is
  rejected, including SVG (it can carry script).
- **Metadata (D-28):** the browser re-encodes JPEG (quality 0.9) and PNG through a canvas before upload.
  That drops EXIF including GPS, and current browsers bake orientation in when drawing. GIF and WebP go as-is.
- Shown inline scaled by CSS (`loading="lazy"`); click → lightbox. No thumbnails in v1.
- Unattached uploads older than 24h are deleted by a cleanup job.

### 3.5 Notifications
- Browser `Notification` API, only while the tab or installed PWA window is open. No Web Push (it routes
  through third-party push services).
- Ask for permission after the user's first sent message, never on page load.
- Notify for: mentions, replies to me, and new messages in rooms set to "all".
- Per-room level: All / Mentions only (default) / Nothing. "Nothing" means nothing, mentions included.
  Never for my own messages or the room I'm looking at with the window focused.
- Unread count in the tab title (`(3) Pausa`) and `navigator.setAppBadge` where supported.

### 3.6 Admin panel (host/admin only, hidden for members)
- **Invites:** create (optional intended name, expiry 24h or 7d, single use), copy link, revoke, see who redeemed.
- **Members:** list with role, last seen, device count; revoke member (kills all tokens, disconnects within 2s).
- **Roles:** promote/demote admin (host only).
- **Messages:** admins can delete any message from the message menu.
- **Log:** read-only view of `admin_log`.

### 3.7 House rules and privacy note
Shown on the join screen and from the user menu, in pt-PT, plain words:
- What it's for (social, not work) and three house rules (be decent, nothing confidential, admins can remove things).
- Messages and images are stored **unencrypted on the host's PC**. **The host can read everything.**
- Deleted messages are wiped. Account deletion: ask the host (manual in v1, documented in OPERATIONS.md).
- No tracking, no third parties beyond Cloudflare carrying the traffic.

---

## 4. Architecture

```
┌──────────────────────────── Host PC ─────────────────────────────┐
│ node packages/server/dist/main.js   (127.0.0.1:4747)             │
│   Fastify HTTP: web app (static), /api/*, /files/*                │
│   Socket.IO (same origin)                                         │
│   SQLite (WAL)  ·  data dir: db.sqlite, uploads/, backups/        │
│                                                                   │
│ cloudflared tunnel --url http://localhost:4747                    │
│                    --allowed-mail '<list or *@domain>'            │
└───────────────────────────────┬───────────────────────────────────┘
                                │ outbound only, no port forwarding
                    https://<random>.trycloudflare.com
                                │ email PIN gate (Cloudflare), then TLS to browser
        Colleagues' browsers (Edge/Chrome/Firefox), optionally installed as a PWA
```
- **One origin** for app, API, sockets and files: no CORS, cookies just work, CSP stays `'self'`.
- The server binds to `127.0.0.1` by default. `BIND=0.0.0.0` exists for testing on a home LAN only.
- `pnpm demo` starts cloudflared, reads the generated URL from its output, then starts the server with
  `PUBLIC_URL` set (used for invite links and the Origin check). Quick-tunnel URLs change on every
  restart, and the session cookies belong to the old hostname, so restarting the tunnel logs everyone out.
  Acceptable for a demo; the backlog's named tunnel fixes it (D-20).
- **Portability:** the same server runs on a VPS/Raspberry Pi with the same data dir layout.

### 4.1 Repository layout
```
pausa/
  CLAUDE.md
  docs/ (SPEC, BRAND, DECISIONS, PROMPTS, PROGRESS; later OPERATIONS, SECURITY, DEMO)
  scripts/demo.mjs
  packages/
    shared/  src/{schemas,events,constants,types}.ts
    server/  src/{main.ts,app.ts,config.ts,db/,auth/,rooms/,messages/,members/,uploads/,admin/,realtime/,
                  cli/{init,invite,backup,restore,seed}.ts}
             migrations/0001_init.sql ...
             test/
    web/     src/{app/,features/{rooms,messages,composer,members,admin,onboarding}/,ui/,
                  styles/tokens.css,i18n/pt-PT.json,assets/brand/,assets/fonts/}
             public/{favicon.svg,theme-init.js,icons/}   (manifest generated at build)
             e2e/
  pnpm-workspace.yaml
```

---

## 5. Data model (SQLite)

All IDs are **ULIDs** from a **monotonic** factory (sortable even within one millisecond), generated
server-side. Timestamps are server UTC ms.

```sql
users        (id PK, display_name, name_key UNIQUE,            -- name_key = NFKC lowercase trimmed
              role CHECK(role IN('host','admin','member')), created_at, revoked_at NULL)
devices      (id PK, user_id FK, token_hash UNIQUE, label, last_seen_at, created_at, revoked_at NULL)
invites      (id PK, code_hash UNIQUE, created_by FK users, intended_name NULL, max_uses DEFAULT 1,
              uses DEFAULT 0, expires_at NOT NULL, created_at, revoked_at NULL)
invite_redemptions (invite_id FK, user_id FK, device_id FK, redeemed_at)
rooms        (id PK, slug UNIQUE, name, emoji NULL, description NULL, is_main INTEGER DEFAULT 0,
              created_by FK, created_at, archived_at NULL)
messages     (id PK, room_id FK, user_id FK, client_id, body TEXT NULL, reply_to_id NULL FK messages,
              seq INTEGER NOT NULL, created_at, edited_at NULL, deleted_at NULL,
              UNIQUE(user_id, client_id))
attachments  (id PK, message_id FK NULL, uploader_id FK, mime, size, sha256, path,
              width NULL, height NULL, created_at)
reactions    (message_id FK, user_id FK, emoji, created_at, PRIMARY KEY(message_id,user_id,emoji))
read_state   (user_id FK, room_id FK, last_read_id, PRIMARY KEY(user_id,room_id))
room_prefs   (user_id FK, room_id FK, notify CHECK(notify IN('all','mentions','none')) DEFAULT 'mentions',
              hidden INTEGER DEFAULT 0, PRIMARY KEY(user_id,room_id))
mentions     (message_id FK, user_id FK, PRIMARY KEY(message_id,user_id))
admin_log    (id PK, actor_id FK users, action, target_type, target_id, detail JSON NULL, created_at)
settings     (key PK, value JSON)          -- includes 'change_seq' (see below)
```
- **Change sequence:** every mutation of a message (create, edit, delete, reaction added/removed) sets
  `messages.seq` to the next value of the global `change_seq` counter, in the same transaction. This is what
  lets an offline client catch up on edits, deletes and reactions, not just new messages (§6.2).
- Seed migration creates `#geral` with `is_main = 1`.
- Indexes: `messages(room_id, id)`, `messages(room_id, seq)`, `messages(user_id)`, `devices(token_hash)`,
  `attachments(message_id)`.
- No FTS table in v1. Search arrives later as a new migration.

---

## 6. Protocol

### 6.1 HTTP (Fastify)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | `{ ok: true }`. No version or name (don't hand scanners a fingerprint) |
| GET | `/api/session` | cookie (optional) | `{ ok: true, user }`, with `user: null` when signed out. Always 200 (D-43) |
| POST | `/api/join` | invite code + Origin | Redeem invite → user + device → sets session cookie, returns the user |
| POST | `/api/logout` | cookie + Origin | Revokes this device, clears the cookie |
| POST | `/api/uploads` | cookie + Origin | Multipart image upload → unattached attachment record |
| GET | `/files/:id` | cookie | Serve an image (same origin, so `<img src>` sends the cookie) |
| GET | `/*` | none | The web app (static) |

Admin actions go over Socket.IO (D-31). HTTP is only for join, logout, uploads and files.

`/files/:id` headers: the stored MIME type, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`,
`Cache-Control: private, max-age=31536000, immutable` (IDs never change content).

### 6.2 Socket.IO
- Handshake: the server reads the session cookie from the handshake request, hashes it, looks up the
  device, rejects revoked or unknown, checks `Origin` (CLAUDE.md rule 3), sets `socket.data.userId/role/deviceId`.
- Every client→server event uses an **ack callback** returning `{ ok: true, data } | { ok: false, error: { code, message } }`.
- All payloads are zod-validated (schemas in `shared/src/events.ts`).

Client → server:
- `rooms:list` → rooms with unread count and mention count for me
- `rooms:create {name, emoji?, description?}`, `rooms:update {roomId, name?, emoji?, description?}`,
  `rooms:archive {roomId, archived: boolean}`
- `messages:history {roomId, before?, limit≤50}`: scrollback, newest first
- `messages:sync {roomId, sinceSeq}` → `{ messages, latestSeq, truncated }`: every message in the room with
  `seq > sinceSeq`, including tombstones and current reaction totals. Over 200 changes → `truncated: true`
  and the client reloads the latest page instead.
- `messages:send {roomId, clientId, body, replyToId?, attachmentIds[]}`, `messages:edit {messageId, body}`,
  `messages:delete {messageId}`, `reactions:toggle {messageId, emoji}`
- `typing {roomId}`, `read:mark {roomId, messageId}`, `prefs:update {roomId, notify?, hidden?}`
- `members:list` → every user, revoked ones with `active: false` so old messages keep a name (D-44)
- Admin (role-checked server-side): `admin:invites:create|list|revoke`, `admin:members:revoke|setRole`,
  `admin:log:list`

Server → client: `message:new`; `message:updated` for edits, deletes and reaction changes alike (full
message with its new `seq`, D-45); `room:created`, `room:updated`, `presence {userId, online}`,
`typing {roomId, userId}`, `member:updated`, `session:revoked`, `server:shutdown`.

- **Reconnect:** the client keeps the highest `seq` it has seen per loaded room. After reconnecting it calls
  `rooms:list` (badges) and `messages:sync` for each loaded room.
- Rate limits per device: `messages:send` 10/10s, `typing` 1/2s, `rooms:create` 5/hour, uploads 30/10min.
  Per client IP (rule 8): `/api/join` 5/min (`JOIN_RATE_PER_MIN`, raised only for automated tests).

---

## 7. Security

1. **Two walls.** Outer: the quick tunnel's email gate (`--allowed-mail`) means only listed addresses reach the
   app at all. Inner: invites and device cookies. **The app must be safe with the outer wall removed**
   (LAN mode, a misconfigured tunnel).
2. **Knowing the URL grants nothing.** No room, message, member or file data without a valid cookie.
3. **Invites:** 128-bit random code, stored hashed, expiry required (default 24h), single use by default.
   Link format `<PUBLIC_URL>/join#<base64url code>`: the code sits in the URL fragment, so it never reaches
   server logs, Cloudflare logs or a Referer header. The join page reads it and POSTs it.
   An email gate's login round trip drops the fragment, so `/join` first runs `invite-handoff.js`, which keeps
   the code in that tab's `sessionStorage` and moves to `/`; the app reads it from there and removes it once
   used. With a named tunnel, `/join` and `/invite-handoff.js` bypass Cloudflare Access so this runs before the
   email login (DECISIONS D-50).
4. **Device tokens:** 256-bit random, stored hashed, delivered only as the HttpOnly cookie (CLAUDE.md rule 2).
   Revocation → `session:revoked`, sockets disconnected within 2s, cookie rejected on every later request.
5. **Cross-site protection:** SameSite=Strict cookie + Origin check on the handshake and every POST
   (blocks cross-site WebSocket hijacking and CSRF).
6. **Headers and CSP:** CLAUDE.md rule 4. React renders all user content as text (rule 5).
7. **Uploads:** magic-byte allowlist of 4 image types, size cap, random on-disk names (never the user's),
   SHA-256 recorded, served with `nosniff`. SVG and everything else rejected.
8. **Client IP behind the tunnel:** CLAUDE.md rule 8.
9. **Logging:** no message bodies, tokens, invite codes or cookies in logs. Log auth failures with device ID and client IP.
10. **Privacy (GDPR):** the host is the data controller for colleagues' personal data. §3.7 tells people
    what's stored and who can read it. Delete wipes content. Account deletion is a documented manual procedure in v1.
11. **Moderation:** admins delete any message; every admin action is logged in `admin_log`.

---

## 8. Reliability and operations

- SQLite in WAL mode; `PRAGMA foreign_keys=ON`; busy timeout 5s.
- `pnpm backup` → `backups/YYYY-MM-DD-HHmmss/` with `db.sqlite` (better-sqlite3 `.backup()`) **and a copy of
  `uploads/`**. Keeps the last 14. A backup on the same disk isn't a backup: OPERATIONS.md tells the host to
  copy the folder off the PC (OneDrive, USB).
- Graceful shutdown on Ctrl+C: emit `server:shutdown` ("o servidor foi desligado"), close sockets, close the DB.
- The host PC must stay awake during the demo; OPERATIONS.md covers the Windows power settings.
- Target: 50 registered, 20 concurrent, single Node process. No load testing beyond a quick sanity script.

---

## 9. Distribution

None. **The URL is the distribution.** A web app manifest built from `APP_NAME` and a placeholder icon set
(not the Noesis logo, see BRAND.md §6) let Edge/Chrome offer "Install app" from the browser menu.
No service worker: Chrome dropped that requirement for menu install in version 112 (D-42), and without
one there are no stale cached versions and nothing cached at all.

---

## 10. Acceptance for the demo

- [ ] From a colleague's laptop on the office network: invite link → email PIN → name → chatting in `#geral` in under 60 seconds
- [ ] Two people chat, react, reply, mention and paste an image; the mention fires a browser notification
- [ ] A phone photo's GPS data is gone from the stored file
- [ ] A revoked member is disconnected within 2s and can't get back in
- [ ] A browser with the URL but no cookie gets no room, message, member or file data; an address outside the allow-list never reaches the app
- [ ] Kill and restart the server (tunnel still up): clients show offline, reconnect, and catch up on missed messages, edits, deletes and reactions with no duplicates
- [ ] `pnpm backup` → wipe data dir → restore → rooms, messages and images are back
- [ ] BRAND.md §8 checklist passes in light and dark; axe-core reports no contrast failures

---

## 11. Backlog (after the demo, in order)

1. **Stable URL:** domain on Cloudflare + named tunnel as a Windows service + Cloudflare Access with the same
   email rule. Fixes "tunnel restart logs everyone out". Needed before any pilot longer than a day.
2. **Second device:** a signed-in device generates a one-time link code (10 min) to sign in another browser.
3. **Narrow/mobile layout:** sidebar becomes a drawer below 768px.
4. **Search:** FTS5 with `unicode61 remove_diacritics 2` ("café" matches "cafe"), filters room/author.
5. **Non-image files**, with an executable/script blocklist and `Content-Disposition: attachment`.
6. **Thumbnails** generated in the browser.
7. **Link previews:** server-side unfurl with the SSRF rules in `_archive/2026-11-23-electron-plan/docs/SPEC.md` §7.6.
8. **Self-service "delete my account"** (anonymize to "Antigo membro", delete devices).
9. **Do Not Disturb** and quiet hours.
10. **English locale** (`en.json`).
