# Fieldset

> Автозгенеровано з `Vercel_raw/geist-docs/vercel.com/geist/fieldset.html` скриптом `scripts/geist/extract-components.mjs` (`npm run geist:components`). Не редагувати вручну.
> Класи — автентичні Geist (Tailwind), значення дивись у [tokens.md](../tokens.md).

## Структура сторінки (розділи)

- Fieldset
  - Default
  - Disabled
  - With Long Content
  - Multiple Fieldsets
  - Without Footer
  - Without Title
  - With Error Text
  - With Warning Text
  - With Disabled Wall
  - Error Type
  - Warning Type

## ⚠️ Варіанти-кольори — у themed-системі, не в HTML

Цей компонент керує варіантами через `data-*`-атрибути + themed-CSS (`.geist-new-<color>-fill/-contrast`, `[--themed-bg:var(--ds-<color>)]`), тому у відрендереному HTML класи однакові для всіх варіантів. **Кольори варіантів (base/fill/contrast/dark, light+dark) — у [theming.md](../theming.md).** Структуру (розмір/радіус/відступи) цей компонент тримає як single-instance utility-класи у відрендереному HTML сторінки (не згруповано тут); значення токенів — у [tokens.md](../tokens.md).

