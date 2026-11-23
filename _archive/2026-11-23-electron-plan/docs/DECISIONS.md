# DECISIONS.md

Claude Code: treat **SETTLED** items as constraints. For **OPEN** items, use the stated default only
where marked "safe default", otherwise stop and ask the owner. Record every resolution here with a date.

---

## Blockers (resolve before Phase 10 / any distribution beyond your own machines)

### D-00 · IT approval: **OPEN, BLOCKER**
Installing an unapproved, possibly unsigned `.exe` on company-managed laptops, which then talks to a server
on a personal PC, will likely breach IT policy and may be blocked by endpoint security or the corporate proxy.
**Action (owner):** confirm with Noesis IT whether colleagues' machines are managed, whether installs are allowed,
and whether outbound WebSocket to an external domain works from the corporate network.
If the answer is no, the realistic paths are: (a) colleagues use personal machines, (b) IT sanctions it,
(c) don't build a desktop client: use a Teams team / Viva Engage community instead.

### D-01 · Brand usage approval: **OPEN, BLOCKER for distribution**
Using the Noesis identity on an unofficial app implies endorsement. **Action:** get Marketing's OK and the
official logo files/guideline. Until then, build with the tokens in BRAND.md and the text placeholder.

---

## Settled

### D-10 · Electron (not Tauri): SETTLED
Tauri gives much smaller installers but adds Rust plus a separate Node sidecar for the embedded server.
Electron keeps one language (TypeScript) across server and client, embeds the Node server natively, and
has mature packaging and auto-update. Installer size (~100 MB) is acceptable for an internal tool.

### D-11 · One codebase, one installer, two modes (host/join): SETTLED
### D-12 · Server package is Electron-free and runs standalone: SETTLED
So it can move to a VPS/Raspberry Pi without code changes when "my PC" stops being good enough.
### D-13 · SQLite (better-sqlite3, WAL) + files on disk: SETTLED
Right-sized for ≤150 users. No external DB to install.
### D-14 · Socket.IO for realtime: SETTLED
Rooms, acks, reconnection and fallbacks for free. Raw `ws` isn't worth the hand-rolled plumbing here.
### D-15 · Access = server-side invites → hashed, revocable per-device tokens: SETTLED
Possession of the installer grants nothing.
### D-16 · All rooms visible to all members in v1: SETTLED
### D-17 · `#geral` is the protected default room: SETTLED
Name configurable (`#general` if the team is international).

---

## Open

### D-20 · How colleagues reach the host: OPEN (recommendation: Cloudflare Tunnel)
| Option | Colleague setup | TLS | Works off-site | Notes |
|---|---|---|---|---|
| **Cloudflare Tunnel** (named, on a domain you own) | none | ✅ | ✅ | Outbound-only from host, no port forwarding. Needs a domain on Cloudflare. Public URL, so app auth must be solid (it is). |
| Tailscale | install Tailscale + join tailnet | ✅ (WireGuard) | ✅ | Strongest isolation; extra install on corporate laptops is often forbidden. Check plan limits for your team size. |
| LAN only | none | ❌ unless self-signed | ❌ | Only if everyone is on the same network. Corporate Wi-Fi often isolates clients. |
| Router port forward | none | needs certs | ✅ | Exposes your home IP. Don't. |
Safe default for development: localhost + LAN. Production choice must be made by the owner.

### D-21 · Code signing: OPEN
Unsigned → SmartScreen "Windows protected your PC" warning on every new install; managed laptops may block.
Options: OV/EV certificate (yearly cost), a cloud signing service if eligible, or accept warnings for a pilot.
Build pipeline must have a signing hook that is a no-op when no cert is configured.

### D-22 · Target OSes: OPEN (safe default: Windows only for v1)
macOS requires Apple Developer ID signing + notarization (needs a paid Apple Developer account).

### D-23 · Where the server lives long-term: OPEN
"My PC" means downtime whenever it sleeps, reboots, updates or travels. Plan B: same server on a small VPS or
a Raspberry Pi at home. Decide after the pilot; code already supports it (D-12).

### D-24 · Team size and locale: OPEN (safe default: up to 150 users; pt-PT + en)

### D-25 · App name, app ID and icon: OPEN (working name "Pausa", ID `pt.costa.pausa`)

### D-26 · DMs: OPEN (safe default: not in v1)

### D-27 · Message retention: OPEN (safe default: keep forever, host can set N days later)

### D-28 · Strip EXIF/GPS from original images: OPEN (safe default: strip GPS, keep orientation)

### D-29 · Device token rotation: OPEN (safe default: no rotation; revocation is enough for v1)

### D-30 · Link previews: OPEN (safe default: build in Phase 7 behind a host setting, off by default)
