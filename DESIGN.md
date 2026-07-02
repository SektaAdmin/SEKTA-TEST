---
name: SEKTA-CRM Design System
description: Professional studio operations toolkit — calm, efficient, transparent.
colors:
  professional-black: "#000000"
  neutral-ink: "#171717"
  neutral-text-secondary: "#525252"
  neutral-text-tertiary: "#737373"
  neutral-bg-primary: "#fafafa"
  neutral-bg-secondary: "#ffffff"
  neutral-bg-tertiary: "#f2f2f2"
  neutral-border-subtle: "rgba(0,0,0,0.08)"
  neutral-border-hover: "rgba(0,0,0,0.16)"
  neutral-border-strong: "rgba(0,0,0,0.14)"
  neutral-accent-dim: "#f5f5f5"
  neutral-accent-dim-2: "#ebebeb"
  neutral-accent-text: "#ffffff"
  brand-50: "#f7f7f7"
  brand-100: "#ededed"
  brand-200: "#e0e0e0"
  brand-300: "#c4c4c4"
  brand-400: "#9e9e9e"
  brand-500: "#6b6b6b"
  brand-600: "#2e2e2e"
  brand-700: "#1a1a1a"
  brand-800: "#121212"
  brand-900: "#0a0a0a"
  danger: "#d93535"
  danger-dim: "rgba(217,53,53,0.08)"
  danger-text: "#b32020"
  danger-border: "rgba(217,53,53,0.25)"
  success: "#00a544"
  success-dim: "#f0fdf4"
  success-text: "#007a33"
  success-border: "rgba(0,165,68,0.25)"
  warning: "#b87a00"
  warning-dim: "rgba(184,122,0,0.08)"
  warning-text: "#805600"
  warning-border: "rgba(184,122,0,0.25)"
  semantic-fop: "#2d78d6"
  semantic-fop-dim: "rgba(45,120,214,0.10)"
  semantic-card: "#c07000"
  semantic-card-dim: "rgba(192,112,0,0.10)"
  semantic-deposit: "#8b34d4"
  semantic-deposit-dim: "rgba(139,52,212,0.10)"
typography:
  fontFamily: "Geist, sans-serif"
  weights: { normal: 400, medium: 500, semibold: 600 }
  # Шкала Geist (vercel.com/geist/typography), звірено з CSS-бандлом. Кожен розмір
  # у парі з line-height (px). Заголовки — semibold + негативний tracking (підпис
  # Geist); текст (copy/label) — tracking normal. Токени --fs-*/--lh-*/--tracking-*.
  scale:
    xs:   { fontSize: "12px", lineHeight: "16px", role: "label — бейджі, дрібні мітки" }
    sm:   { fontSize: "13px", lineHeight: "18px", role: "copy — другорядний текст" }
    base: { fontSize: "14px", lineHeight: "20px", role: "body — таблиці, поля, дефолт" }
    md:   { fontSize: "16px", lineHeight: "24px", role: "заголовки секцій, суми" }
    lg:   { fontSize: "20px", lineHeight: "26px", tracking: "-0.4px", role: "L1 — заголовки сторінок/модалок" }
    xl:   { fontSize: "24px", lineHeight: "32px", tracking: "-0.96px", role: "heading" }
    "2xl":{ fontSize: "32px", lineHeight: "40px", tracking: "-1.28px", role: "великі числа дашборда" }
rounded:
  xs: "4px"
  base: "12px"
  sm: "6px"
  badge: "20px"
  full: "999px"
spacing:
  control-h: "32px"
  topbar-py: "16px"
  topbar-px: "28px"
components:
  button-primary:
    backgroundColor: "{colors.professional-black}"
    textColor: "{colors.neutral-accent-text}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.neutral-bg-secondary}"
    border: "1px solid {colors.neutral-border-subtle}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    border: "none"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.neutral-accent-text}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  input-field:
    backgroundColor: "{colors.neutral-bg-tertiary}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  chip:
    backgroundColor: "{colors.neutral-bg-tertiary}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.badge}"
    padding: "4px 12px"
  chip-active:
    backgroundColor: "{colors.neutral-accent-dim-2}"
    textColor: "{colors.professional-black}"
    rounded: "{rounded.badge}"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.neutral-bg-secondary}"
    rounded: "{rounded.base}"
    padding: "16px"
---

# Design System: SEKTA-CRM

## 1. Overview

**Creative North Star: "The Studio Operations Toolkit"**

SEKTA-CRM is a professional instrument for studio management. Every interface element serves an operation: scheduling, financial tracking, attendance logging, payroll calculation. The system rejects unnecessary decoration, redundant hierarchy, and visual noise. It is calm by necessity — the admin is busy, making split-second decisions under time pressure. The toolkit whispers, never shouts. Typography is clean; spacing is breathing room; colors are semantic, not aesthetic. The user should never wonder what a button does or where data lives.

**Key Characteristics:**
- Clear information hierarchy with minimal visual noise
- Fast operations with minimal clicks or scrolling
- Semantic color for intent (danger = red, success = green, financial roles distinct)
- Subtle depth via shadows, not color or borders
- Professional black as the only primary accent, used sparingly (≤10% of screen)

## 2. Colors

The palette is restrained: tinted neutrals carry 90%+ of the surface, with semantic accent colors reserved for action and status. Professional Black is the single primary accent.

### Primary
- **Professional Black** (#000000): Buttons, text emphasis, primary actions. Used on ≤10% of any screen to maximize signal-to-noise.

### Neutral
- **Neutral Ink** (#171717): Body text on light backgrounds. Default text color. Pure-neutral near-black — an exact match for Geist gray-1000; Professional Black (#000) stays reserved for the primary accent.
- **Neutral Text Secondary** (#525252): Secondary copy, descriptions, lower-hierarchy labels.
- **Neutral Text Tertiary** (#737373): Disabled text, placeholders, lowest-hierarchy labels.
- **Neutral Background Primary** (#fafafa): Default page background. Exact match for Geist `--ds-background-200` — pure-neutral near-white, achromatic, not warm.
- **Neutral Background Secondary** (#ffffff): Cards, containers, modals — Geist `--ds-background-100`. Sit a hair above the page; separated by a subtle border.
- **Neutral Background Tertiary** (#f2f2f2): Form inputs, subtle surface distinction. Exact match for Geist gray-100.
- **Neutral Border Subtle** (rgba(0,0,0,0.08)): Dividers, light borders, default stroke.
- **Neutral Border Hover** (rgba(0,0,0,0.16)): Hover state for interactive elements.
- **Neutral Border Strong** (rgba(0,0,0,0.14)): Strong dividers, contrast-critical borders.
- **Neutral Accent Dim** (#f5f5f5): Secondary button background.
- **Neutral Accent Dim 2** (#ebebeb): Hover or selected state for secondary buttons.

### Semantic (Grayscale Brand Scale)
- **Brand 50–950**: Pure neutral (achromatic, HSL 0,0%) scale — the authentic Geist light gray ramp verified against Vercel's CSS bundle — for badge backgrounds, subtle layering, and tonal depth. Values map to Geist `--ds-gray-*`: `50=#fafafa` (bg-200), `100=#f2f2f2` (gray-100), `200=#ebebeb`, `300=#e6e6e6`, `400=#c9c9c9` (gray-500), `500=#a8a8a8`, `600=#8f8f8f` (gray-700), `700=#7d7d7d`, `800=#4d4d4d` (gray-900), `900=#171717` (gray-1000), `950=#000000`. **Contrast caveat:** Geist's own mid-grays fail 4.5:1 for small text on white (gray-700 `#8f8f8f` ≈ 3.0:1, gray-800 `#7d7d7d` ≈ 3.5:1) — use them for fills/borders/large text only; small text takes the darker Ink/Secondary/Tertiary tokens below.

### Semantic Status Colors
- **Danger** (#d93535): Error states, destructive actions. Used for fills, borders, icons, and large text (≥18px or bold ≥14px). Always paired with Danger Dim for backgrounds.
- **Danger Text** (#b32020): Darker red for danger *text under 18px* (e.g. balance figures, hints) on white or Danger Dim. Clears 4.5:1 where #d93535 does not. Fills/borders stay on Danger.
- **Success** (#00a544): Completed actions, confirmed state. Used for fills, borders, icons, and large text.
- **Success Text** (#007a33): Darker green for success *text under 18px* (e.g. positive balances, chips) on white or Success Dim. Clears 4.5:1 where #00a544 does not. Fills/borders stay on Success.
- **Warning** (#b87a00): Cautions, amber alerts. Used for fills, borders, icons, and large text. Do not use for danger (reserved for red).
- **Warning Text** (#805600): Darker amber for warning *text under 18px* (e.g. cancelled/waitlist badges, zero-balance chips) on white or Warning Dim. Clears 4.5:1 where #b87a00 does not. Fills/borders stay on Warning.

### Semantic Roles (Finance)
- **FOP (Cashless)** (#2d78d6): Blue; represents card or online payment method.
- **Card (Physical)** (#c07000): Orange; represents physical card payment.
- **Deposit** (#8b34d4): Purple; represents account balance / deposit method.

### Named Rules

**The One Voice Rule.** Professional Black is the only primary accent color on any given screen. It appears in ≤10% of the surface area (typically buttons, key numbers, active states). Secondary and semantic colors (status, financial roles) never compete; they occupy <5% together.

**The Semantic Fidelity Rule.** Danger is always red (#d93535). Success is always green (#00a544). Warning is always amber (#b87a00). Financial roles are distinct by name and color: FOP (blue), Card (orange), Deposit (purple). These are not decorative; they carry meaning the user must parse at a glance.

## 3. Typography

**Display Font:** Geist Sans (with system sans-serif fallback)
**Character:** Neutral, grotesque sans-serif with tall x-height and tight spacing tuned for UI text. Chosen for legibility at all sizes and across variable lighting conditions in a studio environment. Loaded via `geist/font/sans` (variable, weights 400/500/600 in use), token `--font`.

**Mono Font:** Geist Mono (`geist/font/mono`, token `--font-mono`). Used **only for column alignment**: money amounts in tables and phone numbers. Never for headings, labels, body text, or any other surface — mono exists to line up digits, not to decorate.

### Hierarchy

Digitized from the **Geist type scale** (`vercel.com/geist/typography`, verified against the CSS bundle). Each step pairs a font-size with a line-height in px; tokens `--fs-*` / `--lh-*`. Weights: `--fw-normal` 400 (text) · `--fw-medium` 500 (controls/buttons) · `--fw-semibold` 600 (headings).

- **xs** (12/16, 400): Badges, small captions, `count-chip`. → `--fs-xs`
- **sm** (13/18, 400): Secondary / helper text. → `--fs-sm`
- **base** (14/20, 400): Default UI text — tables, fields, descriptions. → `--fs-base`
- **md** (16/24, 500–600): Section headings, card titles, prominent sums. → `--fs-md`
- **lg** (20/26, 600, tracking −0.4px): L1 — page & modal titles. → `--fs-lg`
- **xl** (24/32, 600, tracking −0.96px): Large headings. → `--fs-xl`
- **2xl** (32/40, 600, tracking −1.28px): Big dashboard numbers. → `--fs-2xl`

**Geist signature — negative tracking on headings.** Semibold headings tighten with a negative letter-spacing (`--tracking-lg/xl/2xl`, ≈ −0.06 × size); body **copy/label** text stays at normal tracking. Apply `--tracking-*` only to the semibold heading steps.

### Named Rules

**The No-Scare Rule.** Body text must achieve 4.5:1 contrast against its background. Placeholder text must also hit 4.5:1 (not the faded gray that ships by default). Secondary text (#525252) is never lighter than this on any background. **Semantic colors split fill from text:** the vivid token (`--success` / `--danger`) is for fills, borders, icons, and large text (≥18px or bold ≥14px); for semantic *text under 18px* on a light or dim background, use the darker `-text` variant (`--success-text` / `--danger-text`) — the vivid green/red fails 4.5:1 at small sizes. This is exactly the strain the rule exists to prevent, given the studio's variable lighting and older staff.

**The Breathing Room Rule.** For **body / multi-line text** (steps xs–md) line-height is never less than 1.3× — the Geist scale honours this (base 14/20 = 1.43, md 16/24 = 1.5). Large single-line **headings** (lg–2xl) run tighter by design (2xl 32/40 = 1.25) — that tightness is the display look, not a body-text setting. Line length is capped at 65–75ch for body text on full-width surfaces. This reduces cognitive load for busy admins in variable lighting.

## 4. Elevation

This system uses subtle shadows for spatial depth. There are no strong drop shadows or glassmorphism effects. Shadows serve one purpose: to signal hover, focus, or modal precedence. The effect is ambient and refined, never structural.

### Shadow Vocabulary
- **Shadow Small** (`0 1px 4px rgba(0,0,0,0.08)`): Subtle lift on input focus, faint hover glow under buttons.
- **Shadow Medium** (`0 4px 16px rgba(0,0,0,0.12)`): Dropdown menus, popover lift, secondary modals.
- **Shadow Large** (`0 8px 32px rgba(0,0,0,0.14)`): Primary modals, overlays, top-level UI.
- **Shadow Overlay** (`0 16px 48px rgba(0,0,0,0.18)`): Legacy overlay shadow.
- **Shadow Menu** (`--shadow-menu`): authentic Geist `--ds-shadow-menu` — a four-layer soft shadow whose first layer is a `0 0 0 1px rgba(0,0,0,0.08)` ring (≈ `--border`). Used by dropdown/select popovers (`.fs-content`). The ring replaces a CSS border.
- **Shadow Modal** (`--shadow-modal`): authentic Geist `--ds-shadow-modal` — same shape, larger blur radii for top-level dialogs (`ModalShell`). First layer is the 1px ring, so modals carry **no** CSS border.

### Named Rules

**The Subtle Layering Rule.** Shadows exist only to signal state change or hierarchy (hover, focus, modal precedence). A surface at rest has no shadow. A button on hover lifts with Shadow Small. A modal is raised with Shadow Large. This discipline prevents shadow creep and keeps the visual field calm.

## 5. Components

### Buttons

Shared global utilities in `globals.css`: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger` — each self-contained (used as a single class). Modifier `.btn-sm` for compact inline actions (settings). Verified against the authentic **Geist Button** (`Vercel_DS/Button`, `geist-new-*` classes). Common base: height `--control-h` (32px desktop = Geist *small* / 44px mobile), radius `--radius-sm` (6px = Geist `rounded-md`), 14px / 500 weight, `1px` transparent border baseline, `--motion-fast` transitions.

The Geist model has **four** variants — a primary fill, a bordered *secondary* (outline), a borderless *tertiary* (ghost), and an *error* (danger):

- **Primary** (Geist *default*): Professional Black fill (`--accent`; Geist's own base is gray-1000 #171717, but the project takes pure #000 per One Voice), white text. Hover: `--accent-hover` #171717 — a subtle lighten (Geist lightens the fill on hover).
- **Secondary** (Geist *secondary*): white fill (`--bg-2`) + 1px border (`--border` ≈ Geist gray-400 #eaeaea), Ink text. Hover: gray-100 fill (`--bg-3`) + `--border-hover`. The natural counterpart to a primary — this is the **"Скасувати"** button in `ModalFooter`.
- **Ghost** (Geist *tertiary*): transparent, **no border at rest**, Ink text. Hover: subtle fill (`--accent-dim`) + a `--border` outline appears. For inline / toolbar actions.
- **Danger** (Geist *error*): Danger fill (`--danger`), white text. Hover: opacity 0.9. Destructive actions only.
- **Disabled** (all variants): muted colors, not opacity — gray-100 fill (`--bg-3`), muted text (`--text-3`), `--border` border (mirrors Geist `disabled:bg-gray-100 disabled:text-gray-700`).
- **Focus:** focus-visible ring (2px solid Professional Black, 2px offset) via the global `:focus-visible` rule. (Geist rings in blue-700; the project keeps the ring black per One Voice.) No blur or glow on buttons.

### Inputs / Fields

Canonical implementation: `components/ui/FormField.tsx` (+ `FormField.module.css`) — label + control + errorHint + hint.

- **Style:** 1px border (`--border`), Neutral Background Tertiary fill (`--bg-3`), 8px vertical × 12px horizontal padding, 6px border-radius (`--radius-sm`).
- **Focus:** Border shifts to Professional Black. Box-shadow `0 0 0 3px rgba(0,0,0,0.08)` (subtle glow, no color tint).
- **Error:** `aria-invalid="true"` (set by FormField when an error is present) → Danger red border; focus glow tints to `--danger-dim`. The message below uses `--danger-text` (darker red — clears 4.5:1 at 11px where `--danger` does not).
- **Disabled:** Border becomes Neutral Border Strong (`--border-strong`, darker), text muted to `--text-3`.

### Chips / Tags
- **Default:** Neutral Background Tertiary fill, black text, rounded pill (20px border-radius), 4px vertical × 12px horizontal padding.
- **Active/Selected:** Neutral Accent Dim 2 fill, same padding and radius.
- **Semantic (Status/Role):** When a chip represents a status (e.g., "Attended", "Cancelled") or financial role (e.g., "FOP", "Deposit"), the background uses the semantic color at Dim intensity (e.g., Danger Dim for danger status), with semantic text color.

### Cards / Containers
- **Corner Style:** 12px border-radius (Geist material-medium). Small controls (buttons, inputs, chips) use 6px (Geist material-base).
- **Background:** Neutral Background Secondary (white) for content cards. Neutral Background Tertiary for secondary or grouped cards.
- **Shadow Strategy:** Card at rest: no shadow. On hover: Shadow Small. Modal card: Shadow Large.
- **Border:** Neutral Border Subtle (1px) for separation, or none if background contrast is sufficient.
- **Internal Padding:** 16px (all sides) for standard card; 12px for compact variants.

### Navigation (Sidebar / Top Bar)
- **Style:** Horizontal top bar (64px height, 16px vertical × 28px horizontal padding). Sidebar (196px width on desktop, hidden on mobile <640px).
- **Typography:** Label size (12px) for nav items, bold on active state.
- **State:** Active nav item: Professional Black text (or inverted background if dark).
- **Mobile (≤640px):** Control height becomes 44px (touch-target minimum). Top bar padding reduces to 12px vertical × 16px horizontal.

### Tables

Shared global utility `.data-table` (+ `.data-table-wrap`) in `globals.css`. Verified against the authentic **Geist Table** (`Vercel_DS/Table`, `data-slot` primitives — the demo is JS-rendered, so values were read from the component's compiled class strings in the page bundle).

- **Header (`th`):** Geist `h-10 px-2 font-medium text-gray-900 text-left` — a **normal-case** cell, **not** the uppercase micro-caps pattern. So: 40px tall (`h-10`), 14px / 500 weight, Ink text, **no background fill** (thead carries only a bottom border), left-aligned.
- **Cell (`td`):** Geist `px-2 py-2.5` → 10px vertical (exact). Horizontal padding is 12px (Geist's borderless table uses `px-2`=8px; we keep the bordered-card wrapper, so 12px gives the edge cells breathing room from the border).
- **Row hover:** Neutral Background Tertiary (`--bg-3` = Geist gray-100, exact) on the whole row (Geist `interactive` → `bg-gray-100`).
- **Border:** 1px Neutral Border Subtle between rows (≈ Geist gray-400 `#eaeaea`); last row has none.
- **Wrapper:** app composition — white card (`--bg-2`), 1px border, 12px radius, `overflow-x:auto`. (Geist's own `TableRoot` is borderless `relative w-full overflow-x-auto`; the card is a project choice for standalone table pages.)
- **Deviation:** Geist auto-right-aligns the **last** column (`last:text-right`, assumes an actions/amount column). We do **not** apply this globally — app tables have varied last-column content; alignment stays per-page.

### Badges

Shared global `.badge` + `.badge-*` modifiers (`globals.css`); labels/classes via `lib/badges.ts`. Geometry verified against the authentic **Geist Badge** (`Vercel_DS/Badge`, cva `badgeVariants`, size `sm`).

- **Geometry:** `inline-flex` centered, `rounded-full` (pill, `--radius-full`), 20px tall (Geist `h-5`), 8px horizontal padding, 4px gap (Geist `gap-1`), 11px / 500 weight, `letter-spacing: 0.2px` (Geist sm tracking), `font-variant-numeric: tabular-nums`.
- **Color model:** Geist *low-contrast* — a pale fill + a saturated darker text of the same hue. The project keeps its **own semantic palette** (frozen in Session 0) rather than re-tinting to Geist's exact `-200/-900` pairs, so badge colors stay coherent with icons, borders, and balance chips elsewhere.
- **Deviation:** Geist badges are **borderless**. We retain a 1px semantic border so the project's paler Dim fills stay legible without re-tinting the palette. A conscious divergence (same spirit as keeping `--accent: #000` in Session 1).

### Status Dot
Global `.status-dot` (+ state modifiers, `.status-dot-item` for the labelled form). Verified against **Geist StatusDot** (`Vercel_DS/Status Dot`, cva `size-2.5 rounded-full`).
- **Dot:** 10px circle (`size-2.5`), `border-radius: 50%`. State → semantic color (`-neutral` gray / `-success` / `-warning` / `-danger` / `-info` blue). Geist maps neutral→accents-2, building→warning, ready→cyan, error→error.
- **Labelled:** `.status-dot-item` — dot + 14px label, 8px gap (Geist `text-label-14 ml-2`).

### Pagination
`components/ui/Pagination.tsx` — numbered pager (page-size select · range · page buttons). Geist's own `Pagination` is only a previous/next nav, so the numbered pager is an **app composition** built from the Session-1 button tokens (`--control-h`, `--radius-sm`, `--border`). Prev/next use lucide `ChevronLeft`/`ChevronRight` (16px); the active page uses the Neutral Accent Dim state.

### Modals / Overlays
`components/ui/ModalShell.tsx` (+ `.module.css`) — the canonical dialog shell (header · scrollable body · footer). Two desktop widths (`form` 440px / `detail` 760px); on mobile ≤640px every modal becomes a bottom-sheet.
- **Backdrop:** authentic Geist `--ds-overlay-backdrop-color` = background-200 (`#fafafa`) at 0.8 opacity → a **light frosted veil**, not a dark scrim (`--modal-backdrop`, kept separate from `--overlay-bg` because that token also feeds shadow-color consumers). `backdrop-filter: blur(2px)` retained.
- **Card:** white (`--bg-2`), 12px radius (Geist material-medium), elevation via **Shadow Modal** (the 1px ring in that shadow is the only border — no CSS border).
- **Footer:** buttons right-aligned — cancel = `.btn-secondary`, save = `.btn-primary` (or `.btn-danger`). `ModalFooter.tsx` composes the Session-1 button classes. (Geist's own modal footer is a full-width bordered action bar; right-aligned buttons are a project choice, set in Session 1.)

### Filter Select / Dropdown
`components/ui/FilterSelect.tsx` (Radix Select) styled by `.fs-*` in `globals.css`. Trigger: `--control-h` tall, 1px border, `--radius-sm`, chevron; open/checked state uses the Neutral Accent Dim.
- **Popover (`.fs-content`):** 12px radius + 4px inner padding, elevation via **Shadow Menu** (ring replaces border). Verified against authentic **Geist Menu** (`docs/geist/components/menu.md`; the popover itself is portal-rendered, so its shadow comes from the `--ds-shadow-menu` token).
- **Item (`.fs-item`):** `rounded-md` (`--radius-sm`), 8×10px padding, 10px gap (Geist menu item `rounded-md px-3 gap-2.5`). Hover → gray-100 (`--bg-3`). **Selected → neutral** (`--accent-dim` fill + 500 weight, **not** a colored accent) — mirrors Geist's `bg-gray-alpha-100 text-gray-1000` selected state.
- **Deviation:** Geist menu items are 40px tall (`h-10`); ours are ~36px for CRM density (same rationale as the table cells).

### Filter Chips
`.filterChips` / `.filterChip` / `.filterChipActive` (`globals.css`) — single-select pill row shared by mobile `/sales` and `/schedule`. 28px tall, full-radius pill, 500 weight. Inactive hover: `--border-hover` + Ink text. Active: Neutral Accent Dim fill + `--accent-border` + Ink (neutral, per the `--accent: #000` model). Closest Geist analog is the *secondary* Tabs pill; the chip row is an app composition.

## 6. Do's and Don'ts

### Do:
- **Do** use Professional Black for primary buttons, critical text, and icons.
- **Do** preserve the 4.5:1 contrast ratio for all body text (no muted grays on light backgrounds).
- **Do** use semantic colors (red for danger, green for success, amber for warning) only for their intended meanings.
- **Do** keep shadows subtle; they signal state change only, not decoration.
- **Do** pair weights from the Geist family; never introduce a second sans-serif without strong reason.
- **Do** embrace white space. A calm interface is spacious, not cramped.
- **Do** document financial colors by their role (FOP, Card, Deposit) not by hex value; meaning carries the design forward.

### Don't:
- **Don't** use dark mode with purple gradients, neon accents, or glassmorphism. This is a business tool, not a gaming interface.
- **Don't** use muted gray text on tinted backgrounds (e.g., #737373 on #fafafa). Gray text on colored bg looks washed out. Use semantic color instead.
- **Don't** use more than one primary accent on a single screen. Professional Black is the only primary; semantic colors are secondary.
- **Don't** apply shadows to surfaces at rest. Shadows signal state; resting surfaces are flat.
- **Don't** use border-left or border-right stripes as a primary design element. Use full borders, background tints, or leading icons instead.
- **Don't** pair two similar sans-serifs (e.g., Geist with Helvetica). Pair on a contrast axis (serif + sans) or use one family in multiple weights.
- **Don't** bury critical information behind scrolling or multiple clicks. Fast operations with minimal friction are the north star.
- **Don't** introduce decorative gradients, skewed cards, or nested card grids. These are AI slop tells; the design must stay restrained and functional.
