# BRAND.md — Noesis visual identity for Pausa

> **Source and limits.** Values below were extracted from the live computed CSS of noesis.pt on
> 2026-11-23. Noesis launched a new corporate identity in October 2025 (shared with Altia Group);
> **this is not an official brand guideline.** Before shipping: get the official logo files and
> guideline from Noesis Marketing and reconcile any differences here. Official guideline wins.

---

## 1. Core palette

| Token | Hex | Where Noesis uses it | Use in Pausa |
|---|---|---|---|
| `--n-blue` | `#184BFF` | Site header, primary buttons, links | Brand header, primary buttons, links, active room, focus ring |
| `--n-mint` | `#00FF94` | Accent CTA ("Get in touch": mint bg + blue text), text on blue buttons | Unread/mention dots, online presence, CTA on blue/navy surfaces, highlights |
| `--n-navy` | `#132153` | Section headings | Headings, sidebar background (dark), dark-mode surfaces |
| `--n-slate` | `#6D758F` | Secondary UI text | Large secondary text only (see contrast) |
| `--n-grey` | `#666666` | Body copy | Body text on white |
| `--n-white` | `#FFFFFF` | Backgrounds, text on blue | Main background (light), text on blue/navy |
| `--n-paper` | `#F4F4F4` | Light section backgrounds | Subtle panels (light) |

Typeface on the site: **Raleway** (headings 500–700, body 400–600). Raleway is SIL Open Font License,
so it can be bundled. **Bundle the woff2 files locally. No Google Fonts CDN at runtime.**

## 2. Contrast rules (WCAG 2.x, measured)

| Pair | Ratio | Verdict |
|---|---|---|
| `#184BFF` on white | 6.02 | ✅ AA text |
| white on `#184BFF` | 6.02 | ✅ AA text (button labels) |
| `#00FF94` on `#184BFF` | 4.51 | ⚠️ AA by a hair: **≥ 600 weight, ≥ 14px only** |
| `#132153` on `#00FF94` | 11.48 | ✅ preferred text on mint |
| `#00FF94` on white | **1.33** | ❌ **Never.** Mint is not a text color on light backgrounds |
| `#132153` on white | 15.33 | ✅ |
| `#666666` on white | 5.74 | ✅ body |
| `#6D758F` on white | 4.57 | ⚠️ borderline: use `--fg-muted` (`#5B6378`, 6.0) for small text instead |
| `#184BFF` on `#132153` | **2.55** | ❌ never blue text on navy. Use `#8AA2FF` (6.34) |

## 3. Semantic tokens (what components actually use)

```css
/* packages/web/src/styles/tokens.css */
:root {
  /* brand primitives */
  --n-blue: #184BFF;  --n-mint: #00FF94;  --n-navy: #132153;
  --n-slate: #6D758F; --n-grey: #666666;  --n-white: #FFFFFF; --n-paper: #F4F4F4;

  /* light theme (default) */
  --bg:            #FFFFFF;
  --bg-subtle:     #F4F6FB;   /* message hover, panels */
  --bg-selected:   #E8EEFF;   /* active room row, own-message tint */
  --surface-brand: var(--n-blue);   /* top header */
  --sidebar-bg:    var(--n-navy);
  --sidebar-fg:    #E6E9F2;
  --sidebar-muted: #9AA3BF;
  --fg:            var(--n-navy);   /* headings, names */
  --fg-body:       #1F2433;         /* message text, max readability */
  --fg-muted:      #5B6378;         /* timestamps, meta (6.0:1) */
  --link:          var(--n-blue);
  --accent:        var(--n-mint);   /* dots, presence, highlights: never text on light */
  --on-accent:     var(--n-navy);
  --primary:       var(--n-blue);
  --on-primary:    #FFFFFF;
  --danger:        #B42318;         /* 6.57 on white */
  --border:        #DDE2EE;
  --focus-ring:    0 0 0 3px rgba(24, 75, 255, 0.35);
  --mention-bg:    rgba(0, 255, 148, 0.18); /* message that mentions me: mint wash + mint left bar */

  --font-sans: "Raleway", "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Code", Consolas, monospace;

  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 10px; --radius-pill: 999px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px; --space-8: 32px;
  --shadow-1: 0 1px 2px rgba(19, 33, 83, 0.08);
  --shadow-2: 0 6px 24px rgba(19, 33, 83, 0.14);
  --dur-fast: 120ms; --dur-med: 200ms; --ease: cubic-bezier(.2,.7,.2,1);
}

[data-theme="dark"] {
  --bg:            #0B1230;
  --bg-subtle:     #132153;
  --bg-selected:   #1C2A63;
  --surface-brand: var(--n-blue);
  --sidebar-bg:    #070C22;
  --sidebar-fg:    #E6E9F2;
  --sidebar-muted: #9AA3BF;
  --fg:            #FFFFFF;
  --fg-body:       #E6E9F2;   /* 15.1 on bg */
  --fg-muted:      #9AA3BF;   /* 7.3 on bg */
  --link:          #8AA2FF;   /* 7.6 on bg, 5.57 on selected */
  --accent:        var(--n-mint);
  --on-accent:     var(--n-navy);
  --primary:       var(--n-blue);
  --on-primary:    #FFFFFF;
  --danger:        #FF6B6B;
  --border:        #22306A;
  --mention-bg:    rgba(0, 255, 148, 0.10);
}
```
**Added while building** (all in `tokens.css`, each checked by `packages/web/test/brand.test.ts`):
`--primary-hover` `#0035EE` (blue darkened 8%, white on it 7.65:1) · `--focus-ring-on-brand` (mint ring, because the
blue ring is invisible on the blue header) · `--on-brand-divider` (decorative) · `--overlay` (dialog backdrop) ·
`--highlight-bg` (message jumped to from a reply) · `--sidebar-accent` (mint, as text only on the navy sidebar) ·
`--separator`, `--fill`, `--fill-hover`, `--material-sheet`, `--material-bar`, `--blur`, `--on-brand-fill`,
`--shadow-3`, `--ease-spring`, `--hit-min` (D-48: Apple-style refresh). `--stale-1..4` (debt freshness bars, never text) · `--hero-*` and `--paper-*` (D-57: the navy hero band on
Bolos/Escritório and the paper senha/calendar on it; every text pair is in the contrast test). The avatar fills were removed with the avatars (D-48).

Theme: follow the OS by default (`prefers-color-scheme`), user override System / Light / Dark, remembered in
`localStorage` (wrapped in try/catch). The override sets `data-theme` on `<html>`.

## 4. Typography scale (Raleway)

| Role | Size / line | Weight |
|---|---|---|
| Room title | 20 / 26, −0.02em | 700 |
| Section label (sidebar groups) | 11 / 16, uppercase, +0.06em tracking | 700 |
| Author name | 14 / 20 | 700 |
| Message body | 15 / 22 | 500 (Raleway 400 is thin on Windows ClearType, test both) |
| Meta (time, "edited") | 12 / 16 | 500 |
| Buttons | 14 / 20 | 700 |

Raleway's default old-style numerals look odd in timestamps and counts: enable lining figures
(`font-variant-numeric: lining-nums tabular-nums;`) on times, badges and counts.

## 5. Components (brand application)

- **Header bar:** `--surface-brand` blue, white logo at left (24px tall), server name, connection status as
  plain text with a small dot (no pill, D-48).
- **Primary button:** blue bg, white text, `--radius-sm`, 700 weight, no border. Hover: darken 8%.
- **Shape language (D-48, Apple HIG principles):** no borders on buttons, fields or cards. Fields are filled
  (`--fill`); cards, dialogs and menus float on `--shadow-3`, menus and pop-overs use the translucent
  `--material-sheet` with `--blur`. Regions are split by 1px `--separator` hairlines. No pills, no circles around text.
- **Accent CTA** (sparingly, e.g. "Create invite", "Join"): mint bg + navy text. This mirrors the site's "Get in touch".
- **Sidebar:** navy background, room rows `#E6E9F2`; active row = blue bg + white text; unread = 700 weight + white;
  unread count = plain mint number (`--sidebar-accent`), mention = mint "@". No badges (D-48).
- **People:** names only, no avatars (D-48). Presence: small mint dot (online), faded `--sidebar-muted` dot (offline).
- **Own messages:** not bubbles. Same left-aligned layout as everyone (team chat convention), subtle `--bg-selected` tint optional.
- **Focus:** `--focus-ring` on `:focus-visible` only, so it shows for the keyboard and not the mouse (D-48).
  Filled fields show focus by lifting to `--bg` with a shadow. Keyboard navigation for rooms (Ctrl+K quick switcher, Alt+↑/↓).
- **Empty states:** one line of friendly copy + one action. No stock illustrations; the room's own mascot
  (D-49) is the one drawing allowed there.
- **Mascots (D-49):** original SVG characters, colours only from `--mascot-*` tokens, always decorative
  (`aria-hidden`, name shown as text). They never replace people's names and never carry text.
- **Iconography:** one outline icon set (e.g. Lucide), 1.75px stroke, 18–20px. Don't mix sets.

## 6. Logo

- **Do not redraw, trace or approximate the Noesis logo.** Use the official SVG supplied by the owner at
  `packages/web/src/assets/brand/logo.svg` (white version for the blue header), and only once D-01 is approved.
- Until supplied: text placeholder `NOESIS` set in Raleway 700, uppercase, +0.08em tracking, white on blue,
  followed by a thin divider and the app name. Replace before any distribution.
- App/PWA icon: a generic placeholder (e.g. a speech bubble in `--n-blue` with a `--n-mint` dot) until D-25 is
  settled. Don't use the Noesis logo as the app icon
  without explicit approval.

## 7. Voice

Noesis copy is confident, direct, bilingual, warm in Portuguese ("Let's innovate, together!").
For Pausa: short, informal, friendly. pt-PT first. Examples:
- Empty room: "Ainda está tudo calmo por aqui. Diz olá 👋" / "Quiet in here. Say hi 👋"
- Offline: "Servidor offline. A tentar ligar de novo…" / "Server offline. Reconnecting…"
- Never corporate jargon in a social space. Never guilt-trippy copy.

## 8. Brand QA checklist (run on every UI phase)

Automated: raw colours outside `tokens.css` and token-pair contrast (`brand.test.ts`), hardcoded text and
raw colours in components (ESLint), real rendered contrast in light and dark (axe in Playwright), no external
requests and Raleway loaded (Playwright). `/brand-check` covers the rest by review.


- [ ] No raw hex values in components; everything through tokens
- [ ] No mint text on light surfaces; no blue text on navy
- [ ] All text ≥ 4.5:1 (≥ 3:1 for ≥ 24px or ≥ 19px bold)
- [ ] Raleway loaded from bundled files (check Network tab: zero external requests)
- [ ] Lining/tabular numerals on times and badges
- [ ] Light and dark both checked; focus ring visible in both
- [ ] Logo is the official file or the documented placeholder, nothing else
