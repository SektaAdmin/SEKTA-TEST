---
name: verify
description: Прогін зміни в живому застосунку (localhost:3000) через Playwright зі збереженою auth-сесією. Використовувати перед комітом нетривіальних UI/flow-змін.
---

# Verify: як прогнати зміну в живому застосунку

## Критичне обмеження

**Dev-сервер підключений до PROD Supabase.** Write-флоу (створення класів,
записи, продажі) НЕ доводити до кінця — зупинятись перед фінальною кнопкою.
Перевіряти read-only частину; фінальний write користувач перевіряє на Vercel
(його усталений workflow).

## Рецепт

1. Dev зазвичай уже запущений (`lsof -i :3000`). Якщо запущений — НЕ `npm run build` (конфлікт .next); типи через `npx tsc --noEmit`.
2. Auth-сесії збережені: `e2e/.auth/state.json` (staff), `client-state.json`, `trainer-state.json`. Якщо протухли — `npm run test:e2e` пережене global-setup (креди в `.env.local`).
3. Driver-скрипт (НЕ тест) у scratchpad:

```js
const { chromium } = require('/Users/oleksandr/Documents/sekta-crm/node_modules/@playwright/test')
const page = await (await browser.newContext({
  storageState: '<repo>/e2e/.auth/state.json',
  viewport: { width: 1280, height: 850 }, // mobile: 375×812 + isMobile + hasTouch
})).newPage()
await page.goto('http://localhost:3000/<route>', { waitUntil: 'networkidle' })
```

4. Скриншоти в scratchpad, дивитись через Read.

## Пастки

- CSS Modules хешують класи: селектор `[class*="cellSelected"]` працює, а точний match — ні. Для статусів/станів надійніше `title`/`aria`-атрибути.
- Після зміни фільтрів/дати давати `waitForTimeout(~1000)` на refetch.
- ESLint у репо не налаштований — `npx eslint`/`next lint` не запускати.
