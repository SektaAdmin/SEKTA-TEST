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

### 🟠 4. Баланс «після заняття» — РІШЕННЯ: пагінація + серверний баланс на масив
Серверний RPC `get_session_balance_after` (складна хронологічна формула, звірено з БД) +
2 спрощені клієнт-копії (ClientVisits локальний цикл; ClientSchedule хардкод `cost=1`).
**Дані БД:** avg 3.1 майбутніх записів/клієнт, 21% мають ≥4 одного типу, max нині 11
(бо запис відкрито лише на 11 днів — операційне обмеження, НЕ архітектурне: студія виставить тиждень×N → постійник×4/тиждень×2міс = 30+).
Список зараз рендерить усе підряд (`upcomingSorted.map`, без limit) → закладена UX-проблема.
**Рішення:**
- Список ClientVisits: вантажити всі майбутні (масив малий) → рендерити N (~8-10) + «показати ще» (клієнтський slice).
- Наростаючий баланс → **серверний RPC на масив enrollment-ів** (нова/розширена БД-функція, `TABLE`); локальний цикл ВИДАЛИТИ (несумісний з пагінацією — не бачить записів за вікном). Міграція: `SET search_path` (інв.#10), RLS-гейт як у get_session_balance_after.
- Модалка ClientSchedule: прибрати хардкод `cost=1` → hours-aware.
- VisitDetail, ClassDetailModal — вже RPC, не чіпати.

### 🟠 5. Картка заняття — РІШЕННЯ: <ClassCard> для легких, важкі не чіпати
9 ручних рендерів, але дуже різні за вагою (6–47 полів-згадок):
- **Робити ClassCard:** ClientSchedule(25), ClientVisits(20), VisitDetail(9), journal(11), FreeSpacesBlock(7), trainer(6).
- **НЕ чіпати** (повноцінні екрани з діями/inline-edit): ClassDetailModal(47), ClientDetailClient(42), schedule/page(34).
Форму (єдиний компонент vs view-model+локальний layout) обрати на місці після звірки layout — не вгадувати наперед.

### 🟢 Не чіпати (перевірено — справді ок)
- cancellation.ts — дедлайн централізований; прогноз vs факт розведені свідомо.
- Лейбли типів занять — з БД через RefsContext.
- formatMoney — 🟡 13 ручних копій (`toLocaleString('uk-UA')+' ₴'`), але результат ідентичний → низький пріоритет, окремо колись.

---

## Порядок виконання (кожен пункт = окремий коміт)

- **Етап 1** (🔴, без міграцій): 1.1 noshow з ACTIVE_STATUSES · 1.2 formatDate-копії — ✅ ЗРОБЛЕНО
- **Етап 2**: 2.1 enrollmentBadge — ✅ · 2.2 goesToWaitlist у lib — ✅ ЗРОБЛЕНО (перенесено в `lib/scheduleMetrics.ts`) · 2.3 ClassCard
- **Етап 3** (🟠, міграція БД): 3.1 пагінація+серверний баланс на масив · 3.2 хардкод cost=1

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
