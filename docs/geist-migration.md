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
| 4 | /clients | app/clients/page.tsx | ✅ чисто | 2026-07-09 | Виправлено: skeleton→global .skeleton-bone; 14px→--fs-base (×10); .txPos/.txNeg→-text варіанти; 0.12s→--motion-fast (×5, width→--motion-standard); видалено dead-код editingClient. Відкладено (наскрізне): inline padding .page-foot (те саме на /sales,/journal,/audit) — винести в спільний клас при уніфікації |
| 5 | /clients/[id] | app/clients/[id]/page.tsx | ✅ чисто | 2026-07-09 | 9 знахідок виправлено: `.table`→глобальний .data-table (5 місць, uppercase-шапку прибрано; .tableWrap лишився як full-bleed скрол-зона картки); TONE_CLASS/.tone*→enrollmentBadgeClass() (канон-кольори з lib/badges.ts); balToneClass→balanceClass(); dead CSS видалено; 14px→--fs-base (×18); 0.15s/0.12s→--motion-fast; raw --success/--danger→-text (текст ≤18px; .msMetricAlert 24px навмисно raw); inline `<pre>`/порожня метрика→.credsBox/.msMetricEmpty; .confirmBox→calc(100%-32px)/max 360px як /sales |
| 6 | /schedule | app/schedule/page.tsx | ✅ чисто | 2026-07-09 | Аудит оркестратором (без субагента). Виправлено: 12/13/14/16px→--fs-xs/sm/base/md (×28); 0.1s/0.12s→--motion-fast; статус-тексти (SlotsFull/Free/Waitlist/Reserve/CancelledBadge)→-text варіанти. Навмисно raw: 10/11/15/17/28px мікро-типографіка сітки (поза шкалою); --danger на .nowLineTime/.mobileTlDayToday = індикаторний акцент «зараз/сьогодні» (збіг із кольором лінії); swipe-анімації 0.18s/0.2s зі своїм easing; inline-стилі в page.tsx — динамічне позиціювання. Спільні компоненти (MobileScheduleTimeline тощо) — поза скоупом рядка |
| 7 | /schedule/[classId] | app/schedule/[classId]/page.tsx | ✅ чисто | 2026-07-09 | Без UI — серверний redirect-стаб (`redirect('/schedule')`), CSS-модуля немає, локальних компонентів немає; реальний UI деталей заняття — ClassDetailModal (окрема сторінка трекера) |
| 8 | /schedule/templates | app/schedule/templates/page.tsx | ✅ чисто | 2026-07-09 | 3 знахідки виправлено: Список-вигляд → .data-table-wrap/.data-table (+.listCard з відступами як .gridCard); GridSkeleton → глобальний .skeleton-bone (skelPulse видалено); font-size хардкоди → токени (page ×11, SeriesModal ×6); бонус: .btnRowDel:hover текст → --danger-text. HallWeekGrid мікротипографія навмисно raw |
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
