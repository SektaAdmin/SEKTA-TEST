# Choicebox

> Автозгенеровано з `Vercel_raw/geist-docs/vercel.com/geist/choicebox.html` скриптом `scripts/geist/extract-components.mjs` (`npm run geist:components`). Не редагувати вручну.
> Класи — автентичні Geist (Tailwind), значення дивись у [tokens.md](../tokens.md).

## Структура сторінки (розділи)

- Choicebox
  - Single-select
  - Multi-select
  - Disabled
  - Custom content
  - Best Practices
    - When to use
    - Behavior
    - Content
    - Accessibility

## DOM-контракт (data-slot → класи)

### `choicebox-group-item-option` — `<div>`

```
flex flex-row items-center not-has-[~.choicebox-content:not(:empty)]:h-full p-3 justify-between gap-6 has-checked:not-has-disabled:bg-[var(--ds-blue-100)] hover:has-checked:not-has-disabled:!bg-[var(--ds-blue-200)] has-checked:not-has-disabled:not-has-[~.choicebox-content:empty]:border-b has-checked:not-has-disabled:not-has-[~.choicebox-content:empty]:border-[var(--ds-blue-600)]
```

### `choicebox-group-item-title-description` — `<span>`

```
flex flex-col justify-start items-stretch gap-1 self-start flex-initial
```

