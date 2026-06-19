---
target: /dashboard
total_score: 30
p0_count: 0
p1_count: 0
timestamp: 2026-06-19T10-43-26Z
slug: app-dashboard-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeleton on StatCards is good; loading-dots still have no `role="status"` for screen readers |
| 2 | Match System / Real World | 4 | Ukrainian domain language throughout; zone labels ("Гроші сьогодні" / "Потребує уваги") match mental model |
| 3 | User Control and Freedom | 3 | BlockError retry available on all 6 blocks; no global refresh affordance remains |
| 4 | Consistency and Standards | 4 | Detector: 0 findings. Radius tokens consistent. Error pattern unified across all blocks |
| 5 | Error Prevention | 3 | BlockError + console logging; retry available; no autosave/draft needed here (read-only dashboard) |
| 6 | Recognition Rather Than Recall | 3 | Zone labels clarify grouping; icon-only buttons (slotCopyBtn, spacesLink) still lack aria-label |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts for copy-report; no page-level refresh; power user path still limited |
| 8 | Aesthetic and Minimalist Design | 4 | Two-group stat layout clean; divider separates zones without noise; alert tinting purposeful |
| 9 | Error Recovery | 3 | All 6 blocks now show "Не вдалося завантажити дані" + retry button; raw strings gone |
| 10 | Help and Documentation | 1 | No contextual hints or tooltips on any block; new admins get no explanation of domain terms |
| **Total** | | **30/40** | **Good — address weak areas, solid foundation** |

---

## Anti-Patterns Verdict

**LLM assessment**: The two changes this session (layout + harden) eliminated the primary AI slop signal from the original critique. The flat identical-card grid is gone — replaced by two labeled zones with a hairline divider and semantically distinct alert tinting. The "construction zone" fragmented loading is structural to the component architecture (six independent realtime subscriptions) and acceptable given the tradeoff. No gradient text, no side-stripe borders, no hero-metric template. The `alert` StatCard variant (danger-dim background + red number) is restrained and purposeful — it signals "needs attention" without alarming the page.

**Deterministic scan**: 0 findings. The `999px` radius replaced with `var(--badge-radius)` in the previous pass. Clean.

**Browser visualization**: Dev server not running; live injection skipped.

---

## Overall Impression

Score moved from 24 → 30. The dashboard now reads correctly at a glance: money on the left, attention-required on the right with a subtle red tint when non-zero. Error states are user-facing and recoverable. The two open issues (icon-only accessibility labels and no contextual help) are P2/P3 and don't block daily use. The foundation is solid.

---

## What's Working

1. **Zone separation is clean.** The "Гроші сьогодні" / "Потребує уваги" grouping with divider and `groupLabel` gives the admin immediate orientation. The `alert` tint on non-zero danger cards makes the right-side zone visually distinct without overloading the rest of the page.

2. **Error hardening is comprehensive.** All 6 blocks now show the same user-facing "Не вдалося завантажити дані" with a retry button. Raw Supabase strings are console-only, prefixed by block name. Pattern is consistent and maintainable.

3. **Bottom row height consistency.** `equalBlockSm` on FreeSlotsBlock and TrainerCashBlock means the bottom pair now aligns at 320px, matching the architectural discipline of the top pair. The `--dashboard-block-h` / `--dashboard-block-sm-h` CSS custom property fallbacks make the heights overridable per-deployment.

---

## Priority Issues

**[P2] Icon-only buttons missing `aria-label` — not yet fixed**
- **What**: `slotCopyBtn` in [FreeSlotsBlock.tsx:87](app/dashboard/_components/FreeSlotsBlock.tsx#L87) and `spacesLink` in [FreeSpacesBlock.tsx:98](app/dashboard/_components/FreeSpacesBlock.tsx#L98) use only `title="..."`. `title` is not reliably announced by VoiceOver/NVDA on keyboard focus, and never appears on touch.
- **Why it matters**: These are actionable buttons (copy hall slots, open class detail) that keyboard/screen reader users cannot discover without mouse hover.
- **Fix**: Add `aria-label="Скопіювати слоти"` to `slotCopyBtn` and `aria-label="Відкрити заняття"` to `spacesLink`.
- **Suggested command**: `/impeccable audit /dashboard`

**[P3] `loading-dots` have no accessible announcement**
- **What**: All 4 blocks using `useListQuery` render `<div className="loading-dots"><span /><span /><span /></div>` without `role="status"` or `aria-label`. Screen readers get silence while data loads.
- **Fix**: Add `role="status" aria-label="Завантаження..."` to the `loading-dots` div. Consider extracting this to a shared `<LoadingDots />` component so the fix applies everywhere.
- **Suggested command**: `/impeccable audit /dashboard`

**[P3] No contextual help for domain terms**
- **What**: A new admin landing on the dashboard sees "Боржники по сесіях сьогодні" with no explanation of what a "session debtor" means in this studio's context. "Вільні слоти залів" is clear to a studio manager but opaque to a new hire.
- **Why it matters**: Low impact for daily users; high friction for onboarding. No `title` tooltip or inline hint exists.
- **Fix**: Add `title` attributes to block headings (e.g. `title="Клієнти, у яких закінчились оплачені заняття до завтра"`) — a lightweight hover tooltip without adding UI chrome.
- **Suggested command**: `/impeccable onboard /dashboard`

---

## Persona Red Flags

**Alex (Power User — daily studio manager)**
- No keyboard shortcut for "Скопіювати звіт" in SessionDebtBlock — daily recurring action.
- No "refresh all" affordance. Realtime subscription glitch = full page reload.
- Both these were present in the original critique and remain. Not worsened, not improved.

**Sam (Accessibility-Dependent User)**
- `slotCopyBtn` and `spacesLink` icon buttons still lack `aria-label`. **Unchanged from original.**
- `loading-dots` have no `role="status"`. **Unchanged from original.**
- Both are now the only remaining accessibility gaps.

---

## Minor Observations

- The `groupLabel` uses `text-transform: uppercase` + `letter-spacing: 0.06em` at 11px. This sits right at the eyebrow-ban boundary: one per section is deliberate brand cadence; here there are exactly two, each anchoring a semantically distinct zone (not "ABOUT / PROCESS / PRICING" scaffolding). This is intentional and defensible — it's a data zone label, not decorative section branding.
- `statGroupDivider` with `align-self: stretch` correctly spans the full height of both groups regardless of card count. The `gap: 0` on `.statGroups` + `margin: 0 20px` on the divider gives 20px breathing room on each side — good rhythm.
- `equalBlockSm` at 320px may be tight on days when many halls are busy and FreeSlotsBlock has 4+ rows with multiple time windows wrapping. The `scrollBody` handles it, but consider bumping to 360px as the fallback in a future polish pass.
- `key={i}` (array index) in SessionDebtBlock `.debtGroup` map — noted in original critique, still present. Stable key would be `${g.time}-${g.trainer}`.

---

## Questions to Consider

- "The two remaining open items (aria-labels, loading-dots a11y) are a 15-minute fix. Should `/impeccable audit` handle them now before committing?"
- "The 🎉 emoji in two empty states ('Боржників немає 🎉' / 'Усе чисто') — is this the right tone for a professional studio tool, or should both resolve to plain text?"
- "Is the `--dashboard-block-sm-h: 320px` fallback height correct for a typical studio day, or should it be 360px?"
