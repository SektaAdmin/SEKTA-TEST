# Аудит дублювання та план рефакторингу

Документ зафіксованого аудиту «одна сутність — багато реалізацій з різною логікою».
Факти перевірені читанням визначень + живої БД (не з пам'яті). Дати в назвах не пишемо — стан, не changelog.

## Метод (на майбутнє)
Головна пастка цього аудиту: **наявність абстракції ≠ її монопольний вжиток.**
Перевіряти не «чи імпортується helper», а `grep` фактичних викликів + читати тіло.
«Зелену групу» (нібито централізоване) аудитувати з тією ж недовірою, що й решту.

---

## Концепти (статус після перевірки)

### 🔴 1. Заповненість заняття — РІШЕННЯ: не рахувати noshow
`getActiveCount`/`isFull` ([lib/scheduleMetrics.ts](../lib/scheduleMetrics.ts)) рахували `enrolled+attended+noshow`.
Решта 3 джерела — БЕЗ noshow: `class_availability` RPC (звірено з БД), `listEnrolledCountsForDate`
([lib/queries/enrollments.ts](../lib/queries/enrollments.ts)), capacity-тригер
([supabase/migrations/20260506_enforce_class_capacity.sql](../supabase/migrations/20260506_enforce_class_capacity.sql)).
**Рішення: прибрати `'noshow'` з `ACTIVE_STATUSES`** — узгодити під тригер БД (він де-факто й так вирішує запис без noshow).
Семантика «N/cap» = скільки активних займають місце для НОВОГО запису; noshow місце не займає (заняття минуло / не прийде).

### 🔴 formatDate — РІШЕННЯ: замінити на наявні helper'и
6+ inline-копій `toLocaleDateString('uk-UA',{day:'2-digit',month:'2-digit',year:'numeric'})` замість `formatDate`.
Ризик: локаль-залежний хвіст (« р.»), ICU-залежність рантайму. Найрозповсюдженіший конкретний дубль проєкту.
**Замінити:** дата → `formatDate()`, час → `hhmm()`, діапазон → `hhmm(start)–hhmm(end)`.
**НЕ чіпати** a11y-словесні дати (`{day:'numeric',month:'long'}` → «5 червня») — інший формат навмисно (DatePicker/templates aria-label).
Місця: [app/clients/[id]/ClientDetailClient.tsx](../app/clients/[id]/ClientDetailClient.tsx) ×5, ClassModal, templates.

### ✅ 2. Бейджі enrollment — ЗРОБЛЕНО: enrollmentBadge + єдиний словник
Єдиний безособовий словник статусів (Заброньовано/У резерві/Відвідано/Не відвідано/Скасовано/
Скасовано (пізно)) — один тон в адмінці і кабінеті (норма Altegio/YClients: «Клієнт записаний»).
`enrollmentBadge({status,cancellation_source,sessions_used}, 'admin'|'client') → {label,tone}` —
єдина точка розшифровки cancelled. Текст єдиний; перспективи різняться лише джерелом: admin —
суфікс «· студія/адмін/клієнт/авто», client — без. «Пізно»=sessions_used>0. `tone`→клас:
`enrollmentBadgeClass` (глобал) / `VISIT_TONE_CLASS` (CSS-Module кабінету).
Явна схема відміни: додано `cancelled_at` (хто=cancellation_source, коли=cancelled_at, що=sessions_used);
status НЕ розділено на early/late (єдине джерело правди зі sessions_used, інв.#2).
**Не злито** з cancellation.ts: факт (sessions_used>0) ≠ прогноз (isFreeCancellation).

### 🟠 3. Черга goesToWaitlist — РІШЕННЯ: винести в lib + дзеркало
[app/client/schedule/ClientSchedule.tsx](../app/client/schedule/ClientSchedule.tsx) дзеркалить `client_enroll` RPC.
Повністю усунути не можна (UI має знати ДО кліку, без запиту — як cancellation.ts).
**Рішення: перенести в lib/scheduleMetrics.ts + коментар-зв'язок ↔ міграція client_enroll** (тримати синхронно вручну).

### ✅ 4. Баланс «після заняття» — ЗРОБЛЕНО: пагінація + серверний running-RPC
Серверний RPC `get_session_balance_after` (точковий, для адмінки: масив клієнтів × 1 заняття)
лишився; **новий `get_session_balances_running(p_client_id, p_from)`** — наростаючий
баланс ПІСЛЯ кожного майбутнього запису ОДНОГО клієнта по ВСІХ типах (window-функція,
`SUM(cost) OVER PARTITION BY ticket_type ORDER BY starts_at`). Рахує по всіх записах, не
по slice → пагінація не ламає кумулятив. enrollment.id → balance_after.
**Зроблено:**
- **Клієнтський цикл у ClientVisits ВИДАЛЕНО** → RPC через `listMyRunningBalances` + `useAsync`
  (server-prefetch `initialBalanceAfter`). Список — пагінація (`PAGE_SIZE=8` + «Показати ще», slice).
- **Хардкод `cost=1` у ClientSchedule — справжній фікс, не косметика.** Підводний камінь: `client_enroll`
  НЕ ставив `hours_attended` → auto_close списував 1 навіть для 2-год → «→2» у модалці БРЕХАЛА б.
  Тому **виправлено сам `client_enroll`**: `duration_min>=120 → hours_attended=[1,2]` (клієнт бере все
  заняття), тоді auto_close списує 2. Модалка+`reservedByType`+`hasSessions` → `sessionCost(duration)`.
- VisitDetail, ClassDetailModal — вже RPC, не чіпано.

### ✅ 5. Картка заняття — ЗРОБЛЕНО: під-компоненти, НЕ монолітний <ClassCard>
Звірка 7 кандидатів показала: всі семантично/візуально різні з різними CSS-джерелами
(trainer date-блок `trainer.module.css`; FreeSpacesBlock free-chip `dashboard.module.css`;
journal «N записів»+Проведено/Скасовано `journal.module.css`; ClientSchedule dot+time+кнопка;
ClientVisits таймер/списання; VisitDetail — hero-екран, не картка-список). Єдиний `<ClassCard>`
з пропсами-флагами під усі = монстр, гірший за дубль (хибна абстракція).
**Реальний дубль — лише всередині ClientVisits** (×3: блок тренера, ×2: when+meta).
**Зроблено:** під-компоненти `TrainerRow`/`WhenMeta` локально в ClientVisits. Решту НЕ чіпано.

### 🟢 Не чіпати (перевірено — справді ок)
- cancellation.ts — дедлайн централізований; прогноз vs факт розведені свідомо.
- Лейбли типів занять — з БД через RefsContext.
- formatMoney — 🟡 13 ручних копій (`toLocaleString('uk-UA')+' ₴'`), але результат ідентичний → низький пріоритет, окремо колись.

---

## Порядок виконання (кожен пункт = окремий коміт)

- **Етап 1** (🔴, без міграцій): 1.1 noshow з ACTIVE_STATUSES · 1.2 formatDate-копії — ✅ ЗРОБЛЕНО
- **Етап 2**: 2.1 enrollmentBadge — ✅ · 2.2 goesToWaitlist у lib — ✅ · 2.3 ClassCard — ✅ ЗРОБЛЕНО (рішення на місці: НЕ єдиний монолітний `<ClassCard>` — 7 карток семантично/візуально різні з різними CSS-джерелами = хибна абстракція; натомість під-компоненти `TrainerRow`/`WhenMeta` у ClientVisits, де був реальний дубль ×3)
- **Етап 3** — ✅ ЗРОБЛЕНО: 3.1 серверний running-RPC `get_session_balances_running` + пагінація ClientVisits (цикл видалено) · 3.2 хардкод cost=1 → hours-aware (**справжній фікс**: виправлено `client_enroll` ставити `hours_attended=[1,2]` для 2-год, бо інакше auto_close списав би 1 і модалка брехала б — пастка з §«яку модель», підтверджено перевіркою БД)

## Яку модель запускати на кожен крок

Принцип: **Opus — де є рішення/ризик тихої зміни поведінки; Sonnet — лише механічне
виконання вже узгодженого кроку.** Навіть Sonnet-кроки планувати+перевіряти межі на Opus
(дрібні «очевидні» правки цієї сесії ховали підводні камені — напр. cost=1 зав'язаний на пагінацію).

| Крок | Чому | Модель |
|------|------|--------|
| 2.1 enrollmentBadge | зведення 3 cancelled-розшифровок без тихої зміни тексту в 5 місцях; type-check не ловить | **Opus** |
| 2.2 goesToWaitlist у lib | механічний винос наявної функції + коментар-дзеркало | **Sonnet** |
| 2.3 ClassCard | відкладене рішення дизайну (компонент vs view-model) + багато файлів | **Opus** |
| 3.1 баланс на масив + пагінація | міграція БД (search_path/RLS/TABLE), інваріант #2, хронологічна формула | **Opus** |
| 3.2 хардкод cost=1 → hours-aware | точкова заміна | **Sonnet** |
