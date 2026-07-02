# Sheet

> Автозгенеровано з `Vercel_raw/geist-docs/vercel.com/geist/sheet.html` скриптом `scripts/geist/extract-components.mjs` (`npm run geist:components`). Не редагувати вручну.
> Класи — автентичні Geist (Tailwind), значення дивись у [tokens.md](../tokens.md).

## Структура сторінки (розділи)

- Sheet
  - Default
  - With Side
  - Best Practices
    - When to use
    - Behavior
    - Content
    - Accessibility

## DOM-контракт (data-slot → класи)

### `sheet-trigger` — `<button>`

```
outline-none m-0 p-0 border-0 align-baseline no-underline group/trigger relative cursor-pointer select-none transform translate-z-0 flex text-[var(--themed-fg,_var(--ds-background-100))] bg-[var(--themed-bg,_var(--ds-gray-1000))] font-medium !px-(--geist-gap-half) max-w-full items-center justify-center transition-[border-color, background,color,transform,box-shadow] duration-[time:150ms] ease-in-out data-[focus]:transition-none data-[focus]:shadow-[var(--ds-focus-ring)] [&_svg]:shrink-0 disabled:cursor-not-allowed aria-disabled:cursor-not-allowed disabled:text-[var(--ds-gray-700)] disabled:bg-[var(--ds-gray-100)] aria-disabled:text-[var(--ds-gray-700)] aria-disabled:bg-[var(--ds-gray-100)] disabled:![--themed-border:_var(--ds-gray-400)] [--x-padding:10px] [--height:40px] text-[14px] !pl-[var(--x-padding)] !pr-[var(--x-padding)] rounded-md h-[var(--height)]
```

