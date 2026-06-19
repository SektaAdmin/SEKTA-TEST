---
target: /dashboard
total_score: 32
p0_count: 0
p1_count: 0
timestamp: 2026-06-19T11-51-22Z
slug: app-dashboard-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeletons + role="status" on all loaders. Six realtime blocks still load on independent clocks — no unified "ready" moment |
| 2 | Match System / Real World | 4 | Ukrainian domain language; zone labels match the admin's mental model |
| 3 | User Control and Freedom | 3 | Per-block retry on all 6; modal Esc. No page-level refresh-all |
| 4 | Consistency and Standards | 4 | Detector 0 findings. Semantic text now consistent app-wide via shared tokens; the dashboard inherits the fix, not a local patch |
| 5 | Error Prevention | 3 | Read-only surface; retry + console logging. Little to prevent by nature |
| 6 | Recognition Rather Than Recall | 4 | Icon buttons labeled; zone labels orient the eye |
| 7 | Flexibility and Efficiency | 2 | Still no keyboard shortcut for the daily "Скопіювати звіт"; no refresh-all |
| 8 | Aesthetic and Minimalist Design | 4 | Two-zone split clean; all semantic color now legible — last washed-out element (debtor amounts) fixed via the global swap |
| 9 | Error Recovery | 3 | All 6 blocks: "Не вдалося завантажити дані" + retry |
| 10 | Help and Documentation | 1 | No contextual hints; "боржники по сесіях" opaque to a new hire — unchanged |
| **Total** | | **32/40** | **Good — color fully resolved; ceiling now set by Help + Flexibility** |

Holds at 32, and that's the honest read. The global swap closed the one remaining contrast P2 (.balance-warn), but that issue lived in a global class, not a dashboard-local heuristic — Consistency (4) and Aesthetic (4) were already at their post-fix level. Nothing moved a heuristic this run because the only open items left (Help: 1, Flexibility: 2) are structural and untouched. A re-run that found nothing new should not invent a higher number. The score is now gated by two deliberate non-color decisions, not by defects.

## Anti-Patterns Verdict

**Does this look AI-generated?** No. The surface now passes the bar it sets for itself: every visible text element clears WCAG AA, verified by contrast math (26/26 elements PASS, zero failures). Two-zone layout, restrained alert tint, vivid-but-large red numbers, no gradient text / side-stripes / hero-metric template.

**Deterministic scan**: detect.mjs → 0 findings, exit 0. The three-token system (--success-text/--danger-text/--warning-text) introduced no radius/font/stripe anti-patterns.

**Browser visualization**: Not performed — dev server down, build conflicts with dev workflow. No overlay. Deterministic fallback is the full-surface contrast sweep, now exhaustive (every dashboard text element measured) and all-green.

**Honest limit of this run:** without a live browser, verifying computed contrast and static structure, not runtime behavior — focus-ring visibility on tab, realtime-load choreography, screen-reader announcement order. The contrast claim is solid (pure math); interaction claims carry forward from code/prior runs.

## Overall Impression

Color is done. Across three passes the dashboard went 24 → 30 → 31 → 32; the contrast work took the surface from four measurable AA failures to zero. The three-tier semantic token system means no regression: the next green balance or amber badge inherits a passing color by default, and the contract is in DESIGN.md.

The dashboard's quality is no longer limited by anything visual. It's limited by two product decisions: no contextual help (a new hire can't decode "боржники по сесіях") and no keyboard accelerator for the action a daily admin repeats every morning. Both are legitimate "worth it for 1–2 power users?" questions, not bugs.

## What's Working

1. **The fix is system-level, not surface-level.** .balance-warn — debtor overdraft figures on this page — now reads at 5.96:1 because the shared class was fixed, simultaneously clearing the same failure in /clients, /sales, /schedule, and the client cabinet. One change, correct everywhere. The difference between patching a page and fixing a design system.
2. **Vivid where it should shout, dark where it must be read.** The 32px alert/expense numbers stayed on --danger (4.15–4.66:1, clearing large-text 3:1) — still loudest on the card — while 12–14px hints/balances moved to darker text tokens. Principled, documented, verified.
3. **Zero regression, exhaustively confirmed.** All 26 text elements measured; every one passes. The work didn't drag a single neighboring color down.

## Priority Issues

No P0/P1. The contrast P-items from prior runs are all resolved. What remains are the two long-standing structural gaps:

**[P2] No keyboard path for the daily copy-report action — unchanged across all 4 runs**
- **What**: "Скопіювати звіт" + per-hall copy buttons are mouse-target only. Heuristic 7 stuck at 2.
- **Why it matters**: The studio manager's recurring morning ritual — copy debtor list, send to trainers. Button already focusable; needs a shortcut (c when block focused) or visible "⌘C" affordance.
- **Suggested command**: /impeccable harden /dashboard

**[P3] No contextual help for domain terms — unchanged**
- **What**: "Боржники по сесіях", "Вільні слоти залів" have no inline explanation. Heuristic 10 stuck at 1.
- **Why it matters**: Low cost for daily users, high friction for onboarding a new admin.
- **Fix**: title tooltips on block headings, or a one-line sub-caption.
- **Suggested command**: /impeccable onboard /dashboard

## Persona Red Flags

**Sam (Accessibility-Dependent User)** — fully cleared on contrast.
- Every text element now meets AA, including the red overdraft amounts that were 4.15:1 last run. No remaining color barrier.
- Caveat I can't close without a browser: focus-ring visibility on keyboard tab and screen-reader announcement of realtime updates — verified in code (focus-visible tokens, role="status" present) but not observed live.

**Alex (Power User — daily studio manager)**
- Still no keyboard shortcut for the morning copy-report. Unchanged across 4 runs — now the single highest-value open item for the daily user.
- Still no "refresh all."

## Minor Observations

- 🎉 emoji inconsistency persists ("Боржників немає 🎉" vs plain "Усе чисто"). Cheapest possible fix; flagged 3 runs running.
- The three text tokens have headroom on the page background too (--success-text 5.02, --danger-text 6.11, --warning-text ~5.3), safe if reused on non-white surfaces.
- Stale sidecar: .impeccable/design.json is now older than DESIGN.md (gained the three text tokens). The detector's radius/font checks read that cache, so it's slightly behind. Advisory only — worth /impeccable document when convenient.
- Per-file module CSS (~30 usages in clients/sales/accounting/schedule) still uses vivid tokens as text. Most pass (danger-on-white 4.66, large balance figures at 3:1); failing ones (small success text, danger/warning on -dim) are the deferred follow-up. None render on /dashboard, so they don't affect this score.

## Questions to Consider

- The dashboard's score is now capped by Help (1) and Flexibility (2), both for a tool used by 1–2 daily power users. Is either worth doing, or is "competent and legible" the right stopping point for an internal ops surface? (Over-onboarding a 2-person tool is its own anti-pattern.)
- If you do one thing: the copy-report keyboard shortcut is the only open item that touches the daily user. Help touches the new-hire user, who is rare. Does that ordering match how the studio grows headcount?
- With color and the token system settled, is it time to point /impeccable critique at a different surface (/schedule, the densest screen, or the client cabinet) rather than squeeze the last 8 points out of a dashboard that's already doing its job?
