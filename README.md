# Pausa: Claude Code starter kit (web demo)

A private team chat, built in seven short Claude Code sessions to show how fast it can be done.
Colleagues use a browser; nothing gets installed on their machines.

```
CLAUDE.md                        ← auto-loaded by Claude Code every session: rules, stack, commands
docs/SPEC.md                     ← product + architecture + data model + protocol + security
docs/BRAND.md                    ← Noesis tokens, contrast rules, components, logo rules
docs/DECISIONS.md                ← what's settled, what's still open (D-00 network check, D-01 brand)
docs/PROMPTS.md                  ← Phase 0–6 prompts, each with tests + acceptance criteria
docs/PROGRESS.md                 ← phase tracker Claude updates as it goes
.claude/commands/next-phase.md   → /next-phase   plan the next unfinished phase
.claude/commands/brand-check.md  → /brand-check  audit UI against BRAND.md
_archive/                        ← the superseded Electron plan, for reference only
```

## Before you start
1. `git init` in this folder. It isn't a repo yet, and the workflow uses one branch per phase.
2. Install on the host PC: Node LTS, pnpm (`corepack enable`), and cloudflared
   (`winget install --id Cloudflare.cloudflared`).
3. **Network check (D-00), 5 minutes, do it now:** run `cloudflared tunnel --url http://localhost:8080`
   (nothing needs to be listening), then open the printed `trycloudflare.com` URL from a colleague's laptop
   on the office network. A Cloudflare error page means the domain gets through. A company block page means
   it doesn't: read D-00 and D-20 for the fallback.

## Run order
1. In Claude Code: paste the **Phase 0** prompt. Answer its questions and update the docs.
2. Then `/next-phase` → review the plan → approve → build → check acceptance → `/clear` → repeat.
3. Run `/brand-check` after Phases 3 and 5. Phase 6 runs the built-in `/security-review`.
4. Demo day: `pnpm demo`, send the invite links, follow `docs/DEMO.md`.

## Rules of thumb
- One phase per session. Clear context between phases; the docs are the memory.
- Never approve a plan that skips "tests first" for server phases.
- If Claude says the spec is wrong, it's probably worth a look. Update SPEC.md, don't let it improvise.
- Keep the demo honest: if a phase overruns, cut scope into the SPEC §11 backlog rather than skipping tests.
