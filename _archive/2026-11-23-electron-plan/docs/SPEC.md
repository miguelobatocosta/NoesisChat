# Pausa — Product & Technical Spec

Status: v1 draft. Owner: Costa. Anything marked **[OPEN]** is tracked in `DECISIONS.md`.

---

## 1. Problem and scope

A private place for colleagues to talk and share things **unrelated to work**: memes, sport, food,
weekend plans, links, photos. Invite-only. Branded with the Noesis visual identity.

**In scope (v1):** main room, topic rooms, text, images/files, reactions, replies, mentions, edit/delete,
presence, typing, unread counts, OS notifications, search, host admin panel, invites and revocation,
backups, Windows installer with auto-update.

**Out of scope (v1):** voice/video, DMs [OPEN: DMs in v1.1?], private rooms, mobile apps, web client,
end-to-end encryption, bots/integrations, message threads beyond single-level replies.

**Non-goals:** replacing Teams for work. Being anonymous or hidden from the employer.

---

## 2. Users and roles

| Role | Who | Can |
|---|---|---|
| **host** | Costa (exactly one) | Everything admin can, plus server settings, backups, promote/demote admins |
| **admin** | Trusted members | Issue/revoke invites, revoke members, archive/rename any room, delete any message |
| **member** | Everyone else | Read/post in all rooms, create topic rooms, edit/archive rooms they created, edit/delete own messages |

All rooms are visible to all members in v1. Members can **mute** or **hide** a room for themselves.

---

## 3. Core UX

### 3.1 First run
- **Join** (default path): paste an invite string, or click a `pausa://join?...` link → choose display
  name (prefilled if the invite carries one) and optional avatar → land in `#geral`.
- **Host** (small "Host a server" link, not prominent): choose data folder, port, server display name →
  server starts embedded → host is created as `host` user → land in `#geral` → prompt to create first invite.

### 3.2 Layout (desktop, min 960×600)
```
┌──────────────┬───────────────────────────────────────────┐
│ Brand header │  # room-name · description      [search] │
│──────────────│───────────────────────────────────────────│
│ # geral   ●3 │                                           │
│ # futebol    │   message list (virtualized, newest at    │
│ # comida  ●1 │   bottom, day separators, grouped by      │
│ # memes      │   author within 5 min)                    │
│ + New room   │                                           │
│──────────────│───────────────────────────────────────────│
│ Online (12)  │  [reply preview]                          │
│ avatar list  │  composer: text · emoji · attach · send   │
│──────────────│                                           │
│ me · status  │                                           │
└──────────────┴───────────────────────────────────────────┘
```
- `#geral` pinned first, cannot be archived, renamed by host only.
- Unread badge per room; bold room name when unread; mention badge distinct (mint dot).
- Closing the window **minimizes to tray** (the host's server must keep running). Tray menu: Open,
  Do Not Disturb, Quit. Quitting as host warns: "Everyone will be disconnected."

### 3.3 Messages
- Markdown subset: `**bold**`, `_italic_`, `` `code` ``, fenced code, auto-linked URLs, line breaks.
- Emoji picker (bundled, no CDN). `:shortcode:` autocomplete.
- `@name` autocomplete → mention → notification even if room is muted (unless DND).
- Reply: quote a message (single level); clicking the quote scrolls to the original.
- Edit own message (shows "edited"); delete own (soft delete, shows "message deleted").
- Reactions: toggle emoji; show counts and who reacted on hover.
- Optimistic send with client temp ID → replaced on server ack; failed sends show retry.
- Max message length: 4,000 chars.

### 3.4 Sharing
- Paste or drag-drop images and files; multiple per message (max 10).
- Default size cap **25 MB per file** (host-configurable). Server sniffs MIME from magic bytes; never
  trusts the extension.
- Images: client generates a thumbnail (canvas, max 640px, WebP) and uploads it with the original.
  Click → lightbox. EXIF stripped from the thumbnail; original is stored as-is [OPEN: strip EXIF GPS from originals too?].
- Executables and scripts (`.exe .bat .cmd .ps1 .msi .js .vbs .scr .dll`) are **blocked**.
- Link previews (phase 7, optional): server-side unfurl of Open Graph tags with SSRF protection (§7.6).

### 3.5 Notifications
- Native OS notifications for: mentions, replies to me, and new messages in rooms I've set to "all".
- Per-room setting: All / Mentions only (default) / Nothing.
- Do Not Disturb toggle and quiet hours. No notification for my own messages or the focused room.

### 3.6 Search
- SQLite FTS5 across messages the user can see; filters: room, author, has:file. Results jump to context.

### 3.7 Host admin panel
- Members: list, role, last seen, devices; revoke member (kills all tokens, disconnects immediately).
- Invites: create (optional intended name, expiry 1h/24h/7d, uses 1–N), copy string/link, revoke, see redemptions.
- Rooms: archive/unarchive, rename.
- Storage: DB size, uploads size, free disk; warning at 80% of configured quota.
- Backups: run now, schedule (daily default), keep last N (default 14), restore instructions.
- Server: port, public URL, bind address, upload cap, retention policy [OPEN: delete messages older than X?].

---

## 4. Architecture

```
            ┌───────────────────────── Host PC ─────────────────────────┐
            │ Electron main process                                     │
            │   ├─ embedded server (packages/server)                    │
            │   │    Fastify HTTP  +  Socket.IO  +  SQLite (WAL)        │
            │   │    data dir: db.sqlite, uploads/, backups/, updates/  │
            │   └─ renderer: same client UI, connects to 127.0.0.1      │
            │                                                           │
            │ Exposure (one of, see DECISIONS D-03):                    │
            │   cloudflared tunnel ──► https://chat.<domain>            │
            │   or LAN bind 0.0.0.0:4747                                │
            │   or Tailscale (tailnet address)                          │
            └───────────────────────────────────────────────────────────┘
                         ▲  wss/https (TLS terminated by tunnel)
                         │
      Colleague PCs: Electron client (same app, "join" mode)
```

- **One codebase, one installer.** Mode is chosen on first run and stored in app config.
- The server binds to `127.0.0.1` by default. Exposure is an explicit host choice.
- **Portability:** `packages/server` runs standalone with the same data dir layout so the host can move
  it to a VPS/Raspberry Pi later. Clients only care about the URL.

### 4.1 Repository layout
```
pausa/
  CLAUDE.md
  docs/ (SPEC, BRAND, DECISIONS, PROMPTS, PROGRESS)
  packages/
    shared/   src/{schemas,events,constants,types}.ts
    server/   src/{main.ts,app.ts,config.ts,db/,auth/,rooms/,messages/,uploads/,admin/,backup/,updates/}
              migrations/0001_init.sql ...
              test/
    desktop/  src/main/{index.ts,host.ts,tray.ts,deeplink.ts,ipc.ts,secure-store.ts,updater.ts}
              src/preload/index.ts
              src/renderer/{app/,features/{rooms,messages,composer,members,admin,settings,onboarding}/,
                            ui/,styles/tokens.css,i18n/{pt-PT,en}.json}
              src/assets/brand/ (logo.svg supplied by owner; Raleway font files)
              e2e/
  pnpm-workspace.yaml
```

---

## 5. Data model (SQLite)

All IDs are **ULIDs** (sortable, generated server-side). Timestamps are server UTC ms.

```sql
users        (id PK, display_name, avatar_file_id NULL, role CHECK(role IN('host','admin','member')),
              status_text NULL, locale NULL, created_at, revoked_at NULL)
devices      (id PK, user_id FK, token_hash UNIQUE, label, last_seen_at, created_at, revoked_at NULL)
invites      (id PK, code_hash UNIQUE, created_by FK users, intended_name NULL, max_uses DEFAULT 1,
              uses DEFAULT 0, expires_at, created_at, revoked_at NULL)
invite_redemptions (invite_id FK, user_id FK, device_id FK, redeemed_at)
rooms        (id PK, slug UNIQUE, name, emoji NULL, description NULL, is_main INTEGER DEFAULT 0,
              created_by FK, created_at, archived_at NULL)
messages     (id PK, room_id FK, user_id FK, body TEXT, reply_to_id NULL FK messages,
              created_at, edited_at NULL, deleted_at NULL)
attachments  (id PK, message_id FK NULL, uploader_id FK, kind CHECK(kind IN('image','file')),
              mime, size, sha256, original_name, path, thumb_path NULL, width NULL, height NULL, created_at)
reactions    (message_id FK, user_id FK, emoji, created_at, PRIMARY KEY(message_id,user_id,emoji))
read_state   (user_id FK, room_id FK, last_read_id, PRIMARY KEY(user_id,room_id))
room_prefs   (user_id FK, room_id FK, notify CHECK(notify IN('all','mentions','none')) DEFAULT 'mentions',
              hidden INTEGER DEFAULT 0, PRIMARY KEY(user_id,room_id))
mentions     (message_id FK, user_id FK, PRIMARY KEY(message_id,user_id))
settings     (key PK, value JSON)
messages_fts (FTS5 virtual table over messages.body, content='messages', content_rowid='rowid')
```
- Seed migration creates `#geral` with `is_main = 1`.
- Indexes: `messages(room_id, id)`, `messages(user_id)`, `devices(token_hash)`, `attachments(message_id)`.
- Orphan attachments (uploaded, never attached to a message) are deleted after 24h.

---

## 6. Protocol

### 6.1 HTTP (Fastify)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | `{ ok, version, name }` |
| POST | `/api/join` | invite code | Redeem invite → creates user+device → returns device token (once) |
| POST | `/api/uploads` | device token | Multipart upload → attachment record (unattached) |
| GET | `/files/:id` | signed URL | Serve original/thumb. URL is HMAC-signed, expires in 1h |
| GET | `/updates/*` | none | Static installer files + `latest.yml` for electron-updater |
| * | `/api/admin/*` | token + role | Admin endpoints (or do admin over socket; pick one and be consistent) |

### 6.2 Socket.IO
- Handshake: `auth: { token }`. Server hashes and looks up device; rejects revoked. Sets `socket.data.userId`.
- Every client→server event uses an **ack callback** returning `{ ok: true, data } | { ok: false, error: { code, message } }`.
- All payloads are zod-validated (schemas in `shared/src/events.ts`).

Client → server:
`rooms:list`, `rooms:create {name, emoji?, description?}`, `rooms:update {roomId, ...}`, `rooms:archive {roomId}`,
`messages:history {roomId, before?, limit≤50}`, `messages:send {roomId, tempId, body, replyToId?, attachmentIds[]}`,
`messages:edit {messageId, body}`, `messages:delete {messageId}`, `reactions:toggle {messageId, emoji}`,
`typing {roomId}`, `read:mark {roomId, messageId}`, `prefs:update {roomId, notify?, hidden?}`,
`search {q, roomId?, authorId?, hasFile?, before?}`, `members:list`

Server → client:
`message:new`, `message:updated`, `message:deleted`, `reaction:updated`, `room:created`, `room:updated`,
`room:archived`, `presence {userId, online}`, `typing {roomId, userId}`, `member:updated`, `session:revoked`

- Server-side rate limits per device: `messages:send` 10/10s, `typing` 1/2s, `rooms:create` 5/hour,
  `/api/join` 5/min per IP, uploads 30/10min.
- Reconnection: client resumes and calls `messages:history` with `after = lastSeenId` per open room to fill gaps.

---

## 7. Security

1. **The installer is not the lock.** Anyone can be forwarded the `.exe`. Only a valid invite gets in.
2. **Invites:** 128-bit random code, stored hashed, expiry required, max uses default 1. Invite string
   format: `pausa1.<base64url(JSON{u: serverUrl, c: code, n?: name})>`. Deep link `pausa://join?i=<that string>`.
3. **Device tokens:** 256-bit random, returned once, stored hashed. Revocation → immediate disconnect
   via `session:revoked`. Optional token rotation on each launch [OPEN].
4. **Transport:** TLS required for anything beyond localhost/LAN. With a Cloudflare Tunnel, TLS is handled
   by Cloudflare. Plain `ws://` is allowed only for `127.0.0.1` and explicitly enabled LAN mode.
5. **Electron hardening:** see CLAUDE.md rule 2. Plus: `app.requestSingleInstanceLock()`, register
   `pausa://` protocol, validate deep-link payloads with zod, disable devtools in production builds.
6. **Link unfurling (if built):** server-side fetch only; resolve DNS and **block private/loopback/link-local
   ranges** (incl. IPv6) after every redirect; max 3 redirects, 5s timeout, 512 KB body cap, `text/html` only,
   parse OG tags only; cache results 24h. Fetch preview images through the same guard and store them.
7. **Uploads:** magic-byte MIME check, blocked-extension list, size cap, random filenames on disk
   (never the user's), served with `Content-Disposition: attachment` for non-images and `X-Content-Type-Options: nosniff`.
8. **Logging:** no message bodies or tokens in logs. Log auth failures with device ID/IP.
9. **Privacy (GDPR):** the host is the data controller for colleagues' personal data. Ship a short privacy
   note in-app (what's stored, where, how long, who can see it), "delete my account" (anonymizes the
   user's messages to "Former member", deletes avatar), and a documented retention setting.

---

## 8. Reliability and operations

- SQLite in WAL mode; `PRAGMA foreign_keys=ON`; busy timeout 5s.
- Backups: `VACUUM INTO` / better-sqlite3 `.backup()` to `backups/YYYY-MM-DD.sqlite` + uploads manifest; keep N.
- Host PC sleep: when hosting, use Electron `powerSaveBlocker` (`prevent-app-suspension`) while the server runs;
  show a banner: "Your PC is the server. If it sleeps, everyone goes offline."
- Health indicator in client header: connected / reconnecting / server offline (with last-seen time).
- Target capacity: 150 members, 50 concurrent, single Node process. Verify with a load script.

---

## 9. Distribution

- Windows: NSIS installer, per-user install (no admin rights needed), app ID `pt.costa.pausa` [OPEN: final ID].
- **Code signing [OPEN]:** unsigned installers trigger Windows SmartScreen warnings and may be blocked on
  managed corporate laptops. Decide before rolling out beyond friends-and-family testing.
- Auto-update: electron-updater `generic` provider → `https://<server>/updates/`. The host uploads a new
  build into the server's `updates/` folder via the admin panel (or copies it in).
- macOS (later): dmg, requires Apple Developer ID signing + notarization.

---

## 10. Acceptance for v1

- [ ] 10 people on 10 machines chat for a week with no lost messages
- [ ] A revoked member is disconnected within 2s and can't reconnect
- [ ] A forwarded installer without an invite cannot read or post anything
- [ ] Host PC reboot: clients show "offline" and auto-reconnect when the host comes back, history intact
- [ ] Backup restored onto a fresh machine reproduces all rooms, messages, files
- [ ] UI passes the BRAND.md checklist and WCAG AA contrast on all text
