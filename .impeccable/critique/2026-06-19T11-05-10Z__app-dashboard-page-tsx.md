---
target: /dashboard
total_score: 31
p0_count: 0
p1_count: 1
timestamp: 2026-06-19T11-05-10Z
slug: app-dashboard-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeletons on StatCards + role="status" on all loading-dots now (fixed this session). Six independent subscriptions still load piecemeal — no unified "everything's ready" moment |
| 2 | Match System / Real World | 4 | Ukrainian domain language throughout; zone labels match the admin's mental model |
| 3 | User Control and Freedom | 3 | Per-block retry on all 6 blocks; ClassDetailModal has Esc. No page-level refresh |
| 4 | Consistency and Standards | 4 | Detector: 0 findings. Tokens consistent, error pattern unified, stable keys now in place |
| 5 | Error Prevention | 3 | Read-only surface; retry + console logging. Little to prevent here by nature |
| 6 | Recognition Rather Than Recall | 4 | Icon buttons now have aria-label (fixed this session); zone labels orient the eye |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcut for the daily "Скопіювати звіт"; no refresh-all; no density/collapse control |
| 8 | Aesthetic and Minimalist Design | 4 | Two-zone money/alert split is clean; alert tint purposeful; restrained throughout |
| 9 | Error Recovery | 3 | All 6 blocks show "Не вдалося завантажити дані" + retry; raw strings gone |
| 10 | Help and Documentation | 1 | No contextual hints on any block; "боржники по сесіях" opaque to a new hire |
| **Total** | | **31/40** | **Good — solid foundation, weak areas are efficiency + help** |

The +1 over the last run (30) is earned: the a11y commit (d4f3b53) genuinely landed the icon-button labels, role="status", and stable keys that the 30-run flagged as still-open. Those heuristics moved up; nothing regressed.

## Anti-Patterns Verdict

**Does this look AI-generated?** No. This is the opposite of the generic case. The two-zone money/alert layout with a hairline divider, the restrained alert tint (danger-dim bg + red number, not a full red card), and the absence of any gradient text, side-stripe border, or hero-metric template put it firmly in "fluent in the category" territory.

**Deterministic scan**: detect.mjs over page.tsx + all 7 _components → 0 findings, exit 0. The 999px→var(--badge-radius) fix from an earlier pass holds. Clean.

**Browser visualization**: Not performed — dev server is not running (curl localhost:3000 → no response), and starting a build conflicts with this project's dev-server workflow (shares .next). No reliable user-visible overlay this run. Fallback signal is the contrast math below, which is deterministic.

**What the detector and visual review both missed — and contrast math caught:** the design's own DESIGN.md "No-Scare Rule" (body/secondary text ≥4.5:1) is violated in four measurable places. This is the single most important finding.

## Overall Impression

The structure is right and the craft is real — a calm, scannable operations pulse, exactly what PRODUCT.md asks for. The biggest remaining opportunity isn't layout or slop; it's that several text colors fail the contrast bar the design system itself sets, and they fail specifically on the small, semantic text (success green at 12–13px, tertiary gray on the page background). For a tool used "in variable lighting, by older instructors" — DESIGN.md's own stated constraint — this is the gap that matters most.

## What's Working

1. **The two-zone stat split.** "Гроші сьогодні" | divider | "Потребує уваги" gives instant orientation, and the alert variant (danger-dim bg, red number) flags non-zero debtors without shouting. Committed, purposeful color use — not decoration.
2. **Error hardening is uniform and honest.** All six blocks funnel through BlockError → "Не вдалося завантажити дані" + retry, with raw Supabase strings kept to console.error. Maintainable and user-respecting.
3. **The a11y pass actually landed.** role="status" on every loading-dots, aria-label on slotCopyBtn/spacesLink, 44×44 hit areas via negative-margin padding on spacesLink, stable ${g.time}-${g.trainer} keys. Open items one run ago, genuinely closed now.

## Priority Issues

**[P1] Success-green text fails contrast at the size it's used (3.10–3.25:1 vs 4.5 required)**
- **What**: --success (#00a544) on --success-dim in .slotChip (13px, FreeSlotsBlock.tsx:98 via dashboard.module.css:318) computes to 3.10:1. Same green on white in .cashToday ("+N сьогодні", 12px, dashboard.module.css:359) is 3.25:1. Both below the 4.5:1 floor for text under 18px.
- **Why it matters**: These carry real meaning — free time-windows a manager reads off to a client on the phone, and today's cash intake per trainer. In the studio's "variable lighting / older staff" context (DESIGN.md's stated reason this rule exists), washed-out green is exactly the strain the No-Scare Rule prevents. Also contradicts DESIGN.md's own Don't ("use semantic color instead [of muted gray]") — except here the semantic color is the one too light.
- **Fix**: Darken the green for text use. #00a544 → ~#008035 (OKLCH ~0.55L) clears 4.5:1 on both success-dim and white. Introduce a --success-text token for on-light text and keep --success for fills/borders, or darken --success globally and verify badge fills still read.
- **Suggested command**: /impeccable colorize /dashboard

**[P2] Tertiary gray text fails 4.5:1 on the page background and on chips**
- **What**: --text-3 (#737373) measures 4.34:1 on page bg --bg (#f5f5f2) and 4.05:1 on --bg-3 (#eeede9). Used for headDate (14px, dashboard.module.css:15) and debtType chip (12px, dashboard.module.css:248). Clears 4.5 only on pure white (4.74).
- **Why it matters**: Same No-Scare Rule, same variable-lighting audience. Header date and individual-type chip both legible-but-straining; the rule is explicit that secondary/tertiary text is never lighter than 4.5:1 on any background.
- **Fix**: For text-3 used off-white, step to --text-2 (#525252 → 7.8:1), or define the date/chip text one rank up. Don't lighten backgrounds — bump text toward ink.
- **Suggested command**: /impeccable colorize /dashboard

**[P2] The alert card hint is below contrast, doubly so at 0.75 opacity**
- **What**: In StatCard.module.css, .alert .hint is --danger at opacity: 0.75 on the danger-dim card bg. Solid danger on that bg is already 4.15:1; at 0.75 opacity it drops further. This is the "N разом →" / "Деталі нижче ↓" hint on active alert cards (StatCard.module.css:75).
- **Why it matters**: It's the actionable hint on the one card screaming for attention — the moment it matters most is the moment it's hardest to read.
- **Fix**: Drop opacity: 0.75 and use a darker danger for hint text (e.g. #b32020), or set the alert hint to --text-2 so the red number stays the focal point and the hint stays readable.
- **Suggested command**: /impeccable colorize /dashboard

**[P2] No keyboard path for the daily copy-report action**
- **What**: "Скопіювати звіт" (SessionDebtBlock) and per-hall copy buttons are mouse-target only; no shortcut. Heuristic 7 stays at 2.
- **Why it matters**: This is the power-user admin's recurring daily action — copy the debtor report to send trainers. Every day, mouse-only.
- **Fix**: The button already exists and is focusable. A documented shortcut (e.g. 'c' when the debtors block is in view) or a visible "⌘C report" affordance closes it. Lower urgency than contrast.
- **Suggested command**: /impeccable harden /dashboard

## Persona Red Flags

**Sam (Accessibility-Dependent User)** — the contrast findings are his.
- Free-slot chips and per-trainer cash-today at 3.1–3.3:1 green: below AA. Read at a strain or not at all in bright studio light.
- Header date + type chips in gray at 4.05–4.34:1: marginal fails.
- Resolved since last run: icon buttons now labeled, loading states announced. Remaining barrier is purely contrast, not structure.

**Alex (Power User — daily studio manager)**
- No keyboard shortcut for the copy-report he runs every morning.
- No "refresh all" — a realtime hiccup means a full reload. Unchanged.

## Minor Observations

- The 🎉 in two empty states ("Боржників немає 🎉", and "Усе чисто" without emoji) — flagged as a Question last run, still there. One empty state has the emoji, one doesn't: inconsistent, which is the smaller real issue. Pick one tone.
- --dashboard-block-sm-h: 320px fallback may clip FreeSlotsBlock on a busy day (4+ halls, wrapping windows). scrollBody saves it, but 360px would feel less cramped.
- font-variant-numeric: tabular-nums applied consistently across money/time/balance values — nice discipline that keeps columns from jittering.
- .alert .label correctly steps to --text-2 (7.8:1) — so the label on alert cards is fine; only the hint is under. The inconsistency within one component is worth tidying.

## Questions to Consider

- The contrast failures are all in semantic colors at small sizes (success green, danger hint, tertiary gray off-white). Want a proper two-tier token split — --success / --success-text, --danger / --danger-text — so fills stay vivid and on-light text stays ≥4.5:1? Fixes this class of bug permanently.
- Is "Готівка сьогодні" meant to read as urgently as the alert cards? Right now it's a neutral StatCard. If end-of-day cash reconciliation is a peak-stress moment, it might deserve more visual weight.
- Six independent realtime blocks load on their own clocks. Is the piecemeal load acceptable, or would a single coordinated "ready" state feel calmer for a surface open all day?
