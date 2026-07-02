# Geist — themed-система варіантів (кольори компонентів)

> Автозгенеровано з CSS-бандлів Geist скриптом `scripts/geist/extract-theming.mjs` (`npm run geist:theming`). Не редагувати вручну.
> **Це закриває 🟡 «тонкі» компоненти**, чиї варіанти-кольори живуть у CSS, а не в класах HTML (Button, Toast, Note, Alert, Tooltip тощо).
> Компонент застосовує `.geist-new-themed` + один клас кольору (`.geist-new-<color>`) ± модифікатор (`-fill`/`-contrast`/`-dark`), а CSS виставляє `--themed-bg/fg/border`. Значення `var(--ds-*)`/`var(--geist-*)` дивись у [tokens.md](tokens.md).

**Модифікатори:** `base` = аутлайн (прозорий фон + кольорова рамка/текст) · `-fill` = суцільна заливка · `-contrast` = приглушена (світлий фон + темний текст) · `-dark` = темніша заливка.

**Як застосувати інлайн (Tailwind-arbitrary, як у Button):** `[--themed-bg:var(--ds-<color>)] [--themed-fg:var(--ds-contrast-fg)]` — компонент читає ці CSS-змінні.

## new themed (актуальна, на `--ds-*`)

Сучасна система. «success» = синій (default-дія), «error» = червоний, «warning» = амбер.

### `.geist-new-alert`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--geist-background)`<br>fg: `var(--geist-highlight-pink)`<br>border: `var(--themed-fg)` | bg: `var(--geist-background)`<br>fg: `var(--geist-highlight-pink)`<br>border: `var(--themed-fg)` |
| fill (solid) | bg: `var(--geist-highlight-pink)`<br>fg: `var(--ds-contrast-fg)`<br>border: `var(--geist-highlight-pink)` | bg: `var(--geist-highlight-pink)`<br>fg: `var(--ds-contrast-fg)`<br>border: `var(--geist-highlight-pink)` |

### `.geist-new-cyan`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--geist-background)`<br>fg: `var(--geist-cyan)`<br>border: `var(--themed-fg)` | bg: `var(--geist-background)`<br>fg: `var(--geist-cyan)`<br>border: `var(--themed-fg)` |
| fill (solid) | bg: `var(--geist-cyan)`<br>fg: `var(--ds-contrast-fg)`<br>border: `var(--geist-cyan)` | bg: `var(--geist-cyan)`<br>fg: `var(--ds-contrast-fg)`<br>border: `var(--geist-cyan)` |
| contrast (subtle) | bg: `var(--geist-cyan-lighter)`<br>fg: `var(--geist-cyan-dark)`<br>border: `var(--geist-cyan)` | bg: `var(--geist-cyan-lighter)`<br>fg: `var(--geist-cyan-dark)`<br>border: `var(--geist-cyan)` |
| dark-fill | bg: `var(--geist-cyan-dark)`<br>fg: `var(--ds-contrast-fg)`<br>border: `var(--geist-cyan-dark)` | bg: `var(--geist-cyan-dark)`<br>fg: `var(--ds-contrast-fg)`<br>border: `var(--geist-cyan-dark)` |

### `.geist-new-error`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--ds-red-100)`<br>fg: `var(--ds-red-900)`<br>border: `var(--ds-red-400)` | bg: `var(--ds-red-100)`<br>fg: `var(--ds-red-900)`<br>border: `var(--ds-red-400)` |
| fill (solid) | bg: `var(--ds-red-800)`<br>fg: `#f5f5f5`<br>border: `var(--themed-bg)` | bg: `var(--ds-red-800)`<br>fg: `var(--ds-contrast-fg)`<br>border: `var(--themed-bg)` |
| contrast (subtle) | bg: `var(--geist-error-lighter)`<br>fg: `var(--geist-error-dark)`<br>border: `var(--geist-error)` | bg: `var(--geist-error-lighter)`<br>fg: `var(--geist-error-dark)`<br>border: `var(--geist-error)` |

### `.geist-new-ghost`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `transparent`<br>fg: `var(--accents-5)`<br>border: `transparent` | bg: `transparent`<br>fg: `var(--accents-5)`<br>border: `transparent` |

### `.geist-new-secondary`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--geist-background)`<br>fg: `var(--geist-secondary)`<br>border: `var(--themed-fg)` | bg: `var(--geist-background)`<br>fg: `var(--geist-secondary)`<br>border: `var(--themed-fg)` |
| fill (solid) | bg: `var(--geist-secondary)`<br>fg: `var(--ds-contrast-fg)`<br>border: `var(--geist-secondary)` | bg: `var(--geist-secondary)`<br>fg: `var(--ds-contrast-fg)`<br>border: `var(--geist-secondary)` |
| contrast (subtle) | bg: `var(--geist-secondary-lighter)`<br>fg: `var(--geist-secondary-dark)`<br>border: `var(--geist-secondary)` | bg: `var(--geist-secondary-lighter)`<br>fg: `var(--geist-secondary-dark)`<br>border: `var(--geist-secondary)` |

### `.geist-new-success`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--ds-blue-100)`<br>fg: `var(--ds-blue-900)`<br>border: `var(--ds-blue-400)` | bg: `var(--ds-blue-100)`<br>fg: `var(--ds-blue-900)`<br>border: `var(--ds-blue-400)` |
| fill (solid) | bg: `var(--geist-success)`<br>fg: `var(--ds-contrast-fg)`<br>border: `var(--geist-success)` | bg: `var(--geist-success)`<br>fg: `var(--ds-contrast-fg)`<br>border: `var(--geist-success)` |
| contrast (subtle) | bg: `var(--geist-success-lighter)`<br>fg: `var(--geist-success-dark)`<br>border: `var(--geist-success)` | bg: `var(--geist-success-lighter)`<br>fg: `var(--geist-success-dark)`<br>border: `var(--geist-success)` |

### `.geist-new-violet`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--geist-background)`<br>fg: `var(--geist-violet)`<br>border: `var(--themed-fg)` | bg: `var(--geist-background)`<br>fg: `var(--geist-violet)`<br>border: `var(--themed-fg)` |
| fill (solid) | bg: `var(--ds-purple-200)`<br>fg: `var(--ds-purple-900)`<br>border: `var(--ds-purple-400)` | bg: `var(--ds-purple-200)`<br>fg: `var(--ds-purple-900)`<br>border: `var(--ds-purple-400)` |
| contrast (subtle) | bg: `var(--geist-violet-lighter)`<br>fg: `var(--geist-violet-dark)`<br>border: `var(--geist-violet)` | bg: `var(--geist-violet-lighter)`<br>fg: `var(--geist-violet-dark)`<br>border: `var(--geist-violet)` |

### `.geist-new-warning`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--ds-amber-100)`<br>fg: `var(--ds-amber-900)`<br>border: `var(--ds-amber-400)` | bg: `var(--ds-amber-100)`<br>fg: `var(--ds-amber-900)`<br>border: `var(--ds-amber-400)` |
| fill (solid) | bg: `var(--ds-amber-800)`<br>fg: `#0a0a0a`<br>border: `var(--themed-bg)` | bg: `var(--ds-amber-800)`<br>fg: `#0a0a0a`<br>border: `var(--themed-bg)` |
| contrast (subtle) | bg: `var(--geist-warning-lighter)`<br>fg: `var(--geist-warning-dark)`<br>border: `var(--geist-warning)` | bg: `var(--geist-warning-lighter)`<br>fg: `var(--geist-warning-dark)`<br>border: `var(--geist-warning)` |
| dark-fill | bg: `#bd5200`<br>border: `#bd5200` | bg: `#f59e0b`<br>fg: `#000`<br>border: `#f59e0b` |

## legacy themed (стара, на `--geist-*`)

Стара система (сумісність). Мапиться на legacy `--geist-*` семантичні токени.

### `.geist-alert`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--geist-background)`<br>fg: `var(--geist-highlight-pink)`<br>border: `var(--themed-fg)` | bg: `var(--geist-background)`<br>fg: `var(--geist-highlight-pink)`<br>border: `var(--themed-fg)` |
| fill (solid) | bg: `var(--geist-highlight-pink)`<br>fg: `#fff`<br>border: `var(--geist-highlight-pink)` | bg: `var(--geist-highlight-pink)`<br>fg: `#fff`<br>border: `var(--geist-highlight-pink)` |

### `.geist-cyan`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--geist-background)`<br>fg: `var(--geist-cyan)`<br>border: `var(--themed-fg)` | bg: `var(--geist-background)`<br>fg: `var(--geist-cyan)`<br>border: `var(--themed-fg)` |
| fill (solid) | bg: `var(--geist-cyan)`<br>fg: `#fff`<br>border: `var(--geist-cyan)` | bg: `var(--geist-cyan)`<br>fg: `#fff`<br>border: `var(--geist-cyan)` |
| contrast (subtle) | bg: `var(--geist-cyan-lighter)`<br>fg: `var(--geist-cyan-dark)`<br>border: `var(--geist-cyan)` | bg: `var(--geist-cyan-lighter)`<br>fg: `var(--geist-cyan-dark)`<br>border: `var(--geist-cyan)` |
| dark-fill | bg: `var(--geist-cyan-dark)`<br>fg: `#fff`<br>border: `var(--geist-cyan-dark)` | bg: `var(--geist-cyan-dark)`<br>fg: `#fff`<br>border: `var(--geist-cyan-dark)` |

### `.geist-error`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--geist-background)`<br>fg: `var(--geist-error)`<br>border: `var(--themed-fg)` | bg: `var(--geist-background)`<br>fg: `var(--geist-error)`<br>border: `var(--themed-fg)` |
| fill (solid) | bg: `var(--geist-error)`<br>fg: `#fff`<br>border: `var(--geist-error)` | bg: `var(--geist-error)`<br>fg: `#fff`<br>border: `var(--geist-error)` |
| contrast (subtle) | bg: `var(--geist-error-lighter)`<br>fg: `var(--geist-error-dark)`<br>border: `var(--geist-error)` | bg: `var(--geist-error-lighter)`<br>fg: `var(--geist-error-dark)`<br>border: `var(--geist-error)` |

### `.geist-ghost`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `transparent`<br>fg: `var(--accents-5)`<br>border: `transparent` | bg: `transparent`<br>fg: `var(--accents-5)`<br>border: `transparent` |

### `.geist-lite`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--accents-1)`<br>fg: `var(--geist-foreground)`<br>border: `var(--accents-2)` | bg: `var(--accents-1)`<br>fg: `var(--geist-foreground)`<br>border: `var(--accents-2)` |

### `.geist-secondary`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--geist-background)`<br>fg: `var(--geist-secondary)`<br>border: `var(--themed-fg)` | bg: `var(--geist-background)`<br>fg: `var(--geist-secondary)`<br>border: `var(--themed-fg)` |
| fill (solid) | bg: `var(--geist-secondary)`<br>fg: `#fff`<br>border: `var(--geist-secondary)` | bg: `var(--geist-secondary)`<br>fg: `#fff`<br>border: `var(--geist-secondary)` |
| contrast (subtle) | bg: `var(--geist-secondary-lighter)`<br>fg: `var(--geist-secondary-dark)`<br>border: `var(--geist-secondary)` | bg: `var(--geist-secondary-lighter)`<br>fg: `var(--geist-secondary-dark)`<br>border: `var(--geist-secondary)` |

### `.geist-success`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--geist-background)`<br>fg: `var(--geist-success)`<br>border: `var(--themed-fg)` | bg: `var(--geist-background)`<br>fg: `var(--geist-success)`<br>border: `var(--themed-fg)` |
| fill (solid) | bg: `var(--geist-success)`<br>fg: `#fff`<br>border: `var(--geist-success)` | bg: `var(--geist-success)`<br>fg: `#fff`<br>border: `var(--geist-success)` |
| contrast (subtle) | bg: `var(--geist-success-lighter)`<br>fg: `var(--geist-success-dark)`<br>border: `var(--geist-success)` | bg: `var(--geist-success-lighter)`<br>fg: `var(--geist-success-dark)`<br>border: `var(--geist-success)` |

### `.geist-violet`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--geist-background)`<br>fg: `var(--geist-violet)`<br>border: `var(--themed-fg)` | bg: `var(--geist-background)`<br>fg: `var(--geist-violet)`<br>border: `var(--themed-fg)` |
| fill (solid) | bg: `var(--geist-violet)`<br>fg: `#fff`<br>border: `var(--geist-violet)` | bg: `var(--geist-violet)`<br>fg: `#fff`<br>border: `var(--geist-violet)` |
| contrast (subtle) | bg: `var(--geist-violet-lighter)`<br>fg: `var(--geist-violet-dark)`<br>border: `var(--geist-violet)` | bg: `var(--geist-violet-lighter)`<br>fg: `var(--geist-violet-dark)`<br>border: `var(--geist-violet)` |

### `.geist-warning`

| Модифікатор | Light | Dark |
|---|---|---|
| base (outline) | bg: `var(--geist-background)`<br>fg: `var(--geist-warning)`<br>border: `var(--themed-fg)` | bg: `var(--geist-background)`<br>fg: `var(--geist-warning)`<br>border: `var(--themed-fg)` |
| fill (solid) | bg: `var(--geist-warning)`<br>fg: `#fff`<br>border: `var(--geist-warning)` | bg: `var(--geist-warning)`<br>fg: `#fff`<br>border: `var(--geist-warning)` |
| contrast (subtle) | bg: `var(--geist-warning-lighter)`<br>fg: `var(--geist-warning-dark)`<br>border: `var(--geist-warning)` | bg: `var(--geist-warning-lighter)`<br>fg: `var(--geist-warning-dark)`<br>border: `var(--geist-warning)` |
| dark-fill | bg: `#bd5200`<br>border: `#bd5200` | bg: `#f59e0b`<br>fg: `#000`<br>border: `#f59e0b` |

