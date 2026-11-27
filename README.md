# Pausa — a private team chat, built with Claude Code

A web chat for colleagues' non-work talk: rooms, mentions, reactions, replies, images, notifications,
invite-only access, Noesis look. Built from a written spec in one Claude Code session (2026-11-23):
**~365 automated tests**, 17 browser tests, threat model included. Colleagues only need a browser.

```
CLAUDE.md                        ← auto-loaded by Claude Code: rules, stack, commands
docs/SPEC.md                     ← product, architecture, data model, protocol, security
docs/DECISIONS.md                ← every decision and why (D-00 and D-01 are still on you)
docs/PROMPTS.md                  ← the phase prompts the build followed
docs/PROGRESS.md                 ← what's done
docs/OPERATIONS.md               ← running it: setup, demo day, backups, troubleshooting
docs/DEMO.md                     ← 5-minute demo script
docs/SECURITY.md                 ← threat model with evidence
docs/BRAND.md                    ← Noesis tokens, contrast rules
packages/shared · server · web   ← the code
scripts/demo.mjs                 ← `pnpm demo`
.claude/commands/                → /next-phase, /brand-check
_archive/                        ← the superseded Electron plan, reference only
```

## Run it (Windows, from this folder)

```
npm install -g pnpm
winget install --id Cloudflare.cloudflared
pnpm install
copy .env.example .env          # then set ALLOWED_MAIL
pnpm start                      # local only → http://localhost:4747
pnpm server:init --name "Costa" # your one-time host link (local)
pnpm demo                       # reachable by colleagues through the email-gated tunnel
pnpm autostart                  # once: start with Windows + daily backup
                                # (fixed address on your own domain: docs/OPERATIONS.md §8)
```

Full instructions: `docs/OPERATIONS.md`. Before showing anyone: the office network check (D-00) and
brand approval (D-01) in `docs/DECISIONS.md`.

## Checks

```
pnpm lint && pnpm typecheck && pnpm test
pnpm e2e:install   # once
pnpm test:e2e
```
