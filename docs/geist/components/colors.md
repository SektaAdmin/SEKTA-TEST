# Colors

> Автозгенеровано з `Vercel_raw/geist-docs/vercel.com/geist/colors.html` скриптом `scripts/geist/extract-components.mjs` (`npm run geist:components`). Не редагувати вручну.
> Класи — автентичні Geist (Tailwind), значення дивись у [tokens.md](../tokens.md).

## Структура сторінки (розділи)

- Colors
  - Scales
  - Backgrounds
  - Colors 1–3: Component Backgrounds
  - Colors 4-6: Borders
  - Colors 7-8: High Contrast Backgrounds
  - Colors 9-10: Text and Icons

## Варіанти (утилітарні корені, згруповано за формою)

### Форма 1 (3 варіантів)

**База:**

```
tracking-normal inline-flex shrink-0 items-center justify-center rounded-full whitespace-nowrap py-0.5 font-medium capitalize tabular-nums **:data-[slot=icon]:block **:data-[slot=icon]:shrink-0 **:data-[slot=icon]:[-webkit-transform:translate(0px,0px)] text-[12px] h-6 px-3 gap-1 **:data-[slot=icon]:size-3.5 **:data-[slot=icon]:-ml-0.5
```

**Відмінності (по одному рядку на варіант):**

- `bg-(--ds-gray-900) dark-theme:bg-(--ds-gray-500) text-(--ds-contrast-fg)`
- `bg-(--ds-blue-200) text-(--ds-blue-900)`
- `bg-(--ds-purple-200) text-(--ds-purple-900)`

