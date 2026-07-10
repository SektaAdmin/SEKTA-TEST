# Geist-міграція — трекер (посесійні етапи)

> **Протокол сесії, модельна матриця і гарди — навичка `.claude/skills/geist-session/SKILL.md`.**
> Нова сесія = «поїхали» = перший 🔲-етап; одна сесія = один етап. Примітка-blockquote
> під заголовком етапу визначає пакетування.
>
> Джерело правди: `docs/geist/` (сирий еталон Vercel/Geist: tokens.md, theming.md,
> components/*.md) + `docs/FRONTEND.md` (адаптовані примітиви — ModalShell/FormField/badges/tabs/токени).
>
> Статуси: 🔲 не перевірено · ✅ чисто · ⚠️ є розбіжності (див. колонку «Знахідки»)

## Конвенції прогону (устоялись на Етапі 0, нові знахідки міряти об них)

- skeleton → глобальний `.skeleton-bone` (локальні передруки shimmer видаляти);
- бейджі → глобальний `.badge` + модифікатори (є генеричні `.badge-success`/`.badge-danger`); мапери — тільки `lib/badges.ts` (`enrollmentBadgeClass`, `balanceClass`, `paymentClass`);
- таблиці → `.data-table`(-wrap); локальні оверрайди через `.wrap :global(.data-table) .cell` (без `!important`);
- типографіка: 12/13/14/16px → `--fs-xs/sm/base/md`; 20/24px → `--fs-lg/xl`;
- рухи: 0.1–0.15s → `--motion-fast`, 0.18–0.2s hover-переходи → `--motion-standard` (токени ВЖЕ містять easing — не дописувати `ease`);
- семантичний текст ≤18px → `--success-text/--danger-text/--warning-text` (заливки/бордери/іконки та текст >18px — raw `--success/--danger/--warning`);
- навмисно raw (НЕ чіпати): мікро-типографіка календарних сіток (10/11px), індикаторні акценти «зараз/сьогодні» на `--danger`, swipe-анімації зі своїм easing, динамічні inline-стилі позиціювання, `.paymentTabs` (рішення Сесії 12);
- `.page-foot` padding — у глобальному класі (inline-дублі прибрано).

## Етап 0 — ✅ виконано 2026-07-09 (сторінки 1–9)

| # | Маршрут | Файл | Статус | Дата | Знахідки |
|---|---|---|---|---|---|
| 1 | / | app/page.tsx | ✅ чисто | 2026-07-09 | Без UI — серверний redirect-компонент (auth-гейт), CSS/JSX відсутні |
| 2 | /dashboard | app/dashboard/page.tsx | ✅ чисто | 2026-07-09 | 5 знахідок виправлено: debtTable→.data-table (+локальні модифікатори через :global), geistBadge→.badge badge-type/badge-success (новий генеричний модифікатор), skeleton→global .skeleton-bone, 140ms→--motion-fast, CollapseHead h2 обгортає button (ARIA accordion) |
| 3 | /login | app/login/page.tsx | ✅ чисто | 2026-07-09 | 1 знахідку виправлено: `.logo` font-size 22px хардкод → var(--fs-lg) (L1-заголовок екрана) |
| 4 | /clients | app/clients/page.tsx | ✅ чисто | 2026-07-09 | Виправлено: skeleton→global .skeleton-bone; 14px→--fs-base (×10); .txPos/.txNeg→-text варіанти; 0.12s→--motion-fast (×5, width→--motion-standard); видалено dead-код editingClient. Відкладено (наскрізне): inline padding .page-foot (те саме на /sales,/journal,/audit) — винести в спільний клас при уніфікації |
| 5 | /clients/[id] | app/clients/[id]/page.tsx | ✅ чисто | 2026-07-09 | 9 знахідок виправлено: `.table`→глобальний .data-table (5 місць, uppercase-шапку прибрано; .tableWrap лишився як full-bleed скрол-зона картки); TONE_CLASS/.tone*→enrollmentBadgeClass() (канон-кольори з lib/badges.ts); balToneClass→balanceClass(); dead CSS видалено; 14px→--fs-base (×18); 0.15s/0.12s→--motion-fast; raw --success/--danger→-text (текст ≤18px; .msMetricAlert 24px навмисно raw); inline `<pre>`/порожня метрика→.credsBox/.msMetricEmpty; .confirmBox→calc(100%-32px)/max 360px як /sales |
| 6 | /schedule | app/schedule/page.tsx | ✅ чисто | 2026-07-09 | Аудит оркестратором (без субагента). Виправлено: 12/13/14/16px→--fs-xs/sm/base/md (×28); 0.1s/0.12s→--motion-fast; статус-тексти (SlotsFull/Free/Waitlist/Reserve/CancelledBadge)→-text варіанти. Навмисно raw: 10/11/15/17/28px мікро-типографіка сітки (поза шкалою); --danger на .nowLineTime/.mobileTlDayToday = індикаторний акцент «зараз/сьогодні» (збіг із кольором лінії); swipe-анімації 0.18s/0.2s зі своїм easing; inline-стилі в page.tsx — динамічне позиціювання. Спільні компоненти (MobileScheduleTimeline тощо) — поза скоупом рядка |
| 7 | /schedule/[classId] | app/schedule/[classId]/page.tsx | ✅ чисто | 2026-07-09 | Без UI — серверний redirect-стаб (`redirect('/schedule')`), CSS-модуля немає, локальних компонентів немає; реальний UI деталей заняття — ClassDetailModal (Етап V) |
| 8 | /schedule/templates | app/schedule/templates/page.tsx | ✅ чисто | 2026-07-09 | 3 знахідки виправлено: Список-вигляд → .data-table-wrap/.data-table (+.listCard з відступами як .gridCard); GridSkeleton → глобальний .skeleton-bone (skelPulse видалено); font-size хардкоди → токени (page ×11, SeriesModal ×6); бонус: .btnRowDel:hover текст → --danger-text. HallWeekGrid мікротипографія навмисно raw |
| 9 | /sales | app/sales/page.tsx | ✅ чисто | 2026-07-09 | Аудит оркестратором (без субагента). Виправлено: skeleton→глобальний .skeleton-bone (локальний shimmer видалено); 14/13px→--fs-base/--fs-sm; 0.12s→--motion-fast (і в SaleModal.module.css: 14px ×4, all 0.12s); danger-hover тексти (.filterClear/.btnDel)→--danger-text; inline-стилі рядка витрати/доходу→.mutedCell/.opLabel/.opIcon. Наскрізне закрито: padding .page-foot перенесено в глобальний клас, inline-дублі прибрано з /sales,/clients,/journal,/audit. Навмисно: .paymentTabs локальна (рішення Сесії 12); confirmBox 300px desktop + responsive mobile override — ок |

## Етап I — ✅ виконано 2026-07-09 (Фінанси, сторінки 10–13)

> /audit і /journal — майже дзеркальні модулі; всі три сторінки вже на глобальних `.data-table`/`.skeleton-bone`, лишились дрібні хардкоди (font-size px, 0.12s, raw --danger).
> Урок етапу: `!important` на td/th-класах знімати ТІЛЬКИ з рескоупом `.обгортка :global(.data-table) .клас` — гола `.class` (0,1,0) програє глобальному `.data-table td` (0,1,1); haiku на таке не здатен без точного рецепта (див. рядок 10).

| # | Маршрут | Файл | Статус | Дата | Знахідки |
|---|---|---|---|---|---|
| 10 | /accounting | app/accounting/page.tsx | ✅ чисто | 2026-07-09 | 4 знахідки виправлено: th/td-оверрайди (.thPrice/.thDeposit/.thAmt/.thMethod/.iconCell/.checkCell) → рескоуп `.tableDesktop :global(.data-table) .cell` без `!important`; `.amtExpense`/`.amtOtherIncome` (текст ≤18px) → `--danger-text`/`--success-text` (базовий клас для mobile-span + рескоуплений для td); font-size 12/13/14px → --fs-xs/sm/base (×21); мертвий inline flex-style на .cardList (page.tsx:32) видалено. Навмисно raw: `.balanceCardVal` 26px/22px — hero-number поза шкалою (прецедент .msMetricAlert); iconIncome/Expense та border .expenseCard — raw --success/--danger коректно (іконки/бордери). Пастка сесії: haiku-fixer зняв `!important` без рескоупу (програш специфічності `.data-table td`) → відкат + перезапуск на sonnet за гардом |
| 11 | /accounting/trainers | app/accounting/trainers/page.tsx | ✅ чисто | 2026-07-09 | Без UI — серверний redirect-стаб (`redirect('/accounting')`), CSS-модуля і локальних компонентів немає |
| 12 | /audit | app/audit/page.tsx | ✅ чисто | 2026-07-09 | 8 знахідок виправлено (haiku-fixer, гард пройдено): font-size 12/13/14px→--fs-xs/sm/base (×7: .topbarCount/.empty/.cardTitle/.cardDateTime/.cardMeta/.paginationInfo/.pageBtn); `.pageBtn` transition 0.12s→--motion-fast (×3); inline tabular-nums на td дати (page.tsx:258) + `.deliveredCell` → спільний `.tabularCell`. Навмисно raw: `.clearBtn:hover` var(--danger) — іконка X, не текст; skeleton-ширини — розмірні px; badge-* через глобальний .badge+lib/badges.ts; `.pagination` padding — локальний оверрайд ідентичний /journal (узгоджено в сесії 9) |
| 13 | /journal | app/journal/page.tsx | ✅ чисто | 2026-07-09 | 10 знахідок виправлено (haiku-fixer, гард пройдено), дзеркальні до /audit: font-size 12/13/14px→--fs-xs/sm/base (×7); `.pageBtn` transition 0.12s→--motion-fast (×3); inline tabular-nums на td часу → локальний `.tabularCell` (мірор audit-патерну); inline cursor:pointer на `<tr>` → селектор `.tableDesktop :global(.data-table) tbody tr`. Навмисно raw: skeleton-ширини (розмірні px), `.pagination` padding (ідентичний /audit), badge-class-cancelled/badge-completed — канонічні глобальні |

## Етап II — ✅ виконано 2026-07-10 (Довідники /settings, сторінки 14–22)

> №14–18 — redirect-стаби (аудит тривіальний, можна одним комітом). №19–21 рендеряться спільним рушієм `app/settings/_RefEntityPage.tsx` + `settings.module.css` — фактичний аудит ОДИН на трьох. №22 — окрема drag-drop сторінка (не через RefEntityPage).

| # | Маршрут | Файл | Статус | Дата | Знахідки |
|---|---|---|---|---|---|
| 14 | /halls | app/halls/page.tsx | ✅ чисто | 2026-07-10 | Без UI — redirect-стаб (`redirect('/settings?tab=halls')`), CSS/JSX відсутні |
| 15 | /trainers | app/trainers/page.tsx | ✅ чисто | 2026-07-10 | Без UI — redirect-стаб (`redirect('/settings?tab=trainers')`), CSS/JSX відсутні |
| 16 | /training-types | app/training-types/page.tsx | ✅ чисто | 2026-07-10 | Без UI — redirect-стаб (`redirect('/settings?tab=training-types')`), CSS/JSX відсутні |
| 17 | /tickets | app/tickets/page.tsx | ✅ чисто | 2026-07-10 | Без UI — redirect-стаб (`redirect('/settings?tab=tickets')`), CSS/JSX відсутні |
| 18 | /settings | app/settings/page.tsx | ✅ чисто | 2026-07-10 | Без UI — redirect-стаб (`redirect('/settings/tickets')`), CSS/JSX відсутні |
| 19 | /settings/halls | app/settings/halls/page.tsx | ✅ чисто | 2026-07-10 | Спільний рушій `_RefEntityPage.tsx`+`settings.module.css` (аудит один на №19–21). 18 правок виправлено (sonnet-fixer, список змішаний): font-size 13/14px→--fs-sm/--fs-base (×7); 0.12s→--motion-fast (.toggleBtn ×4, .editBtn/.restoreBtn ×3, .archiveToggle); chevron архіву 0.18s ease→--motion-standard; `.toggleFalse:hover`+`.toggleActiveFalse` color→--danger-text (текст ≤18px); `.mono`→рескоуп `.tableDesktop :global(.data-table) .mono` без `!important`; `.toggleActive*` — 6× `!important` зняті без рескоупу (hover-правила виключають active через `:not()`); `.restoreBtn` `opacity:1 !important` видалено як no-op (opacity батьківського td не скасовується дочірнім), `:disabled` без `!important`; `.skelCardName` — dead CSS видалено. Навмисно raw: `.toggleBtn` 11px — TRUE/FALSE мікро-лейбл поза шкалою (--fs-xs=12px); skeleton-ширини розмірні px; `_RefEntityPage.tsx:73` динамічна inline-width skeleton. Структурно чисто: ToggleBtns/tabNav/ArchiveSection — канонічний патерн /settings за FRONTEND.md (не дублюють .tabs-*); глобальні .badge/.data-table/.skeleton-bone використані коректно |
| 20 | /settings/tickets | app/settings/tickets/page.tsx | ✅ чисто | 2026-07-10 | Спільний рушій — виправлення у рядку №19; `tickets/page.tsx` структурно чисте (badge через глобальний `.badge badge-type`, без локальних дублів) |
| 21 | /settings/trainers | app/settings/trainers/page.tsx | ✅ чисто | 2026-07-10 | Спільний рушій — виправлення у рядку №19; `trainers/page.tsx` структурно чисте (badge через глобальний `.badge badge-completed`, `.dash`/`.handle` без дублів; TrainerModal — Етап VI, поза скоупом) |
| 22 | /settings/training-types | app/settings/training-types/page.tsx | ✅ чисто | 2026-07-10 | Окрема drag-drop сторінка (НЕ через `_RefEntityPage`). 6 знахідок виправлено (sonnet-fixer): font-size 13px→--fs-sm (`.saving`), 16px→--fs-md (`.handle`/`.handleMobile`); inline `style={{width:32}}` на `<th>` драг-колонки (skeleton+реальна шапка) → новий клас `.handleCol{width:32px}`; inline color на «—» (page.tsx:183) → `styles.dash` із settings.module.css. Навмисно raw: skeleton-ширини px (page.tsx:43,44,45,59); inline `opacity:0.65` на архівній mobile-картці — дзеркало канонічного патерну `_RefEntityPage.tsx:191` (лишено для консистентності, звести в клас при можливому спільному проході). Структурно чисто: ArchiveSection/ToggleBtns/tabNav/.data-table/.badge badge-type — канонічний патерн /settings; `.handle`/`.handleMobile`/`.dragOver`/`.saving` — власна drag-специфіка без дублювання Geist-примітивів |

## Етап III — 🔲 Тренерський кабінет

> №24: власного CSS немає (спільний вже чистий schedule.module.css) — ревʼю лише TSX (TrainerSchedule.tsx 1426 р., тріаж оркестратором). №25 тягне ClientSessionsModal/CreateClientModal (локальні для зони — в скоупі рядка).

| # | Маршрут | Файл | Статус | Дата | Знахідки |
|---|---|---|---|---|---|
| 23 | /trainer | app/trainer/page.tsx | 🔲 не перевірено | — | — |
| 24 | /trainer/schedule | app/trainer/schedule/page.tsx | 🔲 не перевірено | — | — |
| 25 | /trainer/clients | app/trainer/clients/page.tsx | 🔲 не перевірено | — | — |
| 26 | /trainer/my | app/trainer/my/page.tsx | 🔲 не перевірено | — | — |

## Етап IV — 🔲 Клієнтський кабінет

> Усі 4 сторінки (+/client/visits/[id]) ділять ОДИН `app/client/client.module.css` (1463 р.) — CSS-прохід один на етап, далі по-сторінково TSX. Відомий дубль: локальний `@keyframes skelPulse` (L120-123) замість глобального `.skeleton-bone`.

| # | Маршрут | Файл | Статус | Дата | Знахідки |
|---|---|---|---|---|---|
| 27 | /client | app/client/page.tsx | 🔲 не перевірено | — | — |
| 28 | /client/schedule | app/client/schedule/page.tsx | 🔲 не перевірено | — | — |
| 29 | /client/subscriptions | app/client/subscriptions/page.tsx | 🔲 не перевірено | — | — |
| 30 | /client/visits | app/client/visits/page.tsx | 🔲 не перевірено | — | +visits/[id]/VisitDetail.tsx |

## Етап V — 🔲 ClassDetailModal

> Найбільший спільний компонент (45КБ TSX + 20КБ CSS), використовується адмінкою/тренером/дашбордом — окрема сесія.

| # | Скоуп | Файл | Статус | Дата | Знахідки |
|---|---|---|---|---|---|
| 31 | ClassDetailModal | components/ClassDetailModal.tsx + .module.css | 🔲 не перевірено | — | — |

## Етап VI — 🔲 Спільні компоненти

> Цілі-примітиви НЕ аудитувати (вони і є еталон): ModalShell, FormField, ModalFooter. SaleModal/SeriesModal вже пройдені (Етап 0, рядки 8–9). HallWeekGrid — частково (мікротипографія raw).

| # | Скоуп | Файли | Статус | Дата | Знахідки |
|---|---|---|---|---|---|
| 32 | Навігація | components/Sidebar, BottomNav, CabinetHeader | 🔲 не перевірено | — | — |
| 33 | Модалки сутностей | components/ClassModal, ClientModal, EnrollClientModal, SlotFinderModal, StudioExpenseModal, TicketModal, TrainerModal, HallModal, TrainingTypeModal | 🔲 не перевірено | — | — |
| 34 | Дата-пікери | components/CalendarPopover, SalesDateRangePicker, DatePicker, DateTimeInput, DateTimePicker | 🔲 не перевірено | — | — |
| 35 | ui/* та інше | components/ui/{ActionSelect, CopyButton, Pagination, FilterSelect, SocialHandleInput}, features/ClientSearchCombobox, ScheduleRightPanel, StudioContactIcons | 🔲 не перевірено | — | — |
