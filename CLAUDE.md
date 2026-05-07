# sekta-crm — Supabase CRM

## Проект
Фитнес/танцевальная студия. CRM для управления клиентами, тренерами, абонементами и продажами.

- **Stack**: Next.js 14.2.3 + React 18 + TypeScript
- **Backend**: Supabase PostgreSQL
- **Auth**: Supabase Auth + JWT
- **Last Updated**: 2026-05-07 (archive tab, cancel/restore flow, soft delete clarified) (recurring classes, waitlist, client enrollment from profile)

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
```

---

## Tables

### `clients` — Клиенты студии

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| first_name | text | YES | — | |
| last_name | text | YES | — | |
| phone | text | YES | — | Уникальный идентификатор клиента |
| instagram_username | text | YES | — | Без @ и домена |
| telegram_username | text | YES | — | Без @ |
| balance | integer | YES | 0 | Денежный депозит (₴) |
| credit_limit | numeric | YES | 10000 | Лимит отрицательного баланса, >= 0 |
| balance_updated_at | timestamptz | YES | now() | Обновляется через update_client_balance() |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | Auto-updated |

**Indexes:**
- `clients_pkey` (UNIQUE btree on id)
- `idx_clients_balance` (btree on balance)
- `idx_clients_last_name_trgm` (GIN gin_trgm_ops on last_name) — fuzzy search
- `idx_clients_phone_trgm` (GIN gin_trgm_ops on phone) — fuzzy search

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

### `tickets` — Тарифы/абонементы

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | — | Название тарифа |
| ticket_type | text | NO | — | Тип занятия (не enum, свободный текст) |
| sessions | integer | NO | — | Количество занятий, > 0 |
| price | integer | NO | — | Цена в **гривнях** (₴) |
| is_active | boolean | NO | false | true = актуальный, false = архив |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | Auto-updated |

**Constraints:**
- `price >= 0` (check)
- `sessions > 0` (check)
- Max 20 активных тарифов (бизнес-правило, не DB-constraint)

**Известные значения `ticket_type`:** group, individual, hallrental, smallhallrental, individualduo, individualtrio, pylonrental, striprental

**Indexes:**
- `tickets_pkey` (UNIQUE btree on id)
- `idx_tickets_type` (btree on ticket_type)
- `idx_tickets_is_active` (btree on is_active)

**RLS:** Отключён

---

### `trainers` — Тренеры

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | — | length(trim(name)) > 0 |
| is_active | boolean | NO | true | false = больше не работает |
| instagram_username | text | YES | — | Без @ |
| telegram_username | text | YES | — | Без @ |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | Auto-updated |

**Indexes:**
- `trainers_pkey` (UNIQUE btree on id)

**RLS:** Отключён

---

### `sales` — Продажи (денормализованные)

| Column | Type | Nullable | FK | Notes |
|--------|------|----------|-----|-------|
| id | uuid | NO | — | PK |
| client_id | uuid | NO | → clients.id CASCADE | |
| ticket_id | uuid | YES | → tickets.id SET NULL | |
| trainer_id | uuid | YES | → trainers.id SET NULL | |
| ticket_name | text | YES | — | **Snapshot** ticket.name на момент продажи |
| ticket_price | integer | YES | — | **Snapshot** ticket.price (гривні) |
| sessions | integer | YES | — | **Snapshot** ticket.sessions |
| price_paid | integer | NO | — | Фактически оплачено, >= 0 |
| amount_given | integer | NO | — | Сумма, которую дал клиент, >= 0 |
| payment_method | text | NO | — | Enum: `cash`, `fop`, `personal_card`, `deposit` |
| notes | text | YES | — | Комментарий |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | Auto-updated |

**Денормализация:**
⚠️ `ticket_name`, `ticket_price`, `sessions` — **неизменяемые исторические снимки** на момент покупки. Не джоинить `tickets` для отчётов — использовать snapshot-значения напрямую.

**Indexes:**
- `sales_pkey` (UNIQUE btree on id)
- `idx_sales_client_id` (btree on client_id)
- `idx_sales_client_created` (btree on client_id, created_at DESC)
- `idx_sales_ticket_id` (btree on ticket_id)
- `idx_sales_trainer_id` (btree on trainer_id)
- `idx_sales_created_at` (btree on created_at)
- `idx_sales_price_paid` (btree on price_paid)

**RLS:** Отключён

---

### `balance_transactions` — Лог балансовых операций

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| client_id | uuid | NO | — | → clients.id |
| amount | numeric | NO | — | Изменение баланса, ≠ 0 |
| transaction_type | varchar | NO | — | Тип операции |
| balance_before | numeric | NO | — | Баланс до |
| balance_after | numeric | NO | — | Баланс после |
| related_sale_id | uuid | YES | — | → sales.id |
| description | text | YES | — | |
| reason | text | YES | — | |
| created_by | uuid | NO | gen_random_uuid() | |
| created_at | timestamptz | YES | now() | |
| reversed_at | timestamptz | YES | — | Если операция отменена |
| reversed_by | uuid | YES | — | |
| reversal_reason | text | YES | — | |

**Indexes:**
- `balance_transactions_pkey` (UNIQUE btree on id)
- `idx_balance_transactions_client` (btree on client_id, created_at DESC)
- `idx_balance_transactions_sale` (btree on related_sale_id WHERE NOT NULL)
- `idx_balance_transactions_type` (btree on transaction_type, created_at DESC)

**RLS:** Отключён

---

### `halls` — Залы студии

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | — | length(trim(name)) > 0 |
| capacity | integer | NO | — | > 0 |
| is_active | boolean | NO | true | |
| description | text | YES | — | |
| created_at | timestamptz | NO | now() | |

**Indexes:**
- `halls_pkey` (UNIQUE btree on id)

**RLS:** Отключён

---

### `class_series` — Шаблони серій занять

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
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
| created_at | timestamptz | NO | now() | |

**RLS:** Відключено. GRANT на anon, authenticated.

### `series_clients` — Постійники шаблонів

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | NO | PK |
| series_id | uuid | NO | → class_series.id CASCADE |
| client_id | uuid | NO | → clients.id CASCADE |
| created_at | timestamptz | NO | now() |

**UNIQUE(series_id, client_id).** Використовується `generate_week()` для автозапису при виставленні тижня.

**RLS:** Увімкнено. authenticated = повний доступ.

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

### `enrollments` — Записи клієнтів на заняття

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | NO | PK |
| class_id | uuid | NO | → classes.id |
| client_id | uuid | NO | → clients.id |
| status | text | NO | enrolled / attended / cancelled / noshow / **waitlist** |
| sessions_used | integer | NO | default 0 |
| sale_id | uuid | YES | |
| notes | text | YES | |

**Waitlist:** якщо зал повний при INSERT зі статусом `enrolled` — тригер `check_class_capacity` автоматично змінює статус на `waitlist`. Адмін вручну переводить в `enrolled`.

---

## Stored Procedures

### `create_sale(...)` — Атомарне створення продажу

```
create_sale(p_client_id, p_ticket_id, p_trainer_id, p_price_paid, p_amount_given, p_payment_method, p_notes, p_created_at)
```
INSERT у `sales` + `update_client_balance` в одній транзакції.

---

### `update_sale(...)` — Атомарне редагування продажу

```
update_sale(p_sale_id, p_client_id, p_ticket_id, p_trainer_id, p_ticket_name, p_ticket_price, p_sessions, p_ticket_type, p_price_paid, p_amount_given, p_payment_method, p_notes, p_created_at)
```
Реверс старого балансу + застосування нового в одній транзакції.

---

### `delete_sale(p_sale_id)` — Атомарне видалення продажу

Видаляє запис + реверсує зміну балансу.

---

### `update_client_balance(...)` — Атомарне змінення балансу

```
update_client_balance(p_client_id, p_amount, p_transaction_type, p_description, p_related_sale_id, p_reason)
→ TABLE(success boolean, new_balance numeric, transaction_id uuid, error_message text)
```

1. Блокує рядок клієнта (`FOR UPDATE`)
2. Перевіряє credit_limit: відмовляє якщо `balance + amount < -credit_limit`
3. Записує рядок у `balance_transactions`
4. Оновлює `clients.balance` і `clients.balance_updated_at`

**Ніколи не UPDATE clients.balance напряму — тільки через цю функцію.**

---

### `mark_attendance(p_enrollment_id, p_sessions_used DEFAULT 1)` — Відвідуваність

```
→ TABLE(success boolean, error_message text)
```
Атомарно: перевіряє `client_session_balances`, декрементує сесії, ставить `status='attended'`. Повертає `success=false` якщо балансу недостатньо.

---

### `set_updated_at()` — Тригерна функція

Оновлює `updated_at = now()` перед кожним UPDATE. Застосована до: `clients`, `tickets`, `trainers`, `sales`.

---

### `generate_week(p_start_date date, p_weeks int DEFAULT 1)` — Генерація тижня

```
→ TABLE(classes_created int, enrollments_created int)
```
Бере **тільки** `class_series WHERE type='template'`, генерує заняття на `p_weeks` тижнів починаючи з `p_start_date` (має бути понеділок). Ідемпотентна: повторний виклик на ту саму дату не створює дублікатів (UNIQUE index `uq_classes_series_date`). Автоматично записує `series_clients` в `enrollments` зі статусом `enrolled` (тригер `check_class_capacity` може перевести частину у `waitlist`).

**GRANT EXECUTE** на authenticated, anon.

---

## Security

### RLS
**Статус: Увімкнено на всіх таблицях.** Політика `authenticated_all`: authenticated = повний доступ, anon = нічого. При нових таблицях через міграцію — додавати `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO anon, authenticated`.

### Auth
- JWT токены от Supabase Auth
- Текущее состояние: все authenticated пользователи = одинаковые права

---

## Business Logic

### Управление балансом
- `clients.balance` — грошовий депозит (₴, integer). Змінювати **тільки через `update_client_balance()`** — атомарно + логує в `balance_transactions`. Ніколи не UPDATE напряму.
- `client_session_balances` — залишки занять по типу (`ticket_type`). Змінювати **тільки через `mark_attendance()` RPC**.
- `credit_limit` = 10000 по замовчуванню (дозволяє депозит до -10000)

### Деньги
- `tickets.price` — в **гривнях** (₴), відображати як є
- `sales.price_paid`, `sales.amount_given` — також гривні (₴)
- `clients.credit_limit` — тип numeric, не integer

### Денормализация в `sales`
- `ticket_name`, `ticket_price`, `sessions` — снимки на момент продажи
- Не обновлять, не джоинить tickets для отчётов

### Ticket Management
- Max 20 активных тарифов (`is_active = true`) — бизнес-правило
- Мягкое удаление через `is_active = false`
- Физически не удалять (сохраняется история продаж)

### payment_method в sales
Допустимые значения: `cash`, `fop`, `personal_card`, `deposit`

---

## Stack

**Frontend:**
- Next.js 14.2.3
- React 18
- TypeScript

**Forms & Validation:**
- react-hook-form 7.72.1
- @hookform/resolvers 5.2.2
- zod 4.3.6

**Backend & Database:**
- Supabase PostgreSQL
- @supabase/supabase-js 2.43.4
- @supabase/ssr 0.10.2

**Environment:**
- dotenv 17.4.2

**Commands:**
```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Build for production
npm run start    # Start production server
```

---

## Pages (MVP Core)

| Route | Назначение |
|-------|-----------|
## Frontend Architecture

### Components

```
components/
  Sidebar.tsx + Sidebar.module.css       — навігація (fixed, CSS Modules)
  ClassModal.tsx + .module.css
  ClientModal.tsx + .module.css
  HallModal.tsx + .module.css
  SaleModal.tsx + .module.css
  TicketModal.tsx + .module.css
  TrainerModal.tsx + .module.css
  TrainingTypeModal.tsx + .module.css
  features/
    ClientSearchCombobox.tsx + .module.css  — використовується в /schedule/[classId]
  ui/  — ВИДАЛЕНО (були Tailwind-версії, не використовувались)
```

**Правила:**
- Модалки отримують довідникові дані (tickets, trainers, halls, trainingTypes) через props зі сторінок
- Мутації (INSERT/UPDATE/RPC) залишаються всередині модалок
- `ClientModal` і `ClientSearchCombobox` — виняток: їхній fetch специфічний і залишається всередині

### Hooks

```
hooks/
  useClients.ts       — список клієнтів
  useClientBalance.ts — баланс конкретного клієнта
  useSales.ts         — продажі
  useTickets.ts       — тарифи
  useTrainers.ts      — тренери
  useHalls.ts         — зали
  useTrainingTypes.ts — типи занять
  useSaleForm.ts      — стан форми SaleModal
  useSaleSubmit.ts    — сабміт SaleModal (create/update/delete)
  useModalFocus.ts    — focus trap + Escape для всіх модалок
```

### CSS Design System

Всі стилі через CSS Modules + змінні з `app/globals.css`. Жодних HEX/rgba напряму в `*.module.css`.

**Розміри:**
- `--control-h: 32px` — висота всіх inputs і кнопок
- `--topbar-py: 16px`, `--topbar-px: 28px` — padding топбара (64px висота скрізь)
- `--radius: 10px`, `--radius-sm: 6px`

**Фони:**
- `--bg: #0e0e0e`, `--bg-2: #161616`, `--bg-3: #1e1e1e`

**Бордери:**
- `--border`, `--border-hover`, `--border-strong`

**Текст:**
- `--text`, `--text-2`, `--text-3`

**Акцент** (лаймовий `#c8f060`):
- `--accent`, `--accent-dim`, `--accent-text`
- `--accent-border`, `--accent-border-hover`, `--accent-border-strong`

**Стани:**
- `--danger` / `--danger-dim` / `--danger-border*`
- `--success` / `--success-dim`
- `--warning` / `--warning-dim`

**Кольори методів оплати:**
- `--fop` / `--fop-dim` — синій (ФОП)
- `--card` / `--card-dim` — жовтогарячий (особиста картка)
- `--deposit` / `--deposit-dim` — фіолетовий (депозит)

**Анімації:**
- `--motion-fast: 0.12s ease-out`, `--motion-standard: 0.18s ease-in-out`
- `@keyframes overlayIn`, `@keyframes modalIn` — для модалок

---

## Pages (MVP Core)

| Route | Назначение |
|-------|-----------|
| `/login` | Авторизация |
| `/sales` | Запись продаж, история |
| `/clients` | База клиентов, баланс |
| `/clients/[id]` | Профіль клієнта: контакти, депозит, залишок занять, історія покупок |
| `/tickets` | Управление тарифами |
| `/trainers` | Управление тренерами |
| `/halls` | Управление залами |
| `/training-types` | Типи занять (довідник) |
| `/schedule` | Розклад занять |
| `/schedule/templates` | Шаблони тижня: create/edit class_series type='template', постійники, кнопка "Виставити тиждень" |
| `/schedule/[classId]` | Деталі заняття, записи клієнтів, відвідуваність. Кнопки: «Редагувати», «Скасувати заняття» / «Відновити» (soft delete через `is_cancelled`) |
| `/accounting` | Облік надходжень |
| `/accounting/trainers` | Розрахунок з тренерами |

---

## Notes for Developers

0. **CLAUDE.md завжди актуальний** — після кожної задачі що змінює архітектуру, компоненти, хуки або DB — оновлювати CLAUDE.md в тому ж коміті.
1. **RLS увімкнено** — authenticated = повний доступ. При нових таблицях: додавати GRANT + policy.
2. **Грошовий баланс тільки через RPC** — `update_client_balance()`, не UPDATE напрямую. **Залишок занять тільки через `mark_attendance()`**.
3. **Snapshots неизменяемы** — не трогать `sales.ticket_price`, `ticket_name`, `sessions`
4. **Мягкие удаления** — везде `is_active` або `is_cancelled`, никогда не DELETE. `classes` використовує `is_cancelled=true`. Розклад фільтрує `is_cancelled=false`; архів показує `is_cancelled=true`.
5. **Timestamps UTC** — всегда `timestamptz`
6. **Деньги в гривнях** — `tickets.price`, `sales.price_paid`, `sales.amount_given` зберігаються в гривнях (₴), ділити на 100 не треба
7. **GIN-индексы на clients** — использовать для fuzzy-поиска по фамилии и телефону (`%` или `similarity()`)

---

**Last Updated**: 2026-05-07 (archive tab, cancel/restore flow, soft delete clarified)
