# DECISIONS.md

Claude Code: treat **SETTLED** items as constraints. For **OPEN** items, use the stated default only
where marked "safe default", otherwise stop and ask the owner. Record every resolution here with a date.

On 2026-11-23 the owner reframed the project as a **demo of how quickly this can be built** and delegated
the open questions. Everything marked "(2026-11-23)" below was decided on that basis.

---

## Open: owner action needed

### D-00 · Corporate network check: **OPEN, must pass before the demo**
Resolved in part (2026-11-23): nothing gets installed on anyone's machine. Colleagues use a browser, so
installing software on managed laptops is no longer a question.
**Still to check (owner, about 5 minutes):** from a colleague's managed laptop on the office network, open
any `*.trycloudflare.com` URL. Corporate web filters often block that domain because attackers abuse it.
If it's blocked, the fix is the backlog's named tunnel on your own domain (D-20), which filters treat like any other site.
**Before anything beyond the demo:** give Noesis IT a heads-up. It's a personal server holding colleagues' data.

### D-01 · Brand usage approval: **OPEN, blocker for anything beyond an internal demo**
Using the Noesis identity on an unofficial app implies endorsement. Until Marketing approves: tokens from
BRAND.md and the text placeholder only, no official logo, no Noesis logo as the app icon, internal demo only.

---

## Settled

### D-10 · Web client, not Electron: SETTLED (2026-11-23, supersedes "Electron, not Tauri")
A browser client removes the installer, code signing, SmartScreen warnings, IT install approval,
auto-update and the native-module rebuild for Electron. It also removes the worst risk in the old design:
a compromised server pushing unsigned native code to every colleague's machine through auto-update.
Accepted loss: notifications only while the tab/PWA window is open; no tray icon.

### D-11 · One server, browser clients, no embedded host mode: SETTLED (2026-11-23, supersedes "two modes")
The server is a plain Node process started from a terminal (`pnpm start` / `pnpm demo`). The host bootstraps
with `pnpm server:init` and joins through the browser like everyone else.

### D-12 · Server runs standalone and portable: SETTLED
So it can move to a VPS/Raspberry Pi without code changes.
### D-13 · SQLite (better-sqlite3, WAL) + files on disk: SETTLED
### D-14 · Socket.IO for realtime: SETTLED
### D-15 · Access = server-side invites → hashed, revocable per-device tokens: SETTLED
Delivered as an HttpOnly cookie (2026-11-23). Knowing the URL grants nothing.
### D-16 · All rooms visible to all members in v1: SETTLED
### D-17 · `#geral` is the protected default room: SETTLED

---

## Resolved (2026-11-23)

### D-20 · How colleagues reach the host
**Demo:** Cloudflare quick tunnel, `cloudflared tunnel --url http://localhost:4747 --allowed-mail '<list>'`.
No Cloudflare account or domain needed. Restrict to the chosen colleagues' addresses (or `'*@<domain>'`);
the allow-list lives in `.env` as `ALLOWED_MAIL`. Confirm the company email domain before using a wildcard.
Known limits: the URL changes on every tunnel restart (everyone has to rejoin, because cookies belong to
the old hostname), no uptime guarantee, 200 in-flight requests, interactive browsers only.
**Pilot longer than a day:** domain on Cloudflare (~€10/yr) + named tunnel as a Windows service + Cloudflare
Access with the same email rule. Backlog item 1.
**Never:** router port forwarding.

### D-21 · Code signing: NOT APPLICABLE (no installer)
### D-22 · Target platforms: desktop browsers (Edge, Chrome, Firefox; Safari best effort), width ≥ 960px
### D-23 · Where the server lives: the host's PC for the demo. Move to a VPS/RPi if the pilot continues (zero code change).
### D-24 · Size and locale: pilot 10–20, design ceiling 50. pt-PT only; all strings in one file so `en` is a drop-in.
### D-25 · App name, icon: working name "Pausa"; generic placeholder icon. **Final name/icon still OPEN** (needs D-01).
### D-26 · DMs: not in v1.
### D-27 · Retention: keep forever. Delete wipes content (D-34).
### D-28 · Image metadata: the browser re-encodes JPEG/PNG before upload (strips EXIF incl. GPS, keeps orientation).
GIF/WebP as-is. No server-side image library (keeps native modules to better-sqlite3 only).
### D-29 · Device token rotation: no. Revocation is enough.
### D-30 · Link previews: backlog.

### D-31 · Admin transport: Socket.IO
One auth path. HTTP is used only for join, logout, uploads and files.

### D-32 · Mentions and names
Mentions are stored as `<@USER_ULID>` tokens, never by display name. Display names are unique after
normalization (NFKC, lowercase, trimmed). An invite with an intended name locks that name.

### D-33 · Reconnect sync: per-message change sequence
Every mutation bumps `messages.seq` from a global counter; clients catch up with `messages:sync {sinceSeq}`.
Gap-filling with "messages after the last one I saw" would silently miss edits, deletes and reactions.

### D-34 · Edit and delete semantics
No edit history kept. Delete wipes the body and attachments and leaves a tombstone.

### D-35 · Second device: backlog (design: one-time link code from a signed-in device, 10 min expiry)

### D-36 · Moderation
Admins can delete any message. Every admin action goes to `admin_log`. House rules and a privacy note are
shown on join, stating plainly that the host can read everything.

### D-37 · Notifications: browser Notification API while open. No Web Push (third-party push services).

### D-38 · Idempotent sends
The server dedupes `messages:send` on `(user_id, client_id)` so retries after a dropped ack never duplicate.
