# sekta-crm — Supabase CRM

## Проект
Фітнес/танцювальна студія. CRM для управління клієнтами, тренерами, абонементами і продажами.

- **Stack**: Next.js 14.2.3 + React 18 + TypeScript
- **Backend**: Supabase PostgreSQL
- **Auth**: Supabase Auth + JWT
- **Styling**: Tailwind CSS 4.3 + shadcn/ui (повністю встановлені та використовуються)
- **Last Updated**: 2026-05-20

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

`code` — незмінний ідентифікатор. `label` — редагується. Керується через `/settings?tab=training-types`.

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
| `/schedule` | Розклад занять: тижень/день, фільтр по залах і тренерах, click-to-create |
| `/schedule/[classId]` | Деталі заняття, відвідуваність, запис клієнтів |
| `/schedule/templates` | Шаблони тижня: HallWeekGrid, постійники, виставити тиждень |
| `/accounting` | Облік надходжень по методах оплати |
| `/accounting/reconciliation` | Звірка: FOP + картка, фільтр по датах |
| `/accounting/trainers` | Звіт по тренерах |
| `/accounting/trainers/salary` | Нарахування зарплати + виплати |
| `/accounting/trainers/rates` | Ставки тренерів (глобальні + індивідуальні) |
| `/settings` | Таби: Абонементи / Тренери / Зали / Типи тренувань |

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
  ClassModal.tsx              — створення/редагування заняття
  SeriesModal.tsx             — шаблон серії
  EnrollClientModal.tsx       — запис клієнта з профілю
  ClassDetailModal.tsx        — деталі заняття (модальний варіант)
  HallModal.tsx               — зал
  TicketModal.tsx             — абонемент
  TrainerModal.tsx            — тренер
  TrainingTypeModal.tsx       — тип тренування
  HallWeekGrid.tsx            — сітка шаблонів (зали × дні)
  CalendarPopover.tsx         — міні-календар з підсвіткою тижня (portals, для інших сторінок)
  ScheduleRightPanel.tsx      — права панель /schedule: міні-календар + деталі заняття (inline)
  ScheduleDetailCard.tsx      — компактна картка деталей заняття у ScheduleRightPanel
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
    SocialHandleInput.tsx     — input для instagram/telegram
    button.tsx, calendar.tsx, command.tsx, dialog.tsx, popover.tsx, select.tsx  — shadcn

contexts/
  RefsContext.tsx             — глобальний контекст довідників (tickets, trainers, halls, trainingTypes)

hooks/
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
  typeColor.ts                — хеш-кольори типів занять (group = #5b8af5, решта — хеш)
  formatters.ts               — formatClientName, formatClientLabel, formatSaleDatetime, nowDatetimeLocal, isoToDatetimeLocal, datetimeLocalToDisplay, parseDisplayToDatetimeLocal
  dateUtils.ts                — утиліти дат
  utils.ts                    — cn() для merge Tailwind classNames
  queries/
    balance-transactions.ts   — listClientTransactions, listBalanceAfterBySaleIds
    classes.ts                — getClassById, listClassesForWeek, listDatesWithClasses, updateClassCancelled, cancelClassAndRestoreSessions, checkClassConflicts
    client-detail.ts          — getClientDetail, listSalesForClient, listPastEnrollmentsForClient, listFeedEnrollmentsForClient
    clients.ts                — listClients, searchClientsByName, searchClientsByPhone, searchClientIdsByName, getClient, insertClient, updateClient
    enrollments.ts            — listClassesForDate, listEnrolledCountsForDate, listClientEnrolledClassIds, listEnrollmentsForClass, listSessionBalancesForClients, getClientSessionBalance, markAttendance, reverseAttendance, updateEnrollmentStatus, checkClientConflict, enrollClient
    halls.ts                  — listHalls, listActiveHalls, insertHall, toggleHall
    sales.ts                  — listSales, listAllSalesForFeed, listSalesForAccounting, listSalesForTrainers, listSalesForReconciliation, createSale, updateSale, deleteSale
    tickets.ts                — listTickets, getTicketById, insertTicket, toggleTicket
    trainer-rates.ts          — listTrainerRates, upsertTrainerRate, deleteTrainerRate
    trainers.ts               — listTrainers, listActiveTrainers, insertTrainer, toggleTrainer, calcTrainerSalary, listTrainerPayments, insertTrainerPayment
    training-types.ts         — listTrainingTypes, listActiveTrainingTypes, listTrainingTypeLabels, insertTrainingType, updateTrainingType, toggleTrainingType
    series.ts (?)             — listSeriesTemplates

types/
  index.ts                    — PaymentMethod, Client, Ticket, Trainer, Sale, Hall, Class, Enrollment, ClassSeries, SeriesClient, ClientSessionBalance, SaleFormData, TrainingType
  database.types.ts           — auto-generated Supabase types
```

### Архітектурні правила

- **Іконки** (`components/icons/navigation.tsx`) — всі навігаційні іконки як React-компоненти. Сітку іконок розширювати, додаючи нові експорти.
- **RefsContext** (`contexts/RefsContext.tsx`) — глобальний синглтон довідників. Модалки отримують `tickets`, `trainers`, `halls`, `trainingTypes` через `useRefs()`, а не через props зі сторінок.
- **`lib/supabase.ts`** — єдиний синглтон `supabase`. Всі client-side компоненти імпортують `import { supabase } from '@/lib/supabase'`.
- **`lib/queries/`** — всі Supabase-запити винесені сюди. Компоненти і хуки імпортують функції з queries, не пишуть `.from()` безпосередньо.
- **Мутації** (INSERT/UPDATE/RPC) залишаються всередині модалок або хуків.
- **Toast** через `sonner` (`import { toast } from 'sonner'`). `<Toaster />` у `app/layout.tsx`.
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

### /schedule Page (станом на 2026-05-21)

**Компоненти:**
- `ScheduleRightPanel` — постійна права панель, завжди видима (крім mobile ≤900px)
  - Міні-календар: інлайн (не портал), для навігації по датах
  - Деталь заняття: `ScheduleDetailCard` при `detailClassId != null`
- `ScheduleDetailCard` — компактна інфокартка заняття (тип, час, тренер, зал, записі)
  - Кнопка «×» закриває kartку
  - Кнопка «Докладніше» готова до подальшої інтеграції з повним модалом

**Topbar (page.tsx):**
- Новий layout: dateChip (міс. абр + число) + titleBlock (назва місяця, week badge, день тижня)
- Навігація: ← → (раніше, пізніше), Сьогодні, іконка пошуку
- Статична мітка «День» (week view implementation відстаньте)
- Вкладки Розклад/Архів — залишаються як були
- Видалено: DateRangePicker (портальний календар замінено на inline ScheduleRightPanel)

**Layout:**
- `.contentRow` — flex-row для grid + right-panel
- `.gridArea` — flex-1 для розкладу/архіву
- `.rightPanel` — 280px sidebar з календарем та деталями

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
8. **scheduleMetrics** — не дублювати формули підрахунку capacity/waitlist в компонентах, тільки через `lib/scheduleMetrics.ts`.
9. **Скасування заняття** — тільки через `cancel_class_and_restore_sessions()` RPC, не прямим UPDATE.
