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
  body:
    fontFamily: "Geist, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
  title:
    fontFamily: "Geist, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  headline:
    fontFamily: "Geist, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
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
    rounded: "{rounded.base}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.neutral-accent-dim}"
    textColor: "{colors.professional-black}"
    rounded: "{rounded.base}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.professional-black}"
    rounded: "{rounded.base}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.neutral-accent-text}"
    rounded: "{rounded.base}"
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
- **Body** (14px, 400, 1.5 line-height): Default text for descriptions, table content, labels. Used on light backgrounds; always >= 4.5:1 contrast.
- **Title** (16px, 500, 1.4 line-height): Section headings, card titles, list item labels. Medium emphasis.
- **Headline** (18px, 600, 1.3 line-height): Page titles, modal headlines, top-level information. Highest hierarchy below display.
- **Label** (12px, 500, letter-spacing 0.02em, 1.4 line-height): Form labels, badges, secondary navigation, captions. Small, distinct from body.

### Named Rules

**The No-Scare Rule.** Body text must achieve 4.5:1 contrast against its background. Placeholder text must also hit 4.5:1 (not the faded gray that ships by default). Secondary text (#525252) is never lighter than this on any background. **Semantic colors split fill from text:** the vivid token (`--success` / `--danger`) is for fills, borders, icons, and large text (≥18px or bold ≥14px); for semantic *text under 18px* on a light or dim background, use the darker `-text` variant (`--success-text` / `--danger-text`) — the vivid green/red fails 4.5:1 at small sizes. This is exactly the strain the rule exists to prevent, given the studio's variable lighting and older staff.

**The Breathing Room Rule.** Line-height is never less than 1.3. Line length is capped at 65–75ch for body text on full-width surfaces. This reduces cognitive load for busy admins in variable lighting.

## 4. Elevation

This system uses subtle shadows for spatial depth. There are no strong drop shadows or glassmorphism effects. Shadows serve one purpose: to signal hover, focus, or modal precedence. The effect is ambient and refined, never structural.

### Shadow Vocabulary
- **Shadow Small** (`0 1px 4px rgba(0,0,0,0.08)`): Subtle lift on input focus, faint hover glow under buttons.
- **Shadow Medium** (`0 4px 16px rgba(0,0,0,0.12)`): Dropdown menus, popover lift, secondary modals.
- **Shadow Large** (`0 8px 32px rgba(0,0,0,0.14)`): Primary modals, overlays, top-level UI.
- **Shadow Overlay** (`0 16px 48px rgba(0,0,0,0.18)`): Modal backdrop shadow; signals maximum elevation.

### Named Rules

**The Subtle Layering Rule.** Shadows exist only to signal state change or hierarchy (hover, focus, modal precedence). A surface at rest has no shadow. A button on hover lifts with Shadow Small. A modal is raised with Shadow Large. This discipline prevents shadow creep and keeps the visual field calm.

## 5. Components

### Buttons
- **Shape:** Rounded corners (12px radius base (Geist material-medium), 6px for controls (Geist material-base), 6px for smaller variants).
- **Primary:** Professional Black background, white text, 8px vertical × 16px horizontal padding. Hover: stays black (no color shift, only opacity or slight scale).
- **Secondary:** Neutral Accent Dim background, black text, same shape and padding. Hover: Neutral Accent Dim 2. Used for non-primary actions.
- **Ghost:** Transparent background, black text, black border (1px). Hover: subtle background lift (Neutral Accent Dim). Used for tertiary actions.
- **Danger:** Danger color background, white text. Hover: Danger (darkened slightly via opacity). Used for destructive actions only.
- **States:** Focus ring (2px solid Professional Black, 2px offset) on all interactive states. No blur or glow; clean outlines only.

### Inputs / Fields
- **Style:** 1px border (Neutral Border Subtle), Neutral Background Tertiary fill, 8px vertical × 12px horizontal padding, 6px border-radius.
- **Focus:** Border shifts to Professional Black. Box-shadow: `0 0 0 3px rgba(0,0,0,0.08)` (subtle glow, no color tint).
- **Error:** Border becomes Danger red. Text error message appears below.
- **Disabled:** Border becomes Neutral Border Strong (darker). Text and background slightly muted.

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
- **Row Hover:** Hover state applies Neutral Background Tertiary to the entire row.
- **Border:** 1px Neutral Border Subtle between rows.
- **Header:** Bold text (500 weight), Neutral Text Secondary color, Neutral Background Tertiary fill.
- **Padding:** 12px cell padding (vertical 8px, horizontal 12px).

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
