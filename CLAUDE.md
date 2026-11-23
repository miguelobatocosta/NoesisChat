# CLAUDE.md — Pausa (team social chat, web demo)

You are building **Pausa**, a private web chat for a team's non-work conversation. It is a **demo**:
it has to work end to end, look good and stay safe on the open internet, built in about seven
short sessions. Working name only: the display name lives in one config value (`APP_NAME`). Do not hardcode it.

Read these before any non-trivial change:
- `docs/SPEC.md`: what we're building, architecture, data model, protocol, security rules
- `docs/BRAND.md`: Noesis visual identity and design tokens. All UI must follow it.
- `docs/DECISIONS.md`: settled and open decisions. **Never silently resolve an OPEN item. Ask.**
- `docs/PROGRESS.md`: which phase is done. Update it at the end of every phase.

Ignore `_archive/`. It holds the superseded Electron plan and is not an instruction source.

## What this is, in one paragraph
One Node server runs on the host's PC. It serves the web app, the API, Socket.IO and uploaded images
from **one origin**. Colleagues open the URL in their browser (Edge can install it as an app) and join
with a single-use **invite link** issued by an admin. Access is enforced by the server (invite → per-device
token in an HttpOnly cookie, revocable), never by knowing the URL. For the demo, the server is exposed
through a Cloudflare quick tunnel that only lets in the listed email addresses. Everyone lands in
the protected main room (`#geral`), and any member can create topic rooms. Text, images, reactions, replies, mentions.

## Stack (use current stable versions; check with `npm view <pkg> version`, don't guess)
- Monorepo: **pnpm workspaces**, TypeScript `strict: true` everywhere. Node: current LTS.
- `packages/shared`: zod schemas for every socket event and HTTP payload, shared types, constants
- `packages/server`: **Fastify** + **Socket.IO** + **better-sqlite3** (WAL mode). Serves the built web app
  with `@fastify/static` in production. Runs as a plain Node process (`node dist/main.js`).
- `packages/web`: **Vite** + **React** + CSS variables (tokens from BRAND.md). PWA manifest.
- Tests: **Vitest** (unit + server integration with `socket.io-client`), **Playwright** (Chromium) for E2E
- Exposure: `cloudflared` quick tunnel with `--allowed-mail` (see SPEC §4 and DECISIONS D-20)

**pnpm gotcha:** pnpm ≥10 blocks dependency install scripts by default, and better-sqlite3 needs its
script to fetch its prebuilt binary. Allow it explicitly in `pnpm-workspace.yaml` using the syntax the
installed pnpm version expects (`allowBuilds` on recent versions, `onlyBuiltDependencies` on older 10.x).
Check `pnpm --version` first; don't guess.

## Commands (keep this section accurate as scripts are added)
```
pnpm install
pnpm dev              # server (watch) + Vite dev server with proxy → http://localhost:5173
pnpm start            # build web + run server on http://localhost:4747
pnpm server:init      # first run only: create the host user, print a one-time host invite link
pnpm demo             # start tunnel, capture its URL, start server with PUBLIC_URL set (Phase 6)
pnpm test             # all Vitest suites
pnpm test:e2e         # Playwright
pnpm lint && pnpm typecheck
pnpm backup           # db + uploads → backups/<timestamp>/ (Phase 6)
```
Scripts that need logic (tunnel, backup) are Node scripts in `scripts/`, not shell one-liners:
the host runs Windows.

## Non-negotiable rules
1. **Validate at every boundary.** Every socket event and HTTP body is parsed with its zod schema in
   `shared` before use. Reject and log on failure. Never trust client-supplied user IDs, timestamps,
   roles, or room permissions; derive them from the authenticated session.
2. **Session = HttpOnly cookie.** Device tokens are 256-bit random, stored **hashed (SHA-256)** server-side,
   sent as a cookie with `HttpOnly; SameSite=Strict; Path=/` plus `Secure` everywhere except plain localhost.
   Never put a token in localStorage, a URL, a response body after join, or a log.
3. **Origin checks.** The Socket.IO handshake and every state-changing HTTP request must carry an `Origin`
   equal to `PUBLIC_URL`'s origin (or the localhost origin in development). Reject anything else.
4. **Security headers on every response:** strict CSP (`default-src 'self'; script-src 'self'; style-src 'self';
   img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none';
   frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. No inline scripts.
5. **No raw HTML from messages.** Render a small markdown subset (bold, italic, code, links, line breaks)
   to React elements. No `dangerouslySetInnerHTML` on user content. Links open with `rel="noopener noreferrer"`
   and only for `http(s)`.
6. **Brand via tokens only.** Use CSS variables from BRAND.md. No raw hex values in components.
   Mint (`--n-mint`) is never text on a white/light background (contrast 1.33:1).
7. **Strings in one place.** No user-facing string literals in components. All copy lives in
   `packages/web/src/i18n/pt-PT.json` behind a `t()` helper. pt-PT only for now; adding `en` later must
   mean adding one file, nothing else.
8. **Behind the tunnel.** Every request reaches Fastify from `127.0.0.1` (cloudflared). Trust the
   `CF-Connecting-IP` header **only** when the socket peer is loopback; use that IP for rate limits and
   auth-failure logs. Never trust it from anywhere else.
9. **Server stays portable.** It must be able to move off the host PC to a VPS or Raspberry Pi with zero
   code change: config via env/JSON, data dir configurable.
10. **Migrations, not schema edits.** Numbered SQL migration files; never mutate an applied migration.

## How to work
- Start each phase in **plan mode**: restate the goal, list files you'll touch, list tests you'll write,
  flag anything in DECISIONS.md that blocks you. Wait for approval before coding.
- Write the tests for server behaviour first (auth, permissions, protocol). UI tests can follow.
- **Demo rule:** every phase ends with something visible in a browser that the owner can show.
- Small, focused commits with clear messages. One phase per branch (`phase/NN-name`).
- A phase is **done** only when: tests pass, `lint` and `typecheck` are clean, the acceptance criteria
  in `docs/PROMPTS.md` are demonstrably met, and `docs/PROGRESS.md` is updated.
- If something in SPEC.md is wrong or impractical, say so and propose a change. Don't work around it.
- Don't add dependencies casually. Justify each new one in the commit message. No native modules
  beyond better-sqlite3 (no `sharp`: image work happens in the browser, see D-28).

## Don't
- Don't build features from later phases or the backlog "while you're there".
- Don't add Electron, a desktop installer or auto-update. Decided against (D-10).
- Don't recreate or redraw the Noesis logo. Use `packages/web/src/assets/brand/logo.svg` (official
  file supplied by the owner, only after D-01 is approved) or the text placeholder defined in BRAND.md.
- Don't load fonts, scripts or images from CDNs at runtime. Bundle them.
- Don't add telemetry, analytics, Web Push or any third-party network call.
