# Grid

> Автозгенеровано з `Vercel_raw/geist-docs/vercel.com/geist/grid.html` скриптом `scripts/geist/extract-components.mjs` (`npm run geist:components`). Не редагувати вручну.
> Класи — автентичні Geist (Tailwind), значення дивись у [tokens.md](../tokens.md).

## Структура сторінки (розділи)

- Grid
  - Grid
  - Basic grid
  - Solid cells
  - Responsive grid
  - Responsive Grid with responsive guide clipping cells
  - Grid with hidden row guides
  - Grid with hidden column guides
  - Grid with overlaying cells
  - Specific Grid with Guide Clipping
  - Grid with cross
  - Dashed grid with cross
  - Dashed grid with grid page
  - Best Practices
    - When to use
    - Behavior
    - Accessibility

## ⚠️ Варіанти-кольори — у themed-системі, не в HTML

Цей компонент керує варіантами через `data-*`-атрибути + themed-CSS (`.geist-new-<color>-fill/-contrast`, `[--themed-bg:var(--ds-<color>)]`), тому у відрендереному HTML класи однакові для всіх варіантів. **Кольори варіантів (base/fill/contrast/dark, light+dark) — у [theming.md](../theming.md).** Структуру (розмір/радіус/відступи) цей компонент тримає як single-instance utility-класи у відрендереному HTML сторінки (не згруповано тут); значення токенів — у [tokens.md](../tokens.md).

