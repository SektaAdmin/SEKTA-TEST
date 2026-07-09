# Geist-міграція — трекер сторінок

> Оновлюється агентом `geist-migrator` (по одному рядку за виклик — одна сторінка).
> Джерело правди: `docs/geist/` (сирий еталон Vercel/Geist: tokens.md, theming.md, components/*.md)
> + `docs/FRONTEND.md` (вже адаптовані під проєкт примітиви — ModalShell/FormField/badges/tabs/токени).
>
> Статуси: 🔲 не перевірено · ✅ чисто · ⚠️ є розбіжності (див. колонку «Знахідки»)

| # | Маршрут | Файл | Статус | Дата | Знахідки |
|---|---|---|---|---|---|
| 1 | / | app/page.tsx | ✅ чисто | 2026-07-09 | Без UI — серверний redirect-компонент (auth-гейт), CSS/JSX відсутні |
| 2 | /dashboard | app/dashboard/page.tsx | ✅ чисто | 2026-07-09 | 5 знахідок виправлено: debtTable→.data-table (+локальні модифікатори через :global), geistBadge→.badge badge-type/badge-success (новий генеричний модифікатор), skeleton→global .skeleton-bone, 140ms→--motion-fast, CollapseHead h2 обгортає button (ARIA accordion) |
| 3 | /login | app/login/page.tsx | ✅ чисто | 2026-07-09 | 1 знахідку виправлено: `.logo` font-size 22px хардкод → var(--fs-lg) (L1-заголовок екрана) |
| 4 | /clients | app/clients/page.tsx | 🔲 не перевірено | — | — |
| 5 | /clients/[id] | app/clients/[id]/page.tsx | 🔲 не перевірено | — | — |
| 6 | /schedule | app/schedule/page.tsx | 🔲 не перевірено | — | — |
| 7 | /schedule/[classId] | app/schedule/[classId]/page.tsx | 🔲 не перевірено | — | — |
| 8 | /schedule/templates | app/schedule/templates/page.tsx | 🔲 не перевірено | — | — |
| 9 | /sales | app/sales/page.tsx | 🔲 не перевірено | — | — |
| 10 | /accounting | app/accounting/page.tsx | 🔲 не перевірено | — | — |
| 11 | /accounting/trainers | app/accounting/trainers/page.tsx | 🔲 не перевірено | — | — |
| 12 | /audit | app/audit/page.tsx | 🔲 не перевірено | — | — |
| 13 | /journal | app/journal/page.tsx | 🔲 не перевірено | — | — |
| 14 | /halls | app/halls/page.tsx | 🔲 не перевірено | — | — |
| 15 | /trainers | app/trainers/page.tsx | 🔲 не перевірено | — | — |
| 16 | /training-types | app/training-types/page.tsx | 🔲 не перевірено | — | — |
| 17 | /tickets | app/tickets/page.tsx | 🔲 не перевірено | — | — |
| 18 | /settings | app/settings/page.tsx | 🔲 не перевірено | — | — |
| 19 | /settings/halls | app/settings/halls/page.tsx | 🔲 не перевірено | — | — |
| 20 | /settings/tickets | app/settings/tickets/page.tsx | 🔲 не перевірено | — | — |
| 21 | /settings/trainers | app/settings/trainers/page.tsx | 🔲 не перевірено | — | — |
| 22 | /settings/training-types | app/settings/training-types/page.tsx | 🔲 не перевірено | — | — |
| 23 | /trainer | app/trainer/page.tsx | 🔲 не перевірено | — | — |
| 24 | /trainer/schedule | app/trainer/schedule/page.tsx | 🔲 не перевірено | — | — |
| 25 | /trainer/clients | app/trainer/clients/page.tsx | 🔲 не перевірено | — | — |
| 26 | /trainer/my | app/trainer/my/page.tsx | 🔲 не перевірено | — | — |
| 27 | /client | app/client/page.tsx | 🔲 не перевірено | — | — |
| 28 | /client/schedule | app/client/schedule/page.tsx | 🔲 не перевірено | — | — |
| 29 | /client/subscriptions | app/client/subscriptions/page.tsx | 🔲 не перевірено | — | — |
| 30 | /client/visits | app/client/visits/page.tsx | 🔲 не перевірено | — | — |
