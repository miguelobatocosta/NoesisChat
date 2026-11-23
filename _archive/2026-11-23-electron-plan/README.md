# Pausa: Claude Code starter kit

Drop these files into an empty folder, `git init`, open Claude Code there.

```
CLAUDE.md                     ← auto-loaded by Claude Code every session: rules, stack, commands
docs/SPEC.md                  ← product + architecture + data model + protocol + security
docs/BRAND.md                 ← Noesis tokens, contrast rules, components, logo rules
docs/DECISIONS.md             ← settled vs OPEN decisions (2 blockers before distribution)
docs/PROMPTS.md               ← Phase 0–12 prompts, each with tests + acceptance criteria
docs/PROGRESS.md              ← phase tracker Claude updates as it goes
.claude/commands/next-phase.md   → /next-phase   plan the next unfinished phase
.claude/commands/brand-check.md  → /brand-check  audit UI against BRAND.md
```

## Run order
1. Resolve **D-00 (IT approval)** and **D-01 (brand approval)** in DECISIONS.md, or at least know the answers.
2. Put the official Noesis logo SVG (white version) at `packages/desktop/src/assets/brand/logo.svg` once Phase 1 creates the folder.
3. In Claude Code: paste the **Phase 0** prompt. Answer its questions and update the docs.
4. Then `/next-phase` → review plan → approve → build → verify acceptance → `/clear` → repeat.
5. Run `/brand-check` after Phases 5–7 and the built-in `/security-review` in Phase 12.

## Rules of thumb
- One phase per session. Clear context between phases; the docs are the memory.
- Never approve a plan that skips the "tests first" step for server phases.
- If Claude says the spec is wrong, it's probably worth a look. Update SPEC.md, don't just let it improvise.
