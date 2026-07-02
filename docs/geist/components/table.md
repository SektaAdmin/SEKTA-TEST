# Table

> Автозгенеровано з `Vercel_raw/geist-docs/vercel.com/geist/table.html` скриптом `scripts/geist/extract-components.mjs` (`npm run geist:components`). Не редагувати вручну.
> Класи — автентичні Geist (Tailwind), значення дивись у [tokens.md](../tokens.md).

## Структура сторінки (розділи)

- Table
  - Basic table
  - Striped table
  - Bordered table
  - Interactive table
  - Full featured table
  - Virtualized table
  - Best Practices
    - When to use
    - Behavior
    - Content

## DOM-контракт (data-slot → класи)

### `table-root` — `<div>`

```
relative w-full overflow-x-auto
```

### `table` — `<table>`

```
text-sm text-gray-900 w-full caption-bottom
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

5 варіанти класів (× = скільки разів на сторінці):

- `[&_tr:where(:nth-child(odd))]:bg-background-200 [&_td:first-child]:rounded-l-sm [&_td:last-child]:rounded-r-sm [&_tr:hover]:bg-gray-100` ×2
- `[&_td:first-child]:rounded-l-sm [&_td:last-child]:rounded-r-sm` ×1
- `[&_tr:where(:nth-child(odd))]:bg-background-200 [&_td:first-child]:rounded-l-sm [&_td:last-child]:rounded-r-sm` ×1
- `[&_td:first-child]:rounded-l-sm [&_td:last-child]:rounded-r-sm [&_tr:not(:last-child)]:border-b [&_tr:not(:last-child)]:border-gray-400` ×1
- `[&_td:first-child]:rounded-l-sm [&_td:last-child]:rounded-r-sm [&_tr:hover]:bg-gray-100` ×1

### `table-cell` — `<td>`

2 варіанти класів (× = скільки разів на сторінці):

- `px-2 py-2.5 [&:has([data-cell-link=true])]:p-0 [&:has([role=checkbox])]:pr-0 align-middle whitespace-nowrap last:text-right [&>[role=checkbox]]:translate-y-[2px]` ×96
- `px-2 py-2.5 [&:has([data-cell-link=true])]:p-0 [&:has([role=checkbox])]:pr-0 align-middle whitespace-nowrap last:text-right [&>[role=checkbox]]:translate-y-[2px] text-gray-1000 font-medium` ×2

### `table-colgroup` — `<colgroup>`

```
(без класів)
```

### `table-col` — `<col>`

3 варіанти класів (× = скільки разів на сторінці):

- `w-[22%]` ×4
- `w-[44%]` ×2
- `w-[11%]` ×2

### `table-footer` — `<tfoot>`

```
border-gray-400 font-medium border-t [&>tr]:last:border-b-0
```

## Токен-класи, які використовує компонент

`bg-background-200` · `bg-gray-100` · `border-gray-400` · `text-gray-1000` · `text-gray-900`

