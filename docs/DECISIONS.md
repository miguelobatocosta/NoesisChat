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
**Now (2026-11-27, D-50):** named tunnel on the owner's domain + Cloudflare Access (One-time PIN, company
domain). Same address across restarts. The quick tunnel above stays as the fallback when `TUNNEL_NAME` is unset.
**Never:** router port forwarding.

### D-21 · Code signing: NOT APPLICABLE (no installer)
### D-22 · Target platforms: desktop browsers (Edge, Chrome, Firefox; Safari best effort) and phones ≥ 360px wide (2026-11-27: below 768px the sidebar is a drawer)
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

---

## Made while building (2026-11-23, all six phases in one session at the owner's request)

### D-39 · Toolchain pins
TypeScript **6.0.3**, not 7: typescript-eslint supports `<6.1`. ESLint **10** without `eslint-plugin-react`
(no ESLint 10 support); the "no hardcoded UI text / no raw colours / no raw HTML" rules are core
`no-restricted-syntax` selectors instead. pnpm **12.23**, pinned in `packageManager`. Revisit when
typescript-eslint supports TS 7.

### D-40 · APP_NAME is one constant in `packages/shared/src/constants.ts`, not an env variable
The web app needs it at build time (title, manifest, header); an env value would need an extra endpoint.
Still one place to change it.

### D-41 · No dev-user seam
Auth was built in the same session as the server core, so the UI was developed against real invites
from the start. Nothing to delete later.

### D-42 · No service worker
Chrome/Edge allow "Install app" from the menu without one since version 112. Without it there's no stale
cached app and nothing cached at all. Web Push stays out (D-37).

### D-43 · `GET /api/session` always answers 200 (`user: null` when signed out)
A 401 on every signed-out visit shows up as a console error; this keeps the console clean and the
E2E "no errors" check meaningful.

### D-44 · Revoked members stay in `members:list` with `active: false`
So their old messages keep a name. The sidebar and admin panel only show active members.

### D-45 · One `message:updated` event for edits, deletes and reaction changes
Each carries the full message and its new `seq`; the client has one code path. Replaces the separate
`message:deleted` / `reaction:updated` events in the first SPEC draft.

### D-46 · New UI dependencies
`react-virtuoso` (reverse-scrolling chat list with prepend anchoring; hand-rolling that is the classic
bug farm), `lucide-react` (the one outline icon set BRAND.md §5 asks for), `@axe-core/playwright`
(automated contrast checks). Server: `socket.io`, `ulid` (monotonic IDs), `@fastify/multipart`.

### D-47 · Join rate limit is configurable (`JOIN_RATE_PER_MIN`, default 5)
Only so the E2E suite can create many users from one IP. Never raise it in production.

## Owner requests after the build

### D-48 · Apple-style refresh inside the Noesis brand: SETTLED (2026-11-23, owner)
The owner asked for a more premium look following Apple's design guidelines and no circles around text.
Kept: Noesis colours and Raleway (SF Pro's licence only allows Apple platforms). Removed: avatars with
initials, pills and badges (unread count is a plain number, mention is an "@", connection status is text),
borders on buttons/fields/cards. Added: softer corners (8/12/16), layered shadows, translucent materials,
spring easing. The focus ring stays for keyboard users only (`:focus-visible`): removing it entirely fails
WCAG 2.4.7 and the axe check. BRAND.md §3–5 updated. Also fixed `brand.test.ts`, whose dark-theme contrast
checks were silently testing the light values.

### D-49 · Room mascots that talk: SETTLED (2026-11-23, owner)
Every room has a mascot with a funny personality: Dona Lurdes (#geral, gossiping pigeon), Bolacha (greedy
dachshund), Faísca (squirrel on caffeine), Sr. Ferreira (slow, wise tortoise), Pixel (sarcastic tech octopus),
Nuvem (lazy cat). Original SVG drawings in `features/mascots/Mascot.tsx`, coloured by `--mascot-*` tokens.
- **Server-side bot users** with fixed IDs (`MASCOTS` in shared constants), `users.is_bot = 1`, no devices.
  Created at startup by `ensureMascots()`; migration 0002 adds `is_bot`, `rooms.mascot_key`, `rooms.mascot_enabled`.
- **They post through `sendMessage()`** and the normal `message:new` broadcast, so sync, unread and replies need
  nothing new. Triggers: an @mention of any mascot or the room mascot's name (always answers, 10 s cooldown per
  person), keywords of its personality (35% chance, once a minute per room), and an introduction in a new room.
  Never reacts to a bot, so mascots can't loop.
- **Scripted lines, no LLM**: `packages/server/src/mascots/lines.pt-PT.json`. No network calls.
- Can't be revoked or promoted; whoever manages a room can change its mascot or switch it off.
- `MASCOT_DELAY_MS` (default 1200) and `MASCOT_CHANCE` (default 0.35) exist for tests, like D-47.
- BRAND.md §5's "no stock illustrations" still holds: these are the app's own characters, used in the room
  header, the empty state, next to their messages and in room settings.

### D-50 · Fixed address on the owner's domain, invite survives the email gate: SETTLED (2026-11-27, owner)
- `pnpm demo` runs the named tunnel `pausa` → the owner's subdomain (kept in `.env`, not in the repo) when `TUNNEL_NAME`/`TUNNEL_URL`
  are in `.env`; otherwise the quick tunnel as before. This is backlog item 1 for the demo, without a Windows
  service yet. The email gate is a Cloudflare Access application (One-time PIN, `@noesis.pt`). The script
  refuses to stay up if `/api/session` doesn't bounce to Cloudflare's login.
- Cloudflare's login round trip drops the `#code`, so invitees had to open their link twice. Fix:
  `/join` + `/invite-handoff.js` bypass Access, and the script hands the code to `/` through that tab's
  `sessionStorage`. The code still never reaches a server or Cloudflare log. `sessionStorage` is per tab and
  cleared when the tab closes. It holds an invite (single use, expiring), never a device token (rule 2 holds).
- The bypassed paths serve only the static app shell and the script; every API, socket and file route stays
  behind the gate. The app was already safe with the outer wall removed (SPEC §7.1).

### D-51 · Mascots moderate conversation topics: SETTLED (2026-11-27, owner)
- 15 topics (seeded from `packages/server/src/moderation/topics.pt-PT.json`, then owned by the admin portal:
  edit and switch off, never add or delete). Each has keywords, a label, `labelAt` (default 15), `muteAt`
  (default 30) and `muteHours` (default 24), plus optional custom lines for warning, label and mute.
- At most one strike per topic per message, counted per person × room × topic, same matching as the mascots
  (whole words, accent- and case-insensitive). Mascots never count; rooms with the mascot off or archived don't count.
- Label: public, shown as plain text next to the name in that room (no pill, D-48), announced by the room's mascot.
  Warning 5 strikes before the mute. Mute: can read, can't send or edit there (`MUTED`); reactions allowed.
  **Never a mute in #geral** (D-17): labels only. Same rules for everyone, admins included.
- A mute ends after its hours or when an admin lifts it; either way that topic's strikes in that room reset,
  so its label goes too. Admins can also reset strikes. Mascot mutes, lifts, resets and topic edits are in `admin_log`.
- Stated in the house rules shown at join (`rules.rule4`).

### D-52 · Sign in with the Noesis email, no invite; admin only for the owner: SETTLED (2026-11-27, owner)
- Behind Cloudflare Access, every gated request carries a signed JWT (`Cf-Access-Jwt-Assertion`). The server
  verifies it itself (RS256 only, the team's published keys, `iss`, `aud` = the Pausa app's AUD tag,
  `exp`/`nbf`/`iat` with 60 s leeway, email domain) in `packages/server/src/auth/access.ts`. No new dependency.
- **Network exception to CLAUDE.md:** fetching `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`
  (cached 1 h). If it fails, email sign-in waits; invites keep working.
- A verified email with no account picks a name and joins as a **member**. A known email signs in on any
  browser. Accounts made with an invite get their email linked on the next verified visit (never an email
  someone else has, never the owner email unless it's the host). Revoked accounts stay out.
- `OWNER_EMAIL` is the only email that becomes host (it attaches to the existing host). Email sign-in
  never grants admin to anyone else; the host can still promote someone by hand in the admin portal.
- Off unless `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are set (local, quick tunnel, tests): invites only.

### D-53 · Cakes: milestones, birthdays, guests, Excel import: SETTLED (2026-11-27, owner)
- `people` = every member plus **guests** (names who don't use Pausa); admins merge a guest into an account later.
- A milestone anyone records is **pending** until someone else (or an admin) confirms; declaring your own
  counts at once. Birthdays (day + month) create a debt on the day at 09:00, once a year, with congratulations.
- Paying: the debtor promises a day ("Levo eu"); **someone other than the debtor** (or an admin) confirms
  "Trouxe ✔". Admins cancel confirmed debts; the recorder cancels while pending.
- The #geral mascot announces milestones, confirmations, promises, birthdays and paid cakes, mentioning
  members (browser notification), with interactive cards (`messages.card`) rendered from live state.
- Import: the admin pastes the Excel sheets ("Bolos Outros", "Aniversários"); names match by `nameKey`,
  others become guests; "Ok" = paid. Importing twice doesn't duplicate. Visible to every member (D-16).

### D-54 · Office days: weekly vote, check-in, no-shows: SETTLED (2026-11-27, owner)
- Vote for next week opens **Friday 12:00** (Mon–Fri, several choices) and closes **Monday 10:00**: most votes
  wins; a tie goes to Wednesday if it's among the tied days, else the earliest; no votes → Wednesday. Only weeks
  whose vote was opened are decided (a first start mid-week never invents a day). Admins can move the day or
  add an extra one.
- People say "Vou" / "Não vou (porquê)"; "Não vou" said before the day is **advance notice**. On the day,
  "Estou cá"; someone who's there (or an admin) marks others; the absent explain themselves.
- At the end of the day: notice → justified, an excuse → pending (an admin judges), nothing → unjustified.
  **N unjustified absences (default 3, admin setting) = one cake**, then the count starts again.
- Day before at 12:00, if nobody promised a cake, the oldest debt among those going is **nominated**; 17:00
  reminder; 08:00 card with "Estou cá". All posted by the #geral mascot as live cards. Promised cakes that
  didn't arrive go back to the queue.
- Imported "Presenças" history is closed and never counts towards a no-show cake. Guests can be in the team.

### D-55 · Mascot personalities and names: SETTLED (2026-11-27, owner)
- Six archetypes, same drawings: **Dona Lurdes** (pomba, mãe implicativa, voice of #geral), **Avó Dores**
  (tartaruga, avó fofinha), **Nuvem** (gato, resmungão), **Faísca** (esquilo, alegre e hiperentusiasta),
  **Bolacha** (cão, contente bonacheirão), **Tio Pixel** (polvo, tio das piadas secas).
- Behaviour, not just lines (`packages/server/src/mascots/personalities.ts`): keyword chance multiplier, typing
  delay, the cat may ignore a mention (or just "…"), and an in-character emoji reaction at most once per
  10 min per room (off when `MASCOT_CHANCE=0`).
- #geral announcements (cakes, office) speak in the voice of #geral's current mascot; missing lines fall back
  to Dona Lurdes.
- **Only the host renames mascots** (Admin → Mascotes). A renamed mascot answers to its new name; names stay
  unique like people's. Migration 0008 moves only untouched defaults (Sr. Ferreira → Avó Dores, Pixel → Tio Pixel).

### D-56 · Fun pages, top-bar search, mascots that know the cake book: SETTLED (2026-11-27, owner)
- Bolos and Escritório are led by the #geral mascot with a live speech bubble in its voice (`bubble.*`), big
  display numbers, a debt "freshness" bar (`--stale-1..4`: acabadinho de sair → património nacional), a ticket
  for the next cake, a podium, the week as five vote columns, today's headcount, a featured excuse. A one-second
  CSS cake shower on "Trouxe ✔" (off under reduced motion). Recording a milestone moved to a dialog.
- Top bar: message search in the middle (typing opens the search with the text), the 🏢 Vou / Não vou shortcut
  for the next office day, and the connection status only when there's a problem.
- Called or mentioned with a known question ("quem deve mais bolos?", "quem trouxe mais?", "quantos devo?",
  "quando é o escritório?", "quem leva bolo?"), a mascot answers from the real data, in its own voice.
