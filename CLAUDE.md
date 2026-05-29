# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# sekta-crm — Supabase CRM

## Проект
Фітнес/танцювальна студія. CRM для управління клієнтами, тренерами, абонементами і продажами.

- **Stack**: Next.js 14.2.3 + React 18 + TypeScript
- **Backend**: Supabase PostgreSQL
- **Auth**: Supabase Auth + JWT
- **Styling**: Tailwind CSS 4.3 + shadcn/ui (повністю встановлені та використовуються)
- **Last Updated**: 2026-05-29 (mobile filterbar unified: stack pattern for /sales + /clients; horizontal scroll for /journal + /accounting)

## Commands

```bash
npm run dev      # localhost:3000
npm run build    # production build (also type-checks)
npm run start    # serve production build
```

No test runner, no linter config. TypeScript errors surface via `npm run build`.

**Env vars required** (`.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

**Schema sync** (after Supabase DB changes, regenerates `types/database.types.ts`):
```bash
npm run sync:schema
```

---

## Database Schema

### Entity Relationship
```
trainers ──┐
           ├──► sales ◄──── clients ◄──── balance_transactions
tickets ───┘
halls (standalone reference)
class_series ──► classes ──► enrollments ◄──── clients
training_types (standalone reference)
trainer_rates ──► trainers (trainer_id NULL = глобальна ставка)
trainer_payments ──► trainers
studio_expenses ──► trainers (trainer_id optional)
```

---

## Tables

### `clients` — Клієнти студії

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| first_name | text | YES | — | |
| last_name | text | YES | — | |
| phone | text | YES | — | Унікальний ідентифікатор клієнта |
| instagram_username | text | YES | — | Без @ і домену |
| telegram_username | text | YES | — | Без @ |
| balance | integer | YES | 0 | Грошовий депозит (₴) |
| credit_limit | numeric | YES | 10000 | Ліміт від'ємного балансу, >= 0 |
| balance_updated_at | timestamptz | YES | now() | Оновлюється через update_client_balance() |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | Auto-updated |

**RLS:** Увімкнено. Політика `authenticated_all`: authenticated = повний доступ, anon = нічого.

---

### `client_session_balances` — Залишки занять по типах

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| client_id | uuid | NO | — | → clients.id |
| ticket_type | text | NO | — | Тип заняття (відповідає tickets.ticket_type) |
| sessions_balance | integer | NO | 0 | Залишок занять; змінюється через mark_attendance |

**Змінювати тільки через `mark_attendance()` RPC.**

---

### `tickets` — Тарифи/абонементи

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | — | Назва тарифу |
| ticket_type | text | NO | — | Тип заняття (не enum, вільний текст) |
| sessions | integer | NO | — | Кількість занять, > 0 |
| price | integer | NO | — | Ціна в **гривнях** (₴) |
| is_active | boolean | NO | false | true = актуальний, false = архів |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | Auto-updated |

**Constraints:** `price >= 0`, `sessions > 0`. Max 20 активних тарифів (бізнес-правило).

**Відомі значення `ticket_type`:** group, individual, hallrental, smallhallrental, individualduo, individualtrio, pylonrental, striprental — та будь-які нові з `training_types.code`.

**RLS:** Вимкнено.

---

### `trainers` — Тренери

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | NO | PK |
| name | text | NO | length(trim(name)) > 0 |
| is_active | boolean | NO | true |
| instagram_username | text | YES | Без @ |
| telegram_username | text | YES | Без @ |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | Auto-updated |

**RLS:** Вимкнено.

---

### `sales` — Продажі (денормалізовані)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | NO | PK |
| client_id | uuid | NO | → clients.id CASCADE |
| ticket_id | uuid | YES | → tickets.id SET NULL |
| trainer_id | uuid | YES | → trainers.id SET NULL |
| ticket_name | text | YES | **Snapshot** ticket.name на момент продажу |
| ticket_price | integer | YES | **Snapshot** ticket.price (гривні) |
| sessions | integer | YES | **Snapshot** ticket.sessions |
| price_paid | integer | NO | Фактично оплачено, >= 0 |
| amount_given | integer | NO | Сума яку дав клієнт, >= 0 |
| payment_method | text | NO | `cash` / `fop` / `personal_card` / `deposit` |
| notes | text | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | Auto-updated |

⚠️ `ticket_name`, `ticket_price`, `sessions` — **незмінні знімки** на момент купівлі. Не джоїнити `tickets` для звітів.

**RLS:** Вимкнено.

---

### `balance_transactions` — Лог балансових операцій

Логується автоматично через `update_client_balance()`. Містить: `client_id`, `amount`, `transaction_type`, `balance_before`, `balance_after`, `related_sale_id`, `description`, `reason`, `created_by`, `created_at`, `reversed_at`, `reversed_by`, `reversal_reason`.

**RLS:** Вимкнено.

---

### `halls` — Зали студії

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | NO | PK |
| name | text | NO | length(trim(name)) > 0 |
| capacity | integer | NO | > 0 |
| is_active | boolean | NO | true |
| description | text | YES | |
| created_at | timestamptz | NO | |

**RLS:** Вимкнено.

---

### `training_types` — Типи тренувань (довідник)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | NO | PK |
| code | text | NO | UNIQUE, latin+digits, відповідає `ticket_type` скрізь |
| label | text | NO | Відображувана назва |
| is_active | boolean | NO | true |
| sort_order | integer | NO | 0 |
| created_at | timestamptz | NO | |

`code` — незмінний ідентифікатор. `label` — редагується. Керується через `/settings/training-types`.

**⚠️ Константи TICKET_TYPES / TICKET_TYPE_LABELS видалені з types/index.ts** — всі dropdown та дисплеї читають з DB.

---

### `class_series` — Шаблони серій занять

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | PK | |
| type | text | NO | 'series' | `'template'` = постійний шаблон тижня; `'series'` = разова серія |
| ticket_type | text | NO | — | |
| trainer_id | uuid | YES | — | → trainers.id SET NULL |
| hall_id | uuid | YES | — | → halls.id SET NULL |
| title | text | YES | — | |
| notes | text | YES | — | |
| capacity | integer | YES | — | |
| duration_min | integer | NO | 60 | |
| day_of_week | smallint | NO | — | 0=Нд..6=Сб |
| time_of_day | time | NO | — | |
| created_at | timestamptz | NO | — | |

**RLS:** Вимкнено. GRANT на anon, authenticated.

### `series_clients` — Постійники шаблонів

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | NO | PK |
| series_id | uuid | NO | → class_series.id CASCADE |
| client_id | uuid | NO | → clients.id CASCADE |
| hours_attended | integer[] | YES | `generate_week()` прокидує в enrollments.hours_attended |
| created_at | timestamptz | NO | |

**UNIQUE(series_id, client_id).** RLS: Увімкнено. authenticated = повний доступ.

### `classes` — Заняття

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | NO | PK |
| series_id | uuid | YES | → class_series.id SET NULL |
| trainer_id | uuid | YES | → trainers.id |
| hall_id | uuid | YES | → halls.id |
| ticket_type | text | NO | |
| title | text | YES | |
| starts_at | timestamptz | NO | |
| duration_min | integer | NO | default 60 |
| capacity | integer | YES | |
| is_cancelled | boolean | NO | default false |
| notes | text | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### `enrollments` — Записи клієнтів на заняття

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | NO | PK |
| class_id | uuid | NO | → classes.id |
| client_id | uuid | NO | → clients.id |
| status | text | NO | `enrolled` / `attended` / `cancelled` / `noshow` / `waitlist` |
| sessions_used | integer | NO | default 0 |
| hours_attended | integer[] | YES | `[1]`, `[2]`, або `[1,2]` для 2-год занять. NULL = все заняття. |
| sale_id | uuid | YES | |
| notes | text | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

**Waitlist:** тригер `check_class_capacity` автоматично змінює `enrolled` → `waitlist` якщо зал повний.

**hours_attended:** для `duration_min >= 120` клієнт може відвідати 1-у, 2-у або обидві години. `sessions_used` = `hours_attended.length` (або 1 якщо NULL).

---

### `studio_expenses` — Студійні витрати/доходи (без клієнта)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | NO | PK |
| amount | integer | NO | > 0, в ₴ |
| direction | text | NO | `expense` / `income` |
| payment_method | text | NO | `cash` / `fop` / `personal_card` (deposit недоступний) |
| trainer_id | uuid | YES | → trainers.id SET NULL |
| description | text | YES | Довільний коментар |
| created_at | timestamptz | NO | now() |

**Призначення:** Операції студії що не пов'язані з клієнтом — вода, канцелярія, оренда, виплати готівкою тощо. Відображаються в `/accounting` поруч із sales, враховуються в підсумкових картках.

**RLS:** Увімкнено. authenticated = повний доступ.

---

### `trainer_rates` — Ставки тренерів ₴/год

**UNIQUE NULLS NOT DISTINCT (trainer_id, ticket_type).** `trainer_id IS NULL` = глобальна ставка.
Пріоритет: індивідуальна → глобальна. RLS: Увімкнено.

### `trainer_payments` — Виплати тренерам

Поля: `trainer_id`, `period_start`, `period_end`, `calculated_amount`, `paid_amount`, `payment_date`, `notes`. RLS: Увімкнено.

---

## Stored Procedures

### `create_sale(p_client_id, p_ticket_id, p_trainer_id, p_price_paid, p_amount_given, p_payment_method, p_notes, p_created_at)`
INSERT у `sales` + `update_client_balance` в одній транзакції.

### `update_sale(p_sale_id, p_client_id, p_ticket_id, p_trainer_id, p_ticket_name, p_ticket_price, p_sessions, p_ticket_type, p_price_paid, p_amount_given, p_payment_method, p_notes, p_created_at)`
Реверс старого балансу + застосування нового в одній транзакції.

### `delete_sale(p_sale_id)`
Видаляє запис + реверсує зміну балансу.

### `update_client_balance(p_client_id, p_amount, p_transaction_type, p_description, p_related_sale_id, p_reason)`
`→ TABLE(success boolean, new_balance numeric, transaction_id uuid, error_message text)`
Блокує рядок FOR UPDATE, перевіряє credit_limit, пише в balance_transactions, оновлює clients.balance.
**Ніколи не UPDATE clients.balance напряму.**

### `mark_attendance(p_enrollment_id uuid, p_sessions_used integer DEFAULT 1)`
`→ TABLE(success boolean, error_message text)`
Перевіряє client_session_balances, декрементує сесії, ставить status='attended'. `success=false` якщо балансу недостатньо.

### `reverse_attendance(p_enrollment_id uuid)`
`→ TABLE(success boolean, error_message text)`
Повертає sessions_used в client_session_balances, скидає enrollment на status='cancelled', sessions_used=0.

### `cancel_class_and_restore_sessions(p_class_id uuid)`
`→ TABLE(success boolean, restored_count int, error_message text)`
- `attended`: повертає sessions_used
- `noshow`: повертає duration_min / 60
- `enrolled`: скасовується без повернення
- `waitlist`: без змін
Встановлює is_cancelled=true. **Використовувати замість прямого UPDATE.**

### `generate_week(p_start_date date, p_weeks int DEFAULT 1)`
`→ TABLE(classes_created int, enrollments_created int)`
Генерує заняття з `type='template'` шаблонів. Ідемпотентна (UNIQUE index `uq_classes_series_date`). Автоматично записує series_clients в enrollments.

### `calc_trainer_salary(p_trainer_id, p_start, p_end)`
`→ TABLE(ticket_type text, sessions_total int, rate numeric, amount numeric)`
По enrolled зі status='attended'/'noshow'. Ставка: індивідуальна → глобальна → NULL (amount=0).

### `check_class_conflicts(p_starts_at, p_duration_min, p_hall_id, p_trainer_id, p_exclude_id)`
`→ TABLE(conflict_type text, class_id uuid, starts_at timestamptz, title text, ticket_type text)`
Перевіряє перетин по залу/тренеру. Використовується в ClassModal.

### `check_client_conflict(p_client_id uuid, p_class_id uuid)`
`→ TABLE(conflict_class_id uuid, starts_at timestamptz, ticket_type text)`
Перевіряє чи клієнт вже записаний на паралельне заняття.

### `auto_close_classes()` — фоновий cron (pg_cron, кожні 5 хв)
Автоматично закриває всі `enrolled` записи для занять що почались 5 хв–24 год тому — викликає `mark_attendance()` для кожного. Якщо у клієнта немає балансу (`success=false`) — enrollment **залишається `enrolled`** для ручного розбору адміном. Міграція: `supabase/migrations/20260501_auto_close_classes.sql`.

---

## Security

**RLS увімкнено на всіх таблицях.** Політика `authenticated_all`: authenticated = повний доступ, anon = нічого.
При нових таблицях через міграцію — додавати `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO anon, authenticated`.

**Auth:** JWT токени Supabase Auth. Всі authenticated користувачі = однакові права.

---

## Business Logic

- `clients.balance` — грошовий депозит (₴). Змінювати **тільки через `update_client_balance()`**.
- `client_session_balances` — залишки занять по типу. Змінювати **тільки через `mark_attendance()` RPC**.
- `credit_limit` = 10000 за замовчуванням (дозволяє депозит до -10000).
- `tickets.price`, `sales.price_paid`, `sales.amount_given` — в **гривнях** (₴), ділити на 100 не треба.
- `ticket_name`, `ticket_price`, `sessions` у sales — **незмінні знімки**, не оновлювати.
- `payment_method`: `cash`, `fop`, `personal_card`, `deposit`.
- **Аренда залів** (`hallrental`, `smallhallrental`, `pylonrental`, `striprental`): при записі клієнта через `enrollClient()` автоматично створюється sales-запис через `create_sale` RPC з `payment_method='deposit'`.
- **SaleModal без тікету** = депозитна операція: `ticket_id=null`, позитивний `amount_given` = поповнення, від'ємний `price_paid` = списання.

---

## Stack

```
Next.js 14.2.3 · React 18 · TypeScript
Supabase PostgreSQL · @supabase/supabase-js 2.43.4 · @supabase/ssr 0.10.2
Tailwind CSS 4.3 · shadcn/ui 0.9.5 · @radix-ui/*
react-hook-form 7.72.1 · @hookform/resolvers 5.2.2 · zod 4.3.6
sonner 2.0.7 (toast) · swr 2.2.4 · date-fns 4.2.1
lucide-react · cmdk · react-day-picker
```

```bash
npm run dev      # localhost:3000
npm run build
npm run start
```

---

## Pages

| Route | Призначення |
|-------|-------------|
| `/login` | Авторизація |
| `/sales` | Продажі: створення, редагування, фільтр по датах |
| `/clients` | База клієнтів, пошук |
| `/clients/[id]` | Профіль: контакти, депозит, залишок занять, покупки, записи |
| `/schedule` | Розклад занять: день/тиждень view, фільтр по залах і тренерах; навігація назад обмежена 30 днів (редірект на сьогодні при натисканні далі) |
| `/schedule/[classId]` | Деталі заняття, відвідуваність, запис клієнтів |
| `/schedule/templates` | Шаблони тижня: HallWeekGrid, постійники, виставити тиждень |
| `/journal` | Журнал занять: всі минулі заняття (вчора і раніше), фільтри по датах/тренеру/залу/типу/статусу, пагінація 20/стор, клік → ClassDetailModal |
| `/halls`, `/trainers`, `/tickets`, `/training-types` | Standalone-сторінки довідників (редиректи або окремі views) |
| `/accounting` | Звітність: список транзакцій (як monobank) — фільтр методу/тренера, картки підсумків, чекбокси для звірки |
| `/accounting/trainers` | Звіт по тренерах |
| `/accounting/trainers/salary` | Нарахування зарплати + виплати |
| `/accounting/trainers/rates` | Ставки тренерів (глобальні + індивідуальні) |
| `/settings` | Редирект → `/settings/tickets` |
| `/settings/tickets` | Абонементи: таблиця активних + архів |
| `/settings/trainers` | Тренери: таблиця активних + архів |
| `/settings/halls` | Зали: таблиця активних + архів |
| `/settings/training-types` | Типи тренувань: таблиця активних + архів, редагування |

---

## Frontend Architecture

### Структура файлів

```
app/
  layout.tsx                  — RefsProvider + Toaster (sonner)
  globals.css                 — CSS-змінні + @keyframes
  [route]/page.tsx            — сторінки
  [route]/[name].module.css   — стилі сторінок (CSS Modules залишаються)

components/
  Sidebar.tsx                 — навігація (fixed)
  BottomNav.tsx               — мобільна навігація
  icons/
    navigation.tsx            — SVG-компоненти іконок (SalesIcon, ClientsIcon, ScheduleIcon, TemplatesIcon, AccountingIcon, SettingsIcon, LogoutIcon)
  SaleModal.tsx               — продаж/депозит
  ClientModal.tsx             — створення/редагування клієнта
  ClassModal.tsx              — створення/редагування заняття; завжди `mobileFullScreen` (тільки на ≤640px)
  SeriesModal.tsx             — шаблон серії
  EnrollClientModal.tsx       — запис клієнта з профілю
  ClassDetailModal.tsx        — деталі заняття (модальний варіант); таблиця записаних: нумерація (#), статус-бейдж, ActionSelect для зміни статусу; `table-layout: fixed` на мобільному (без горизонтального скролу)
  HallModal.tsx               — зал
  TicketModal.tsx             — абонемент
  TrainerModal.tsx            — тренер
  TrainingTypeModal.tsx       — тип тренування
  HallWeekGrid.tsx            — сітка шаблонів (зали × дні); мітки часу у форматі `HH:00` (як у /schedule)
  CalendarPopover.tsx         — міні-календар з підсвіткою тижня (portals, для інших сторінок)
  ScheduleRightPanel.tsx      — права панель /schedule: міні-календар (inline, тільки навігація)
  SalesDateRangePicker.tsx    — range picker для /sales
  DatePicker.tsx              — single date picker
  DateRangePicker.tsx         — range picker (shadcn Calendar)
  DateTimePicker.tsx          — date+time picker
  DateTimeInput.tsx           — masked text input ДД.ММ.РРРР ГГ:ХХ
  MonthNav.tsx                — навігація по місяцях
  features/
    ClientSearchCombobox.tsx  — пошук клієнта (shadcn Command)
  ui/
    ModalShell.tsx            — обгортка модалок (shadcn Dialog)
    ModalFooter.tsx           — уніфіковані footer-кнопки (Скасувати/Зберегти) для всіх модалок
    FormField.tsx             — уніфікований wrapper поля форми: label + input/select/textarea + errorHint + hint. Props: id, label, required, registration, error, hint, children, className. Використовується в усіх 8 модалках.
    Pagination.tsx            — пагінація з вибором page size (20/50/100), page range з "...", Prev/Next. Використовується в /journal і може повторно використовуватись.
    ActionSelect.tsx          — кастомний dropdown на Radix SelectPrimitive зі стилями через CSS Modules і токенами проекту. Props: `options: {value, label}[]`, `onChange`, `placeholder`, `disabled`. Використовується в ClassDetailModal для вибору дії зі статусом запису. Не shadcn Select (той використовує Tailwind vars яких немає в проекті).
    SocialHandleInput.tsx     — input для instagram/telegram
    button.tsx, calendar.tsx, command.tsx, dialog.tsx, popover.tsx, select.tsx, table.tsx  — shadcn

contexts/
  RefsContext.tsx             — глобальний контекст довідників (tickets, trainers, halls, trainingTypes)

hooks/
  useIsMobile.ts              — `matchMedia`-based хук (SSR-safe, синхронізований з CSS); breakpoint=640px за замовчуванням. Єдине місце для isMobile detection — не дублювати `window.innerWidth` в компонентах
  useClients.ts               — список клієнтів
  useClientBalance.ts         — баланс конкретного клієнта
  useSales.ts                 — продажі
  useTickets.ts               — тарифи (+ toggle, ensure)
  useTrainers.ts              — тренери (+ toggle, ensure)
  useHalls.ts                 — зали
  useTrainingTypes.ts         — типи занять
  useSeriesTemplates.ts       — шаблони серій
  useSaleForm.ts              — zod-схема і стан форми SaleModal
  useSaleSubmit.ts            — сабміт SaleModal (create/update/delete RPC)
  useModalFocus.ts            — focus trap + Escape для модалок

lib/
  supabase.ts                 — singleton createBrowserClient + export const supabase
  supabase-server.ts          — createServerSupabase() для Server Components
  useRealtime.ts              — Supabase Realtime підписки (debounce 300ms, JWT header)
  useSupabaseList.ts          — generic хук для простих list-запитів
  scheduleMetrics.ts          — getActiveCount, isFull, isAlmost, fillPct та варіанти для series_clients
  badges.ts                   — ЄДИНИЙ словник лейблів/класів: enrollmentStatusLabel/Class, paymentLabel/Class, ticketTypeShortLabel/TICKET_TYPE_SHORT_LABELS. Не дублювати STATUS_LABELS/PAYMENT_LABELS у компонентах
  validation-messages.ts      — VM.required/invalid — zod & RHF validation messages ("Ім'я обов'язкове", "Кількість занять > 0" та ін.). Всі модалки і хуки мігровані (включно з HallModal, ClassModal, SeriesModal, useSaleForm)
  messages.ts                 — MSG.empty — empty-state UI messages ("Клієнтів ще немає", "Транзакцій немає" та ін.)
  typeColor.ts                — хеш-кольори типів занять (group = #5b8af5, решта — хеш)
  formatters.ts               — formatClientName, formatClientLabel, formatMoney, formatDate/formatDateShort/formatDateYY (display-дати), formatSaleDatetime, nowDatetimeLocal, isoToDatetimeLocal, datetimeLocalToDisplay, parseDisplayToDatetimeLocal
  dateUtils.ts                — toYMD/isoToYMD (РРРР-ММ-ДД), getMondayOf, buildCalendarDays, getISOWeek + ЄДИНІ дні тижня: DOW_LABELS_SHORT/FULL (Sunday-based, 0=Нд = day_of_week з БД), WEEKDAYS_SHORT/FULL (Monday-based, для заголовків сітки), dowMondayIndex(date), MONTHS_UK_*
  utils.ts                    — cn() для merge Tailwind classNames
  queries/
    balance-transactions.ts   — listClientTransactions, listBalanceAfterBySaleIds
    classes.ts                — getClassById, listClassesForWeek, listDatesWithClasses, updateClassCancelled, cancelClassAndRestoreSessions, checkClassConflicts
    client-detail.ts          — getClientDetail, listSalesForClient, listPastEnrollmentsForClient, listFeedEnrollmentsForClient
    clients.ts                — listClients, searchClientsByName, searchClientsByPhone, searchClientIdsByName, getClient, insertClient, updateClient
    enrollments.ts            — listClassesForDate, listEnrolledCountsForDate, listClientEnrolledClassIds, listEnrollmentsForClass, listSessionBalancesForClients, getClientSessionBalance, markAttendance, reverseAttendance, updateEnrollmentStatus, checkClientConflict, enrollClient
    halls.ts                  — listHalls, listActiveHalls, insertHall, toggleHall
    sales.ts                  — listSales, listAllSalesForFeed, listSalesForAccounting, listSalesForTrainers, createSale, updateSale, deleteSale
    tickets.ts                — listTickets, getTicketById, insertTicket, toggleTicket
    trainer-rates.ts          — listTrainerRates, upsertTrainerRate, deleteTrainerRate
    trainers.ts               — listTrainers, listActiveTrainers, insertTrainer, toggleTrainer, calcTrainerSalary, listTrainerPayments, insertTrainerPayment
    training-types.ts         — listTrainingTypes, listActiveTrainingTypes, listTrainingTypeLabels, insertTrainingType, updateTrainingType, toggleTrainingType
    studio-expenses.ts        — listStudioExpenses, insertStudioExpense, deleteStudioExpense
    (series queries are in classes.ts, not a separate file)

types/
  index.ts                    — PaymentMethod, Client, Ticket, Trainer, Sale, Hall, Class, Enrollment, ClassSeries, SeriesClient, ClientSessionBalance, SaleFormData, TrainingType
  database.types.ts           — auto-generated Supabase types
```

### Карта повторюваних патернів (де шукати, без grep по всьому проекту)

Осі коду, що були централізовані — нові місця беруть звідси, не оголошувати локальні копії:

- **Лейбли статусів запису** (enrolled/attended/…) → `lib/badges.ts` (`enrollmentStatusLabel/Class/Icon`). Дієслова: Записалась/Відвідала/Не прийшла/Скасувала/Черга. Іконки (lucide-react): Clock/CheckCircle2/X/XCircle/Users — `enrollmentStatusIcon(status)` → `LucideIcon | null`.
- **Лейбли + кольори методів оплати** (cash/fop/personal_card/deposit) → `lib/badges.ts` (`paymentLabel/Class`). personal_card = «Картка» скрізь.
- **Короткі ярлики типів тренувань** (звіти/ставки тренерів) → `lib/badges.ts` (`ticketTypeShortLabel`). Повні людські назви (dropdown, дисплеї) — `label` з БД через RefsContext / `listTrainingTypeLabels`.
- **Дні тижня** → `lib/dateUtils.ts`. ⚠️ ДВІ конвенції: `DOW_LABELS_SHORT/FULL` (0=Нд, індексувати значенням `day_of_week` з БД) vs `WEEKDAYS_SHORT/FULL` (0=Пн, для заголовків сітки Пн→Нд). Для JS Date → MONDAY-based: `dowMondayIndex(date)`. Не плутати індексації.
- **Місяці** → `lib/dateUtils.ts` (`MONTHS_UK_SHORT/FULL`).
- **Гроші** → `lib/formatters.ts` (`formatMoney(n)` → «1 000 ₴»). Знак ± і «— для 0» — на місці виклику. Виняток: компактна таблиця транзакцій у ClientModal показує голі числа без ₴ (навмисно).
- **Дати (display)** → `lib/formatters.ts`: `formatDate` (ДД.ММ.РРРР), `formatDateShort` (ДД.ММ), `formatDateYY` (ДД.ММ.РР). Вхід — ISO-рядок або Date.
- **Дата → РРРР-ММ-ДД** (value для `<input type=date>`) → `lib/dateUtils.ts`: `toYMD(date)` / `isoToYMD(iso)`. Не писати `getFullYear()+padStart…` локально.
- **CSS бейджів**: класи `.badge*` локальні в `*.module.css`, але форма єдина: `var(--badge-radius)`, `padding: 3px 9px`, `font-size: 11px`; кольори — тільки `var()`-токени.

Ще НЕ централізовано (одне місце, чекає на друге перед виносом): `TX_LABELS` (типи балансових транзакцій, ClientModal).

### Архітектурні правила

- **Іконки** (`components/icons/navigation.tsx`) — всі навігаційні іконки як React-компоненти. Сітку іконок розширювати, додаючи нові експорти.
- **RefsContext** (`contexts/RefsContext.tsx`) — глобальний синглтон довідників. Модалки отримують `tickets`, `trainers`, `halls`, `trainingTypes` через `useRefs()`, а не через props зі сторінок. Також надає `refetchTickets/refetchTrainers/refetchHalls/refetchTrainingTypes` для примусового оновлення після мутацій у налаштуваннях.
- **`lib/supabase.ts`** — єдиний синглтон `supabase`. Всі client-side компоненти імпортують `import { supabase } from '@/lib/supabase'`.
- **`globals.css` shared utilities**: `.btn-primary` (акцентна кнопка), `.loading-dots` (3-крапковий спінер), `.data-table-wrap` + `.data-table` (стандартна таблиця). Нестандартні таблиці (accounting, salary, rates) — залишаються в module.css через унікальні overrides.
- **Shared page layout** (globals.css) — єдиний шаблон для всіх сторінок крім `/schedule/*`:
  - `.page-layout` — flex-row обгортка (sidebar + main). На ≤640px: `height: calc(100svh - var(--bottom-nav-h) - env(safe-area-inset-bottom)); overflow: hidden` — **жорстко обрізає висоту** щоб контент ніколи не виходив під BottomNav
  - `.page-main` — flex-column, `margin-left: var(--sidebar-w)`, `min-height: 100vh`. На ≤640px: `margin-left: 0`, `height: 100%`
  - `.page-head` — `flex-shrink: 0`, `position: sticky; top: 0; z-index: 10`. На ≤640px: `position: static`. Містить topbar + filterBar/tabNav
  - `.page-body` — `flex: 1; min-height: 0; overflow-y: auto`. На ≤640px: `padding-bottom: 16px` (звичайний відступ, НЕ компенсація BottomNav — вона вже в `.page-layout`)
  - `.page-foot` — `flex-shrink: 0; border-top`. На ≤640px: `padding-bottom: 8px`. Пагінація завжди видима — `page-layout` обрізає висоту вище BottomNav
  - **Нова сторінка не потребує**: margin-left, height, overflow, padding-bottom для BottomNav — все в `.page-layout`/`.page-main`/`.page-body`/`.page-foot`
  - **Виняток** — `/schedule` і `/schedule/templates`: не використовують `page-layout`, мають власну scroll-архітектуру всередині `bodyGridWrapper`
- **Мобільна scroll-архітектура** (після рефакторингу 2026-05-29):
  - `html, body { overflow: hidden }` — глобально в `globals.css`, **ніколи не змінювати через JS**
  - **BottomNav** (`position: fixed; z-index: 200; bottom: 0`) — фіксований поза потоком. `.page-layout` обрізається на `calc(100svh - 56px - safe-area)` тому контент ніколи не потрапляє під нього фізично
  - **НЕ додавати** `padding-bottom: calc(var(--bottom-nav-h) + ...)` на `page-body` або `page-foot` — це застарілий патерн, що призводив до перекриття пагінації. Висота обрізана на рівні `page-layout`
  - Module.css сторінок: мобільна `@media` містить тільки специфіку (розміри topbar, flex-wrap, padding контенту). **Не дублювати** висоту/overflow — вони в `page-layout`/`page-main`/`page-body`
  - `.page-content` — застарілий клас, залишається в globals.css для зворотної сумісності (accounting/trainers/*, /schedule/[classId])
- **Мобільний filterbar — два паттерни** (уніфіковано 2026-05-29):
  - **Стопка** (`flex-wrap: wrap`, кожен елемент `width: 100%`) — для сторінок з ≤3 елементами форми вводу: `/sales` (пошук + datepicker + скинути), `/clients` (пошук). Елементи розміщуються один під одним.
  - **Горизонтальний скрол** (`overflow-x: auto; overflow-y: hidden; flex-wrap: nowrap`) — для сторінок з 4+ навігаційними фільтрами (кнопки/селекти): `/journal`, `/accounting`. `overflow-y: hidden` запобігає вертикальному скролу при touch-свайпі.
  - Всі інтерактивні елементи filterbar: `height: var(--control-h)` (= 44px на мобільному).
  - `/schedule` і `/schedule/templates` — власна архітектура, не змінювати.
- **`lib/queries/`** — всі Supabase-запити винесені сюди. Компоненти і хуки імпортують функції з queries, не пишуть `.from()` безпосередньо.
- **Мутації** (INSERT/UPDATE/RPC) залишаються всередині модалок або хуків.
- **Toast** через `sonner` (`import { toast } from 'sonner'`). `<Toaster />` у `app/layout.tsx`.
- **ModalShell** (`components/ui/ModalShell.tsx`) — обгортка для всіх модалок (overlay, header з title + close, body, footer). Всі 9 модалок (`SaleModal`, `ClientModal`, `ClassModal`, `HallModal`, `TicketModal`, `SeriesModal`, `TrainerModal`, `TrainingTypeModal`, `ClassDetailModal`) мають уніфіковану оболонку. Props: `title`, `onClose`, `footer`, `children`, `width` (дефолт 420), `modalClassName`, `bodyClassName`, `mobileFullScreen` (boolean), `headerActions` (ReactNode — додаткові кнопки в header перед Close).
  - **Mobile bottom sheet**: за замовчуванням на ≤640px модалка — bottom sheet (`border-radius` зверху, `max-height: 92dvh`, анімація `bottomSheetIn`).
  - **`mobileFullScreen` prop**: на мобільному (≤640px) модалка займає весь екран як окрема сторінка. Overlay: `background: var(--bg)`, `align-items: stretch`. Modal: `align-self: stretch`, `height: auto`, `border-radius: 0`, `border: none`. Використовується в `SaleModal` (завжди), `SeriesModal` (при `isMobile`), `ClassDetailModal` (при `isMobile`), `ClassModal` (завжди), `EnrollClientModal` (завжди). ⚠️ Overlay має `background: var(--bg)` — без цього сторінка і BottomNav просвічують крізь прозорий overlay.
  - **z-index**: overlay `z-index: 300` > BottomNav `z-index: 200`.
- **FormField** (`components/ui/FormField.tsx`) — уніфікований wrapper поля: label + control + errorHint + hint. ⚠️ `input[type="time"]` має власний браузерний padding і рендериться вищим за інші поля — нормалізовано в `FormField.module.css` через `height: 39px; padding-top: 0; padding-bottom: 0`.
- **ModalFooter** (`components/ui/ModalFooter.tsx`) — уніфіковані footer-кнопки для всіх модалок. Props: `onCancel`, `onSave` (optional), `saveLabel` (дефолт: "Зберегти"), `cancelLabel` (дефолт: "Скасувати"), `loading`, `saveType` ('button'|'submit'), `disabled`. Кнопки рендеряться лише якщо `onSave` передана.
- **CSS**: CSS Modules + Tailwind співіснують. Нові компоненти — Tailwind. Старі module.css — не переписувати без потреби. Жодних HEX/rgba напряму в `*.module.css` — тільки `var()`.

### CSS Design System (globals.css)

**Теми:** світла (`:root`) та темна (`@media (prefers-color-scheme: dark)`).

**Фони:** `--bg`, `--bg-2`, `--bg-3`
**Текст:** `--text`, `--text-2`, `--text-3`
**Бордери:** `--border`, `--border-hover`, `--border-strong`
**Акцент (зелений):** `--accent`, `--accent-dim`, `--accent-text`, `--accent-border*`
**Стани:** `--danger/dim/border*`, `--success/dim`, `--warning/dim`
**Оплата:** `--fop/dim`, `--card/dim`, `--deposit/dim`
**Анімації:** `--motion-fast: 0.12s ease-out`, `--motion-standard: 0.18s ease-in-out`
**@keyframes:** `dotPulse`, `overlayIn`, `modalIn`, `bottomSheetIn`
**Layout:** `--control-h: 32px`, `--topbar-py: 16px`, `--topbar-px: 28px`, `--topbar-h: 64px`, `--sidebar-w: 196px`, `--right-panel-w: 280px`, `--bottom-nav-h: 56px`, `--radius: 10px`, `--radius-sm: 6px`

### /schedule/templates Page (станом на 2026-05-28)

**View modes:** День / Тиждень / Список

**Week view (Тиждень):**
- `HallWeekGrid` — 7 колонок = 7 днів (Пн–Нд)
- Кожна колонка дня розбита на підколонки по залах (`HallSubCol`)
- Заголовок дня містить рядок з назвами залів (якщо залів > 1)
- `TemplateCard` — стиль ідентичний `ClassCard` з /schedule: ліва акцент-смуга 3px, прогрес-бар знизу, компакт-режим при height < 60px
- `HOUR_HEIGHT = 83` (як у /schedule)
- Клік на картку → `SeriesModal`; клік на пустий слот → prefill SeriesModal з dow + time + hallId

**Day view (День):**
- Той самий `HallWeekGrid` з `singleDayDow={activeDow}` — одна колонка
- Навігація по днях тижня у topbar: ← [Повна назва дня] →
- Підколонки залів всередині дня (як у week view)

**List mode (Список):** таблиця без змін.

**Topbar:** backLink ← Розклад + заголовок + [dayNav в день-вью] + [День/Тиждень/Список] + Виставити тиждень + Видалити розклад + "+ Новий шаблон"
**FilterBar:** фільтр залів + фільтр тренерів + пошук за клієнтом

**SeriesModal — порядок полів:** День тижня + Час початку → Тип заняття → Тренер + Зал → Тривалість + Ліміт → Назва → Нотатки → Постійники

**Mobile adaptation (≤640px):**
- **Topbar**: `topbarLeft`/`topbarRight` приховані; `mobileTopNav` — компактний ← [день] → (navBtn 44×44); padding `12px var(--topbar-px)`, gap `8px`, flex-wrap wrap
- **Авто-перемикання**: на мобільному `viewMode` примусово стає `'day'` через `useEffect(isMobile)`; `isMobile` визначається через `window.innerWidth <= 640` на mount + resize listener
- **FAB**: `position: fixed; right: 16px; bottom: calc(var(--bottom-nav-h) + 16px); z-index: 250` — вище BottomNav (z-200)
- **Filter bar**: `position: static` (не sticky), `overflow-x: auto; overflow-y: hidden` (hidden запобігає вертикальному скролу при touch-свайпі), `flex-wrap: nowrap`, `::before/::after` padding 16px, висота кнопок 36px
- **SeriesModal**: `fullScreen={isMobile}` — на мобільному відкривається на весь екран
- **HallWeekGrid**: `min-width: 0` для dayCol/dayHeader/hallSubCol → day view fills width; `overflow-x: auto` на bodyWrapper

---

### /schedule Page (станом на 2026-05-28)

**Navigation limit:** Назад обмежено 30 днів. При натисканні "←" якщо нова дата < `today - 30 дн` → редірект на сьогодні. Кнопка `disabled` на межі.

**View modes:**
- **Day view** — один день, всі зали в одну колонку, права панель з календарем
- **Week view** — 7 днів (Пн–Нд), кожен день — одна колонка, права панель прихована. При перемиканні автоматично обирається перший зал (якщо фільтри порожні)

**Компоненти:**
- `ScheduleRightPanel` — права панель (видима в day mode), містить:
  - Міні-календар: інлайн для навігації по датах (єдина функція в панелі)
- `ClassCard` (в page.tsx) — дизайн по стандартам фітнес-студії: чітка ієрархія, кольорова кодування
- `ClassDetailModal` — полнофункциональна модалка з управлінням записами, деталями заняття, кнопкою копіювання (відкривається клік на картку)

**Click behavior:**
- Day mode, desktop: клік на картку → `ClassDetailModal`
- Day mode, mobile: клік на картку → `ClassDetailModal`
- Week mode, desktop: клік на картку → `ClassDetailModal`
- Archive tab: клік на рядок → `ClassDetailModal`

**Topbar (page.tsx):**
- dateChip + titleBlock (в day mode: "Август 2026" + "понеділок"; в week mode: "18.05 – 24.05.2026")
- Навігація: ← → (±1 день у day mode, ±7 днів у week mode), Сьогодні
- View toggle: [День] [Тиждень] кнопки (разом з фільтрами)

**Week day headers (week mode only):**
- `.weekDayHeader` — смуга з назвами днів (Пн 18, Вт 19...)
- Сьогоднішній день підсвічений зеленим pill (контрастний)
- `.weekFilterLabel` — рядок під датами з назвою фільтра (зал або тренер)

**Layout:**
- `.contentRow` — flex-row для grid + right-panel (right-panel приховано в week mode)
- `.gridArea` — flex-1 для розкладу/архіву
- `overflow-x: auto` в week mode для горизонтального скролу

**ClassCard стилі:**
- **Повний режим** (висота ≥60px): título → час → тренер → місця (з progress bar)
- **Компактний режим** (висота <60px): `title time` в одному рядку
- **Progress bar**: знизу, висота 2.5px, стани: зелений (вільно) → жовтий (майже) → червоний (повно/черга)
- **Бордери**: тонка обводка (0.5px) з кольором типу + ліва смуга (3px solid) 
- **Now line**: full-width в day mode, per-column у колонці сьогодні в week mode

**Mobile adaptation (≤640px):**
- **Topbar**: десктопний topbar прихований; мобільний — одна строка: назва дня + дата зліва, іконка `[число]` (сьогодні) + іконка 📅 справа
- **Навігація**: кнопки ← → прибрані; свайп вліво/вправо по сітці міняє день (`touchstart`/`touchmove` `passive:false` на `bodyGridWrapper`); анімація slide out 0.18s
- **Іконка сьогодні**: квадратна кнопка з числом сьогоднішнього дня — завжди видима, клік → `setBaseDate(new Date())`
- **Calendar**: `showMobileCal` state → bottom sheet (`mobileCalOverlay` / `mobileCalSheet`) поверх контенту
- **View mode**: тільки day view на мобільному (примусово через `useEffect(isMobile)`); week view недоступний
- **FAB**: `position: fixed; right: 16px; bottom: calc(var(--bottom-nav-h) + 16px); z-index: 250` — "+ Нове заняття", вище BottomNav
- **Filter bar**: `overflow-x: auto; overflow-y: hidden` — `hidden` запобігає вертикальному скролу при touch-свайпі
- **ClassModal**: завжди `fullScreen` (незалежно від пристрою — так вирішено в компоненті)
- **ClassDetailModal**: `fullScreen` на мобільному
- **Фіксований layout**: `main { height: 100svh }` + `body { overflow: hidden }` (глобально в globals.css). Скролиться тільки `bodyGridWrapper` всередині — `padding-bottom: BottomNav` на ньому.

---

### /clients Page (станом на 2026-05-29)

**Mobile adaptation (≤640px):**
- **Filter bar**: `flex-wrap: wrap`, `width: 100%`, `box-sizing: border-box`. `searchWrap` — `width: 100%`. ⚠️ `@media` блок завжди в **кінці** `clients.module.css`
- **Таблиця**: на десктопі `.tableDesktop` (звичайна таблиця), на мобільному `.cardList` (картки). Перемикання через CSS `display: none/flex` — обидва рендеряться в JSX одночасно
- **Client card**: ім'я + депозит (завжди, з кольоровим бейджем) в рядку; телефон як `<a href="tel:">` + instagram/telegram — тільки заповнені поля
- Тап на картку → перехід на `/clients/[id]`

---

### /sales Page (станом на 2026-05-29)

**Mobile adaptation (≤640px):**
- **Topbar**: `flex-wrap: wrap`, кнопка "+ Нова продажа" залишається в рядку з заголовком
- **Filter bar**: `flex-wrap: wrap`, `width: 100%`, `box-sizing: border-box` — вертикальна стопка. Пошук (`.filterSearch`) — `width: 100%`. `SalesDateRangePicker` обгорнутий у `<div className={styles.filterDateWrap}>` — `width: 100%`. Кнопка «Скинути» (`.filterClear`) — `width: 100%`, з'являється тільки при `hasFilters`. ⚠️ `@media` блок завжди в **кінці** `sales.module.css`
- **SalesDateRangePicker**: на мобільному відкривається як bottom sheet (`position: fixed; bottom: 0; left: 0; right: 0`). Пресети — горизонтальний скрол. Один місяць (правий прихований через CSS). `isMobile` визначається при відкритті через `window.innerWidth <= 640`
- **Таблиця**: на десктопі `.tableDesktop` (звичайна таблиця), на мобільному `.cardList` (картки). Перемикання через CSS `display: none/flex` — обидва рендеряться в JSX одночасно
- **Sale card**: клієнт + дата / назва операції / оплачено + бейдж методу / Δ депозит (тільки якщо ≠ 0) / тренер (тільки якщо є) / кнопки Змінити+Видалити
- **SaleModal**: `fullScreen` prop → займає весь екран як окрема сторінка на мобільному
- **Confirm dialog**: `width: calc(100% - 32px); max-width: 360px`

---

### /journal Page (станом на 2026-05-28)

**Назначення:** Журнал усіх минулих занять (вчора і раніше). Замінює /settings/archive і недосяжний archive tab у /schedule.

**Layout:** власний `journal.module.css` (`.layout`, `.main`, `.topbar`, `.stickyHead`) — не shared з settings. `main` має `min-width: 0`. `.stickyHead` обгортає topbar + filterBar (на десктопі `position: sticky; top: 0`, на мобільному `position: static; flex-shrink: 0`).

**Компоненти:**
- **Filter bar**: `DatePicker` × 2 (від/до) + `FilterSelect` × 4 (тренер/зал/тип/статус) + кнопка × (з'являється при активних фільтрах)
- **FilterSelect**: inline Radix `SelectPrimitive` у `page.tsx`. ⚠️ Radix Select не приймає `value=""` — пуста строка маппиться у sentinel `'__all__'` всередині компонента
- **Table**: 20 рядків/сторінка, колонки: Дата | Час | Тип | Назва | Тренер | Зал | Записів | Статус
- **Pagination**: «‹›» кнопки + counter (Сторінка X з Y · N занять)
- **Click on row/card** → `ClassDetailModal` з повним редагуванням

**Mobile adaptation (≤640px):**
- **Filter bar**: `overflow-x: auto; overflow-y: hidden; flex-wrap: nowrap` — горизонтальний скрол
- **Таблиця**: `.tableDesktop` / `.cardList` CSS toggle — обидва рендеряться в JSX одночасно
- **Journal card**: тип + дата·час в рядку; мета: тренер · зал · N записів · статус-бейдж
- **Pagination**: ліво=info, право=кнопки; на мобільному кожна секція 100% ширини

**Query:** `listPastClasses(supabase, page, pageSize, filters)` — в `lib/queries/classes.ts`
- Cutoff: `starts_at < today` (початок поточного дня, без штучного 30-денного обмеження)
- Фільтри: `dateFrom`, `dateTo`, `hallId`, `trainerId`, `ticketType`, `isCancelled`
- Повертає: `{ data: ClassWithJoins[], count: number, error: string | null }`
- `ClassWithJoins` — `export type` в `lib/queries/classes.ts`

---

### /accounting Page (станом на 2026-05-29)

**Призначення:** Список транзакцій для звірки з банківською випискою (monobank-стиль). Адмін відкриває `/accounting` і вкладку моно поруч, відмічає чекбоксами перевірені записи.

**Layout:** full-width, без `max-width` — кожен піксель корисний при звірці поруч з банком.

**Структура:**
- **Topbar**: заголовок + кнопка «+ Витрата/Дохід» + кнопка «Звіт по тренерах →»
- **Filter bar** (sticky): пресети Сьогодні/Цей тиждень/Цей місяць + DatePicker від/до + таби методу оплати (Всі/Готівка/ФОП/Картка/Депозит) + dropdown тренера (з'являється тільки при фільтрі Готівка)
- **Summary cards**: Готівка / ФОП / Картка / Депозит / Витрати (якщо є) / Надходження. Нульові суми сірим. Готівка/ФОП/Картка враховують витрати студії (зменшуються)
- **Таблиця**: уніфікований feed — sales + studio_expenses відсортовані за датою. 7 колонок — ✓ (чекбокс) | Дата+час | Клієнт | Абонемент/Коментар | Ціна | На депозит | Сума | Метод

**Студійні операції (`studio_expenses`):**
- Окрема таблиця `studio_expenses` (id, amount, direction, payment_method, trainer_id, description, created_at)
- `direction`: `expense` (витрата, зменшує метод) / `income` (дохід, збільшує метод)
- Депозит (`deposit`) недоступний — тільки cash/fop/personal_card
- Рядок у таблиці: іконка ShoppingBag (витрата, червона) або TrendingUp (дохід, зелена); клієнт = «Витрата студії» / «Дохід студії»; кнопка видалення Trash2
- Мобільна картка: ліва смуга `border-left: 3px solid var(--danger)` для витрат
- Чекбокс тільки для sales, не для expenses

**Чекбокси:**
- Локальний стан (`Set<string>`), скидається при перезавантаженні
- Клік на рядок sale або чекбокс — toggleChecked
- Чекбокс у заголовку: `indeterminate` / checked / unchecked; тільки по sales

**Логіка сум:**
- `saleRevenue(s)` = `price_paid` якщо є тікет, інакше `max(0, amount_given)`
- Витрати: `expenses += e.amount`; метод -= e.amount
- Доходи студії: метод += e.amount
- «Надходження» = cash + fop + card (після врахування витрат, без deposit)

**Фільтрація:** на клієнті після fetch. При зміні фільтру методу оплати — скидається вибір тренера. Deposit фільтр приховує expenses.

**Mobile:** картки замість таблиці; filter bar горизонтальний скрол (`overflow-x: auto; overflow-y: hidden`)

---

### /settings Pages (станом на 2026-05-28)

**Маршрути:** `/settings` → redirect `/settings/tickets`. Окремі сторінки: `tickets` / `trainers` / `halls` / `training-types`.

**Layout:** `settings/layout.tsx` — `Sidebar + BottomNav + <main>`. Shared `settings.module.css` для всіх чотирьох підсторінок.

**Топбар:** заголовок + кнопка дії (+ Додати...). `height: var(--topbar-h)`, `position: sticky; top: 0`.

**Tab навігація між розділами (мобільний):**
- `.tabNav` — окремий рядок під topbar, `position: sticky; top: var(--topbar-h)`, `overflow-x: auto; overflow-y: hidden; flex-wrap: nowrap`
- На десктопі `display: none` — навігація через Sidebar
- Використовує `<a href=...>` (не Next.js `<Link>`) — hard navigation між /settings/\* сторінками

**Таблиці / картки:**
- Активні записи + архів (через `ArchiveSection` з chevron і лічильником)
- `.tableDesktop` / `.cardList` CSS toggle (обидва в JSX, `display: none/flex`)
- **Карта активного запису**: назва + `ToggleBtns` (TRUE/FALSE) в рядку; мета знизу (тип/ціна/сесії або handles або місткість/опис або код)
- **Карта архівного запису**: `opacity: 0.65` + кнопка "Відновити"
- **training-types**: додатково кнопка "Редагувати" → `TrainingTypeModal`

**`ToggleBtns`**: inline компонент — пара кнопок TRUE/FALSE для `is_active`. Стан активної кнопки через `.toggleActiveTrue` / `.toggleActiveFalse`.

**Mobile adaptation (≤640px):**
- `main`: `margin-left: 0`, `padding-bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))`
- `topbar`: стандартна висота `var(--topbar-h)`, без `flex-wrap`
- `tabNav`: sticky під topbar, горизонтальний скрол, `display: none` на десктопі
- `tabSection`: `padding: 16px`
- Таблиця прихована → картки видимі

---

## Notes for Developers

0. **CLAUDE.md завжди актуальний** — після кожної задачі що змінює архітектуру, компоненти, хуки або DB — оновлювати CLAUDE.md в тому ж коміті.
1. **RLS увімкнено** — authenticated = повний доступ. При нових таблицях: додавати GRANT + policy.
2. **Грошовий баланс тільки через RPC** — `update_client_balance()`, не UPDATE напряму. **Залишок занять тільки через `mark_attendance()`**.
3. **Snapshots незмінні** — не чіпати `sales.ticket_price`, `ticket_name`, `sessions`.
4. **М'які видалення** — скрізь `is_active` або `is_cancelled`, ніколи не DELETE.
5. **Timestamps UTC** — завжди `timestamptz`.
6. **Гроші в гривнях** — `tickets.price`, `sales.price_paid`, `sales.amount_given` в ₴, ділити на 100 не треба.
7. **GIN-індекси на clients** — використовувати для fuzzy-пошуку по прізвищу і телефону.
8. **scheduleMetrics** — не дублювати формули підрахунку capacity/waitlist в компонентах, тільки через `lib/scheduleMetrics.ts`. Для enrollments: `getActiveCount`, `getWaitlistCount`, `isFull`, `isAlmost`, `fillPct`. Для шаблонів (client count): `isClientCountFull`, `isClientCountAlmost`, `clientFillPct`.
9. **Скасування заняття** — тільки через `cancel_class_and_restore_sessions()` RPC, не прямим UPDATE.
10. **Бейджі уніфіковані** — лейбли і CSS-класи статусів/методів оплати тільки з `lib/badges.ts` (`enrollmentStatusLabel/Class`, `paymentLabel/Class`). Не оголошувати локальні `STATUS_LABELS`/`PAYMENT_LABELS` у компонентах. Форма бейджа: `border-radius: var(--badge-radius)`, `padding: 3px 9px`, `font-size: 11px`. Кольори — тільки `var()`-токени, без HEX/rgba. Статус «Записалась» = нейтральний (`--bg-3`/`--text-2`), синій `--fop` зарезервовано за методом оплати ФОП. shadcn `ui/badge.tsx` видалено. Лейбли статусів — дієслова (Записалась/Відвідала/Не прийшла/Скасувала/Черга).
11. **Validation messages** — централізовано в `lib/validation-messages.ts` (`VM.required.*` і `VM.invalid.*`). Всі zod-схеми та RHF register() звертаються до VM, не hardcode строк. Якщо тон/мова зміниться — меняємо в одному місці.
12. **Empty-state messages** — централізовано в `lib/messages.ts` (`MSG.empty.*`). Всі компоненти показують empty states звертаючись до MSG, не硬код. Забезпечує єдину тон і формулювання скрізь.
13. **Уніфікація — тільки комплексно, не скальпінгом.** При будь-якій уніфікації (CSS, розміри, паттерни): (1) спочатку повний `grep -rn` по всьому проекту — знайти ВСІ місця; (2) скласти таблицю розбіжностей; (3) виправити все в одному коміті. Заборонено фіксувати файл → комітити → знаходити наступний → комітити. Також перевіряти не тільки CSS контейнера, але й JSX-структуру дочірніх елементів (flex-shrink, height, padding).
