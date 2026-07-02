# Code Block

> Автозгенеровано з `Vercel_raw/geist-docs/vercel.com/geist/code-block.html` скриптом `scripts/geist/extract-components.mjs` (`npm run geist:components`). Не редагувати вручну.
> Класи — автентичні Geist (Tailwind), значення дивись у [tokens.md](../tokens.md).

## Структура сторінки (розділи)

- Code Block
  - Default
  - No filename
  - Highlighted lines
  - Added & removed lines
  - Referenced lines
  - Language switcher
  - Language switcher with tabs
  - Hidden line numbers
  - Open in v0
  - Best Practices
    - When to use
    - Behavior
    - Content

## ⚠️ Варіанти-кольори — у themed-системі, не в HTML

Цей компонент керує варіантами через `data-*`-атрибути + themed-CSS (`.geist-new-<color>-fill/-contrast`, `[--themed-bg:var(--ds-<color>)]`), тому у відрендереному HTML класи однакові для всіх варіантів. **Кольори варіантів (base/fill/contrast/dark, light+dark) — у [theming.md](../theming.md).** Структуру (розмір/радіус/відступи) цей компонент тримає як single-instance utility-класи у відрендереному HTML сторінки (не згруповано тут); значення токенів — у [tokens.md](../tokens.md).

## Приклади коду зі сторінки

```
1 // Usage: 2 // enabled by `--debug-prerender` 3 // route patterns: [id...] or [...id] 4 // NODE_OPTIONS='--debug-prerender' node 5 function MyComponent ( props ) { 6 return ( 7 < div > 8 < h1 > Hello, { props . name } ! </ h1 > 9 < p > This is an example React component. </ p > 10 </ div > 11 ) ; 12 }
```

```
1 function MyComponent ( props ) { 2 return ( 3 < div > 4 < h1 > Hello, { props . name } ! </ h1 > 5 < p > This is an example React component. </ p > 6 </ div > 7 ) ; 8 }
```

```
1 function MyComponent ( props ) { 2 return ( 3 < div > 4 < h1 > Hello, { props . name } ! </ h1 > 5 < p > This is an example React component. </ p > 6 </ div > 7 ) ; 8 }
```

```
1 module . exports = { 2 experimental : { 3 appDir : true , 4 } , 5 appDir : true , 6 }
```

```
1 function MyComponent ( props ) { 2 return ( 3 < div > 4 < h1 > Count: { props . count } </ h1 > 5 </ div > 6 ) ; 7 }
```

```
1 function MyComponent ( props ) { 2 return ( 3 < div > 4 < h1 > Hello, { props . name } ! </ h1 > 5 < p > Good to see you </ p > 6 </ div > 7 ) ; 8 }
```

```
1 function MyComponent ( props ) { 2 return ( 3 < div > 4 < h1 > Hello, { props . name } ! </ h1 > 5 < p > Good to see you </ p > 6 </ div > 7 ) ; 8 }
```

```
function MyComponent ( props ) { return ( < div > < h1 > Hello, { props . name } ! </ h1 > < p > Good to see you </ p > </ div > ) ; }
```

```
1 function MyComponent ( props ) { 2 return ( 3 < div > 4 < h1 > Hello, { props . name } ! </ h1 > 5 < p > This is an example React component. </ p > 6 </ div > 7 ) ; 8 }
```

```
1 function MyComponent ( props ) { 2 return ( 3 < div > 4 < h1 > Hello, { props . name } ! </ h1 > 5 < p > This is an example React component. </ p > 6 </ div > 7 ) ; 8 }
```

