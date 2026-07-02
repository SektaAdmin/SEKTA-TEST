# Typography

> Автозгенеровано з `Vercel_raw/geist-docs/vercel.com/geist/typography.html` скриптом `scripts/geist/extract-components.mjs` (`npm run geist:components`). Не редагувати вручну.
> Класи — автентичні Geist (Tailwind), значення дивись у [tokens.md](../tokens.md).

## Структура сторінки (розділи)

- Typography
    - Usage
    - Headings
    - Buttons
    - Label
    - Copy

## DOM-контракт (data-slot → класи)

### `table-root` — `<div>`

```
relative w-full overflow-x-auto
```

### `table` — `<table>`

```
text-sm text-gray-900 w-full caption-bottom typography-module__NzWdLG__table
```

### `table-header` — `<thead>`

```
[&_tr]:border-gray-400 [&_tr]:border-b
```

### `table-row` — `<tr>`

```
transition-colors
```

### `table-head` — `<th>`

```
h-10 border-gray-400 px-2 font-medium text-gray-900 [&:has([role=checkbox])]:pr-0 text-left align-middle whitespace-nowrap last:text-right [&>[role=checkbox]]:translate-y-[2px]
```

### `table-body` — `<tbody>`

```
[&_td:first-child]:rounded-l-sm [&_td:last-child]:rounded-r-sm [&_tr:hover]:bg-gray-100
```

### `table-cell` — `<td>`

3 варіанти класів (× = скільки разів на сторінці):

- `px-2 py-2.5 [&:has([data-cell-link=true])]:p-0 [&:has([role=checkbox])]:pr-0 align-middle whitespace-nowrap last:text-right [&>[role=checkbox]]:translate-y-[2px]` ×29
- `px-2 py-2.5 [&:has([data-cell-link=true])]:p-0 [&:has([role=checkbox])]:pr-0 align-middle whitespace-nowrap last:text-right [&>[role=checkbox]]:translate-y-[2px] text-label-13-mono` ×29
- `px-2 py-2.5 [&:has([data-cell-link=true])]:p-0 [&:has([role=checkbox])]:pr-0 align-middle last:text-right [&>[role=checkbox]]:translate-y-[2px] text-label-14 max-w-[160px] text-pretty whitespace-normal align-left text-gray-900` ×29

## Токен-класи, які використовує компонент

`bg-gray-100` · `border-gray-400` · `text-gray-900`

## Приклади коду зі сторінки

```
1 < p className = " text-copy-16 " > 2 Copy 16 < strong > with Strong </ strong > 3 </ p >
```

