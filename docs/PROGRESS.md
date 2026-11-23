# PROGRESS.md

Update at the end of every phase: status, date, commit, and anything deferred.

| # | Phase | Status | Date | Commit | Notes / deferred |
|---|---|---|---|---|---|
| 0 | Kickoff check | ✅ done | 2026-11-23 | — | Review done in chat; versions from `npm view`; nothing blocked 1–3 |
| 1 | Scaffold → branded empty shell | ✅ done | 2026-11-23 | 9b934f8 | TS 6 / ESLint 10 pins (D-39); APP_NAME constant (D-40) |
| 2 | Server core: rooms, messages, sync | ✅ done | 2026-11-23 | ad6707e | Built together with Phase 4 auth, so no dev seam (D-41). 95% line coverage |
| 3 | Chat UI (first demo moment) | ✅ done | 2026-11-23 | b38d4c9 | |
| 4 | Invites, sessions, admin | ✅ done | 2026-11-23 | ad6707e, b38d4c9 | Per-device admin revoke deferred: logout revokes a device, admin revokes a member |
| 5 | Images, notifications, room settings | ✅ done | 2026-11-23 | ad6707e, b38d4c9 | |
| 6 | Go live: tunnel, PWA, backups, security pass | ✅ done | 2026-11-23 | phase-6 commit | No service worker (D-42). `pnpm demo` tested with a stand-in cloudflared; the real tunnel + office network check is D-00, on the owner |
| 7 | Premium look, no circles (owner request, D-48) | ✅ done | 2026-11-23 | phase/07-premium-look | Avatars, pills and borders removed; focus ring keyboard-only; dark contrast test fixed |
| 8 | Room mascots that talk (owner request, D-49) | ✅ done | 2026-11-23 | phase/08-mascotes | Six original mascots, scripted pt-PT lines, migration 0002; mentions are plain text now (no box) |

**Test totals:** 27 shared + 125 server + 229 web unit/integration, 18 Playwright E2E (incl. axe contrast in light and dark).

**Owner to-dos before the demo:** D-00 network check from an office laptop; set `ALLOWED_MAIL` in `.env`;
D-01 brand approval before showing it beyond the team.

**Next (SPEC §11):** stable URL (named tunnel + Access), second device, narrow layout, search.

Status values: ⬜ todo · 🟦 in progress · ✅ done · ⏸ blocked (say by what)
