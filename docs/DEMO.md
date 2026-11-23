# DEMO.md — 5-minute demo script

**The point to make:** a working, secure, on-brand team chat built in a handful of Claude Code
sessions, from written spec to tested app. Not "it's easy": *it's fast when the spec, the tests and
the review steps are done properly.*

## Before (the day before, 15 min)

- [ ] D-00 check done: a colleague's laptop on the office network opened a `trycloudflare.com` URL
- [ ] `.env` has `ALLOWED_MAIL` with the audience's addresses (or `*@empresa.pt`)
- [ ] PC plugged in, sleep off, Windows Update paused (OPERATIONS §5)
- [ ] `pnpm test && pnpm test:e2e` green, so you can show it live
- [ ] Two browsers ready: Edge (you, host) and a private window or a phone (the "colleague")

## On the day

**Start (before people arrive):** `pnpm demo`. Open the host link it prints, enter your name. Create
two rooms (`futebol ⚽`, `comida 🍕`) so it doesn't look empty.

| Time | Show | Say |
|---|---|---|
| 0:00 | The repo: `docs/SPEC.md`, `DECISIONS.md`, `PROMPTS.md` | "I didn't start with code. I started with a spec, the decisions, and one prompt per phase." |
| 0:45 | `git log` / `PROGRESS.md` | "Seven sessions. Each one had tests and acceptance criteria before it counted as done." |
| 1:15 | Administração → Criar convite, name a volunteer, paste the link in Teams | "Invite-only. The link works once and expires." |
| 1:45 | Volunteer opens it: Cloudflare email PIN → rules → name → #geral | "Two locks: only our email domain reaches it, and only an invite gets you in." |
| 2:30 | Chat: send a message, @mention them, they react, reply, paste a screenshot | "Mentions notify you, images are cleaned of GPS before they leave your laptop." |
| 3:15 | Switch to dark mode; open the room settings | "Noesis colours, checked automatically for contrast in both themes." |
| 3:45 | Administração → Membros → Retirar acesso on the volunteer | "Revoked: they're out in under two seconds and can't come back without a new invite." |
| 4:15 | Terminal: `pnpm test` (≈360 unit/integration tests) | "Every rule in the spec has a test: permissions, rate limits, XSS, uploads." |
| 4:45 | `docs/SECURITY.md` | "And a written threat model with what's covered and what isn't." |

## If something goes wrong

- **Volunteer can't open the link:** office filter (D-00). Use your phone on mobile data as the second device.
- **Everyone got logged out:** you restarted `pnpm demo`, so the URL changed. Issue new invites.
- **Pill turns red:** the server stopped or the PC slept. Re-run `pnpm demo`.
- **Notifications don't appear:** the browser asks for permission after your first sent message; check
  the site's notification setting.
