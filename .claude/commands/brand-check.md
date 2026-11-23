---
description: Audit the renderer UI against docs/BRAND.md
---
Audit packages/web/src against docs/BRAND.md. Report, with file:line for each finding:

1. Raw hex/rgb colors in components (anything outside styles/tokens.css)
2. Mint (`--n-mint` / `--accent`) used as text on light surfaces; blue used as text on navy
3. Text/background pairs below WCAG AA (compute ratios; check light AND dark theme tokens)
4. Fonts not using `--font-sans` / `--font-mono`; any external font, script or image URL
5. Times, counts and badges missing `font-variant-numeric: lining-nums tabular-nums`
6. Hardcoded user-facing strings not going through i18n
7. Logo usage that is neither the official `assets/brand/logo.svg` nor the documented placeholder
8. Missing visible focus states on interactive elements

Then output the BRAND.md §8 checklist with ✅/❌ per item. Fix nothing until I say so.
