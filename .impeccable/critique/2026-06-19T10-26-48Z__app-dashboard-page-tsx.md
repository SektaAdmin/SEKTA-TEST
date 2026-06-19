---
target: /dashboard
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-06-19T10-26-48Z
slug: app-dashboard-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading dots present; no skeleton layout — reflow on load, no progress in statRow area |
| 2 | Match System / Real World | 4 | Ukrainian domain language throughout, logical grouping |
| 3 | User Control and Freedom | 2 | No clear escape from ClassDetailModal via keyboard; no global "refresh" affordance |
| 4 | Consistency and Standards | 3 | 999px radius on spacesFreeChip conflicts with design system; copyBtn vs slotCopyBtn differ in structure |
| 5 | Error Prevention | 2 | Error state renders raw string ("Помилка завантаження: {error}") — may expose internal messages |
| 6 | Recognition Rather Than Recall | 3 | Block titles describe content; arrow-right icon on FreeSpacesBlock has no label |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcut for copy report action; dashboard state non-interactive beyond modal |
| 8 | Aesthetic and Minimalist Design | 3 | Two twoCol rows below statRow add ~3 visual regions; FreeSlotsBlock and TrainerCashBlock diverge in height alignment |
| 9 | Error Recovery | 1 | Error messages are developer-facing strings passed directly; no "retry" affordance on any block |
| 10 | Help and Documentation | 1 | No tooltips, no inline hints explaining what "боржники по сесіях" means to a new admin |
| **Total** | | **24/40** | **Acceptable — significant improvements needed** |

---

## Anti-Patterns Verdict

**LLM assessment**: The dashboard avoids the most obvious AI slop tells — no gradient text, no side-stripe borders, no hero-metric template with a big saturated gradient number. The composition is sensible: money KPIs across the top, alerts next to them, two pairs of detail blocks below. The StatCard component is restrained and well-proportioned. No cramped nesting.

That said, there are two category-reflex issues worth naming:

1. **The identical-card-grid reflex.** The statRow uses `repeat(auto-fit, minmax(150px, 1fr))` which is practical, but all StatCards share the same padding, border, background, and 32px value — there's no visual distinction between "main operational metric" (cash today) and "alert metric" (session debtors). A busy admin scanning at a glance can't immediately separate what's informational from what requires action. Same shape, same weight.

2. **The loading spinner default.** All six blocks render `loading-dots` individually while data loads. On a dashboard that shows this concurrently, the page initially shows six independent loading states at different stagger points rather than a composed skeleton. It fragments the interface temporarily.

**Deterministic scan**: 1 finding — `border-radius: 999px` on `.spacesFreeChip` (dashboard.module.css:341) is outside the documented design system radius scale (10px base, 6px sm). Advisory severity. The `badge` radius (20px) exists in DESIGN.md for pills/chips, and this chip is semantically a badge — the fix is either to add a `--radius-pill` token (or `--radius-badge: 20px`) consistent with the badge component convention, or use `var(--radius-badge)` if a token exists. No false positive — the value is genuinely undocumented.

**Browser visualization**: No dev server running; live injection was not attempted. Review is source-code based.

---

## Overall Impression

A functionally solid operational dashboard. The information architecture is correct — money first, alerts second, detail grids below — and the code is clean. The single biggest opportunity: **visual priority between informational cards and actionable alerts is indistinguishable**. The admin needs to see in < 2 seconds "what requires my action today" vs "what's informational." Right now, all StatCards look identical. A session-debtor card with `accent="danger"` changes the number color to red but nothing else — size, layout, background are all the same as the "cash today" card.

---

## What's Working

1. **Information architecture.** Top-down zone ordering (money → alerts → detail lists → schedule) mirrors real-world operational priority. A morning admin reads top-to-bottom and acts in that order. This is right.

2. **StatCard skeleton.** The `loading` prop substitutes a correctly-sized animated skeleton instead of an "…" or spinner. Height stays stable; no layout shift when data arrives.

3. **Real-time reactivity.** Six blocks independently subscribe to relevant tables via `useListQuery`/`useAsync` realtime. The admin doesn't need to refresh. This is the correct pattern for a studio dashboard where enrollments change under active use.

---

## Priority Issues

**[P1] Alert cards are visually indistinguishable from informational cards**
- **What**: `MoneyCardsBlock` and `AlertCardsBlock` render identical `StatCard` components into the same `statRow` grid. The only difference is `accent="danger"` which tints the number red. The card's background, border, size, and position are the same. A session-debt card showing "3 боржника" sits beside a cash card showing "2 400 ₴" with no visual separation, no grouping label, and no spatial distinction.
- **Why it matters**: The admin's core job in the morning is "what needs my attention." Two fundamentally different types of information (financial status and action required) are presented with the same visual weight in the same row. This forces the user to read every card label to understand which category it belongs to.
- **Fix**: Separate the two groups with a visible section label ("Гроші сьогодні" / "Потребує уваги") and/or give alert cards a distinct background tint (e.g. `--danger-dim` as bg on non-zero danger state). At minimum, separate the two `MoneyCardsBlock` and `AlertCardsBlock` visually — even a thin gap or divider line between the group.
- **Suggested command**: `/impeccable layout /dashboard`

**[P1] Error states are developer-facing, not user-facing**
- **What**: All blocks render `{error}` (a raw string from Supabase/PostgREST) directly into the UI: `"Помилка завантаження: {error}"`. On a network error, the admin might see "relation does not exist" or a JWT error code.
- **Why it matters**: This fails heuristic #9. An admin seeing a cryptic error has no idea whether to wait, refresh, or call support. A raw PostgREST error string is also an inadvertent information disclosure.
- **Fix**: Map all block errors to `"Не вдалося завантажити дані. Спробуйте оновити сторінку."` with a retry button. The raw error can go to `console.error` for debugging.
- **Suggested command**: `/impeccable harden /dashboard`

**[P2] FreeSlotsBlock and TrainerCashBlock don't align in height to their column-pair**
- **What**: The bottom `twoCol` row has `FreeSlotsBlock` (a variable-height block, no `equalBlock` class) alongside `TrainerCashBlock` (also variable-height). These don't align unless content happens to be similar length. The top pair (SessionDebtBlock + FreeSpacesBlock) correctly uses `equalBlock` with `height: 520px`. The bottom pair is inconsistent.
- **Why it matters**: On a wider screen the bottom two blocks can appear as vastly different heights, breaking the grid's implied alignment. Minor visual inconsistency but noticeable.
- **Fix**: Either add `equalBlock` styling to the bottom pair (with appropriate max-heights so they don't grow too tall when empty), or redesign the bottom row to accept natural height (removing alignment expectation). The 520px fixed height is also a magic number — consider a CSS custom property.
- **Suggested command**: `/impeccable layout /dashboard`

**[P2] Arrow-right action button in FreeSpacesBlock is icon-only with no accessible label**
- **What**: `spacesLink` button contains only an `ArrowRightIcon` inside a 26×26 button with `title="Відкрити заняття"`. The `title` attribute is not reliably announced by all screen readers and doesn't appear on touch.
- **Why it matters**: This is an interactive affordance with no persistent text label. On mobile (touch), `title` never shows. Keyboard users navigating focus won't hear a label without an `aria-label`.
- **Fix**: Add `aria-label="Відкрити заняття"` to the button. Consider adding a text label ("→" or "Деталі") visible on wider screens.
- **Suggested command**: `/impeccable audit /dashboard`

**[P3] `border-radius: 999px` on spacesFreeChip is undocumented**
- **What**: The detector confirmed `.spacesFreeChip` uses `border-radius: 999px` which is outside the design system radius scale. The design system defines `base: 10px` and `sm: 6px`; the badge component uses `20px`. Chips in DESIGN.md use `badge: 20px`.
- **Why it matters**: Advisory only, but inconsistency here could propagate if similar components copy this pattern. The badge token is documented; use it.
- **Fix**: Replace `border-radius: 999px` with `border-radius: var(--radius-badge, 20px)` (or add `--radius-badge: 20px` to globals.css and use that token).
- **Suggested command**: `/impeccable polish /dashboard`

---

## Persona Red Flags

**Alex (Power User — Studio Manager using this daily)**
- The "Скопіювати звіт" button in SessionDebtBlock has no keyboard shortcut — copying the session debt report to send to trainers is a recurring daily task that could be `Ctrl+Shift+C` or similar.
- No keyboard shortcut to open ClassDetailModal from FreeSpacesBlock row; must click the 26×26 icon button precisely.
- No "refresh all" button. If the admin suspects stale data (realtime glitch), they have no affordance other than full page reload.

**Sam (Accessibility-Dependent User)**
- Icon-only `slotCopyBtn` (copy icon, no label, only `title`) in FreeSlotsBlock is not accessible via screen reader — `title` is not reliably read by VoiceOver/NVDA. Missing `aria-label`.
- `spacesLink` button (arrow-right icon, only `title`) — same problem.
- The `balance-warn` class on the debtor list renders a colored number with no accessible semantic (no `aria-label` indicating "ця людина в мінусі").
- Loading dots use `<span />` elements without `aria-busy` or `aria-label` on the container — screen readers get no announcement that data is loading.

---

## Minor Observations

- The date display in the header (`headDate`) is `text-transform: capitalize` to handle the Ukrainian weekday name starting lowercase. This is a CSS transform, not a data fix. If the day label ever changes locale or format, the transform may produce unexpected results. Consider capitalizing at the data layer (`DOW_LABELS_FULL` entries with capital first letter).
- `StatCard` value uses `font-size: 32px` which is quite large when 6 cards share a row on a narrower desktop (1280px). The minmax(150px, 1fr) grid could create cards as narrow as 150px with a 32px number — tight but probably survivable with `tabular-nums`.
- `SessionDebtBlock` uses `key={i}` (array index) on `debtGroup` divs. If groups reorder in realtime (unlikely but possible), React won't re-render correctly. Use a stable key (`g.time + g.trainer` or similar).
- Empty state "Боржників немає 🎉" uses an emoji in the body — consistent with "Нікого 🎉" in AlertCardsBlock. Not a problem per se, but the PRODUCT.md brand is "Professional, Competent, Transparent" — one 🎉 is charming, two on the same screen may feel inconsistent with the serious-tool tone.

---

## Questions to Consider

- "If an admin arrives in the morning to a dashboard with 3 debtors, 2 negative balances, and 5 open slots — what is the one thing they should do first? Does the dashboard make that obvious?"
- "The statRow currently holds both financial-status and action-required cards. What if money cards had a subtle background (e.g. the current `--bg-2`) and action cards were on a `--danger-dim` tinted surface, even when count is 0?"
- "Six blocks all loading independently creates a brief 'construction zone' on fresh load. Could the blocks share a page-level loading state that resolves into content together, or is the independence worth the eventual stagger?"
