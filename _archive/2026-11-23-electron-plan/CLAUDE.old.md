# CLAUDE.md — Pausa (team social chat)

You are building **Pausa**, a private desktop chat app for a team's non-work conversation.
Working name only: the display name lives in one config value (`APP_NAME`). Do not hardcode it.

Read these before any non-trivial change:
- `docs/SPEC.md`: what we're building, architecture, data model, protocol, security rules
- `docs/BRAND.md`: Noesis visual identity and design tokens. All UI must follow it.
- `docs/DECISIONS.md`: settled and open decisions. **Never silently resolve an OPEN item. Ask.**
- `docs/PROGRESS.md`: which phase is done. Update it at the end of every phase.

## What this is, in one paragraph
One machine (the **host**) runs the server. Colleagues install a desktop **client** and join
with a single-use **invite** issued by the host. Access is enforced by the server (invites → per-device
tokens, revocable), never by possession of the installer. Everyone lands in the protected main room
(`#geral`) and any member can create topic rooms. Text, images, files, reactions, replies, mentions.

## Stack (use current stable versions; check with `npm view <pkg> version`, don't guess)
- Monorepo: **pnpm workspaces**, TypeScript `strict: true` everywhere
- `packages/shared`: zod schemas for every socket event and HTTP payload, shared types, constants
- `packages/server`: Node + **Fastify** + **Socket.IO** + **better-sqlite3** (WAL mode). Must run
  both **embedded** in the desktop host and **standalone** (`node dist/main.js`). No Electron imports.
- `packages/desktop`: **Electron** + **electron-vite** + **React** + CSS variables (tokens from BRAND.md)
- Packaging: **electron-builder** (NSIS for Windows first; dmg later). Auto-update via electron-updater
  `generic` provider pointed at the host server's `/updates` route.
- Tests: **Vitest** (unit + server integration with `socket.io-client`), **Playwright** `_electron` for E2E

## Commands (keep this section accurate as scripts are added)
```
pnpm install
pnpm dev              # desktop app in dev, host mode, server embedded
pnpm dev:server       # standalone server on :4747
pnpm test             # all Vitest suites
pnpm test:e2e         # Playwright Electron tests
pnpm lint && pnpm typecheck
pnpm build:win        # NSIS installer -> packages/desktop/dist
```

## Non-negotiable rules
1. **Validate at every boundary.** Every socket event and HTTP body is parsed with its zod schema in
   `shared` before use. Reject and log on failure. Never trust client-supplied user IDs, timestamps,
   roles, or room permissions; derive them from the authenticated socket.
2. **Electron security baseline:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
   strict CSP, a minimal typed `preload` bridge, all IPC inputs validated, block `will-navigate` and
   `window.open`, open external links only via `shell.openExternal` for `http(s)` after validation.
3. **No raw HTML from messages.** Render a small markdown subset (bold, italic, code, links, line breaks)
   to React elements. No `dangerouslySetInnerHTML` on user content.
4. **Secrets:** tokens are 256-bit random, stored **hashed (SHA-256)** server-side. Client stores its
   device token with Electron `safeStorage`. Nothing secret in the repo, logs, or URLs (except signed,
   short-lived file URLs).
5. **Brand via tokens only.** Use CSS variables from BRAND.md. No raw hex values in components.
   Mint (`--n-mint`) is never text on a white/light background (contrast 1.33:1).
6. **i18n from day one.** No user-facing string literals in components. `pt-PT` and `en` resource
   files; default to the OS locale, fall back to `en`.
7. **Server stays portable.** It must be able to move off the host PC to a VPS or Raspberry Pi with zero
   code change: config via env/JSON, data dir configurable, no assumptions about Electron.
8. **Migrations, not schema edits.** Numbered SQL migration files; never mutate an applied migration.

## How to work
- Start each phase in **plan mode**: restate the goal, list files you'll touch, list tests you'll write,
  flag anything in DECISIONS.md that blocks you. Wait for approval before coding.
- Write the tests for server behaviour first (auth, permissions, protocol). UI tests can follow.
- Small, focused commits with clear messages. One phase per branch (`phase/NN-name`).
- A phase is **done** only when: tests pass, `lint` and `typecheck` are clean, the acceptance criteria
  in `docs/PROMPTS.md` are demonstrably met, and `docs/PROGRESS.md` is updated.
- If something in SPEC.md is wrong or impractical, say so and propose a change. Don't work around it.
- Don't add dependencies casually. Justify each new one in the commit message. Avoid native modules
  beyond better-sqlite3 (they complicate packaging).

## Don't
- Don't build features from later phases "while you're there".
- Don't recreate or redraw the Noesis logo. Use `packages/desktop/src/assets/brand/logo.svg` (official
  file supplied by the owner) or the text placeholder defined in BRAND.md.
- Don't load fonts, scripts or images from CDNs at runtime. Bundle them.
- Don't add telemetry, analytics or any third-party network call.
