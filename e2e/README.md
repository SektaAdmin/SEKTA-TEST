# E2E (Playwright)

Read-only smoke-тести проти **localhost:3000** з реальним Supabase.
Тести лише читають — нічого не створюють і не змінюють у БД.

## Налаштування (один раз)

Додай у `.env.local` креди тестових акаунтів (НЕ комітяться). Телефон — у тому ж
форматі, що в полі логін-форми (`+380…`):

```
E2E_EMAIL=...              # staff (owner/admin), логін по email
E2E_PASSWORD=...
E2E_CLIENT_PHONE=+380…     # client, логін по телефону
E2E_CLIENT_PASSWORD=...
E2E_TRAINER_PHONE=+380…    # trainer, логін по телефону
E2E_TRAINER_PASSWORD=...
```

> Краще окремі тестові акаунти, а не свої робочі.
> Кабінети trainer/client заводяться кнопкою «Створити кабінет» (TrainerModal /
> картка клієнта) — звідти беруться логін+пароль.

## Запуск

```bash
npm run test:e2e          # headless smoke-тести (read-only assertions)
npm run test:e2e:ui       # інтерактивний UI-режим
npm run test:e2e:report   # відкрити HTML-звіт останнього прогону
```

## Огляд через браузер (3 ролі)

Один прогін проходить ключові екрани **адмінки, кабінету тренера і кабінету клієнта**
і зберігає скріншоти в `e2e/.review/<role>/` — щоб переглянути живий додаток очима
(як «дивиться» impeccable). Не падає, якщо кредів тренера/клієнта немає — пропускає роль.

```bash
npm run review:browser          # headless, скріни в e2e/.review/
npm run review:browser:headed   # з видимим браузером (дивитися наживо)
```

Які екрани знімаються — у `e2e/review-all-roles.spec.ts` (масиви `SCREENS`).

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
