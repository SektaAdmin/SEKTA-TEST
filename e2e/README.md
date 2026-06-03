# E2E (Playwright)

Read-only smoke-тести проти **localhost:3000** з реальним Supabase.
Тести лише читають — нічого не створюють і не змінюють у БД.

## Налаштування (один раз)

Додай у `.env.local` креди тестового юзера (НЕ комітяться):

```
E2E_EMAIL=...
E2E_PASSWORD=...
```

> Краще окремий тестовий акаунт, а не свій робочий.

## Запуск

```bash
npm run test:e2e          # headless, усі тести
npm run test:e2e:ui       # інтерактивний UI-режим
npm run test:e2e:report   # відкрити HTML-звіт останнього прогону
```

`webServer` у `playwright.config.ts` піднімає `npm run dev` сам
(`reuseExistingServer: true` — якщо dev уже запущений, перевикористає,
щоб не воювати за `.next`).

## Як це працює

- `global-setup.ts` логіниться один раз через UI (`/login`) і зберігає cookies
  (`@supabase/ssr` тримає сесію в cookies) у `e2e/.auth/state.json` (gitignored).
- Усі тести стартують залогіненими через `storageState`.

## Межі (свідомо)

- **Тільки read-only.** Write-тести проти prod-бази не пишемо — БД спільна з
  робочою. Якщо знадобляться: окрема Supabase-гілка АБО маркер+прибирання.
- Візуальні баги однаково краще ловити скріншотом від користувача (за авторизацією
  автоскрін довіряти лише після перевірки storageState).
