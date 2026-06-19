---
target: /dashboard
total_score: 32
p0_count: 0
p1_count: 0
timestamp: 2026-06-19T11-31-57Z
slug: app-dashboard-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeletons + role="status" on all loaders. Six independent realtime blocks still load on separate clocks — no single "ready" moment |
| 2 | Match System / Real World | 4 | Ukrainian domain language throughout; zone labels match the admin's mental model |
| 3 | User Control and Freedom | 3 | Per-block retry on all 6 blocks; modal has Esc. No page-level refresh-all |
| 4 | Consistency and Standards | 4 | Detector: 0 findings. Tokens consistent; new --success-text/--danger-text follow existing semantic naming |
| 5 | Error Prevention | 3 | Read-only surface; retry + console logging. Little to prevent by nature |
| 6 | Recognition Rather Than Recall | 4 | Icon buttons labeled; zone labels orient the eye |
| 7 | Flexibility and Efficiency | 2 | Still no keyboard shortcut for the daily "Скопіювати звіт"; no refresh-all; no density control |
| 8 | Aesthetic and Minimalist Design | 4 | Two-zone split clean; alert tint now readable end-to-end — the hint was the last washed-out element and it's fixed |
| 9 | Error Recovery | 3 | All 6 blocks show "Не вдалося завантажити дані" + retry |
| 10 | Help and Documentation | 1 | No contextual hints on any block; "боржники по сесіях" opaque to a new hire — unchanged |
| **Total** | | **32/40** | **Good — the color floor is now solid; remaining gaps are efficiency + help** |

+1 (31 → 32). The contrast fix earned it via Heuristic 8: the alert card — the one element screaming for attention — now has a legible hint instead of a 0.75-opacity red that vanished in studio light. Help (1) and Flexibility (2) stay where they were; a contrast pass shouldn't move heuristics it didn't touch.

## Anti-Patterns Verdict

**Does this look AI-generated?** No — and now cleaner under the one lens where the previous two runs were too generous. Two-zone money/alert layout, restrained alert tint, no gradient text / side-stripes / hero-metric template all hold. The design no longer violates its own DESIGN.md No-Scare Rule on the dashboard surface.

**Deterministic scan**: detect.mjs over page.tsx + all _components + StatCard.tsx → 0 findings, exit 0. New tokens introduced no radius/font/stripe anti-patterns.

**Browser visualization**: Not performed — dev server not running, building conflicts with project dev workflow. No overlay this run. Deterministic fallback is the contrast sweep: all 5 fixed spots PASS by WCAG math.

**Where detector and review both stay blind:** detect.mjs reads markup, not computed color-on-background, so it never flagged the contrast failures — only the math did. The automated scan is clean but was never the instrument that caught the real issue.

## Overall Impression

The contrast pass landed cleanly and did exactly one thing well. Every text element local to the dashboard now meets AA, the two big red numbers correctly stayed vivid (large-text, clear 3:1), and the two-tier token (--success-text / --danger-text) means this won't silently regress when someone adds the next green figure. Reads correctly at a glance and now legibly in variable light.

Biggest remaining opportunity has shifted from color to: the same contrast bug still lives in ~30 shared .badge-* / .balance-* classes app-wide — including .balance-warn, which renders the debtor amounts on this very page at 4.15:1. The tokens to fix it now exist; the swap just hasn't been applied beyond dashboard scope.

## What's Working

1. **The contrast fix is structurally right, not a patch.** Adding --success-text (#007a33, 5.24:1 on success-dim) and --danger-text (#b32020, 5.96:1 on alert tint) as siblings to fill tokens — with comments stating the ≤18px-text contract — means the system now distinguishes "fill green" from "text green." The difference between fixing four spots and fixing the class of bug.
2. **Restraint in what stayed vivid.** The 32px red numbers (.alert .value, .danger .value) correctly left on --danger. Darkening them would dull the one focal point that should shout. Knowing which reds to keep loud went the right way.
3. **Zero regression.** Full-surface sweep confirms every untouched element still passes. .alert .label still 6.97:1, chip accents still 19:1.

## Priority Issues

**[P2] .balance-warn (global) renders on this dashboard below contrast — 4.15:1**
- **What**: Debtor amounts in SessionDebtBlock.tsx:61 use global .balance-warn (--danger on --danger-dim, 14px, globals.css:451) = 4.15:1, under the 4.5 floor. The one failing text element still visible, because the fix was scoped to dashboard-local CSS and .balance-warn is shared.
- **Why it matters**: It's the red overdraft figure next to each debtor's name — arguably the most important number in that block (how far negative), and the one number on the page still hard to read in bright light.
- **Fix**: One-line swap color: var(--danger) → var(--danger-text) on .balance-warn in globals.css. Token already exists. Touches clients/sales/accounting/schedule — all improvements — so belongs in the systemic follow-up, not the dashboard-scoped pass.
- **Suggested command**: /impeccable colorize /clients

**[P2] No keyboard path for the daily copy-report action — unchanged**
- **What**: "Скопіювати звіт" + per-hall copy buttons still mouse-target only. Heuristic 7 stays at 2.
- **Why it matters**: The studio manager's recurring morning action. Button already focusable; needs a documented shortcut or visible affordance.
- **Suggested command**: /impeccable harden /dashboard

**[P3] No contextual help for domain terms — unchanged**
- **What**: "Боржники по сесіях", "Вільні слоти залів" have no inline explanation for a new hire. Heuristic 10 stays at 1.
- **Fix**: Lightweight title tooltips on block headings, or one-line sub-caption.
- **Suggested command**: /impeccable onboard /dashboard

## Persona Red Flags

**Sam (Accessibility-Dependent User)** — the contrast wins are his.
- Free-slot chips, today's cash, header date, type chips, alert hint: all now AA-compliant. The strain elements from the last two runs are gone.
- One residual: the red overdraft amounts (.balance-warn) at 4.15:1 — marginal until the global swap lands.

**Alex (Power User — daily studio manager)**
- Still no keyboard shortcut for the copy-report. Unchanged.
- Still no "refresh all." Unchanged.

## Minor Observations

- 🎉 emoji inconsistency persists: "Боржників немає 🎉" has it, "Усе чисто" doesn't. Pick-one-tone nit.
- --success-text (#007a33) and --danger-text (#b32020) also clear AA on the page background (5.02 / 6.11), safe if reused on non-white surfaces later — good headroom.
- New tokens documented inline with the "fills stay on --success/--danger, text ≤18px takes the -text variant" rule. Worth promoting that line into DESIGN.md's color section so the contract is discoverable.

## Questions to Consider

- The .balance-warn / .balance-ok / .badge-* swap is now a ~6-line change across globals.css using tokens that already exist. Land it as a focused global pass so the whole app clears AA?
- Should the --success-text / --danger-text contract be written into DESIGN.md, so the next person reaches for the text variant by default?
- With color solid, the dashboard's two real gaps are Help (1) and Flexibility (2). Is onboarding-help worth it for a tool used by 1–2 daily power users, or is the copy-report keyboard shortcut the higher-value next move?
