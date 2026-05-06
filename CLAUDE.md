# sekta-crm — Supabase CRM

## Проект
Фитнес/танцевальная студия. CRM для управления клиентами, тренерами, абонементами и продажами.

- **Stack**: Next.js 14.2.3 + React 18 + TypeScript
- **Backend**: Supabase PostgreSQL
- **Auth**: Supabase Auth + JWT
- **Last Updated**: 2026-05-06

---

## Database Schema

### Entity Relationship
```
trainers ──┐
           ├──► sales ◄──── clients ◄──── balance_transactions
tickets ───┘
halls (standalone reference)
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
| payment_method | text | NO | — | Enum: `cash`, `fop`, `personal_card` |
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

## Stored Procedures

### `update_client_balance(...)` — Атомарное изменение баланса

**Сигнатура:**
```sql
CREATE OR REPLACE FUNCTION public.update_client_balance(
  p_client_id       uuid,
  p_amount          numeric,
  p_transaction_type varchar,
  p_description     text    DEFAULT NULL,
  p_related_sale_id uuid    DEFAULT NULL,
  p_reason          text    DEFAULT NULL
)
RETURNS TABLE(
  success        boolean,
  new_balance    numeric,
  transaction_id uuid,
  error_message  text
)
```

**Что делает:**
1. Блокирует строку клиента (`FOR UPDATE`)
2. Проверяет credit_limit: отказывает если `balance + amount < -credit_limit`
3. Записывает строку в `balance_transactions`
4. Обновляет `clients.balance` и `clients.balance_updated_at`
5. Возвращает `success=true/false` + `error_message` при ошибке

**Использование:**
```typescript
const { data, error } = await supabase.rpc('update_client_balance', {
  p_client_id: clientId,
  p_amount: -1,                    // отрицательное = списание
  p_transaction_type: 'deduction',
  p_description: 'Session completed',
  p_related_sale_id: saleId,       // опционально
  p_reason: null,                  // опционально
});

if (data?.[0]?.success === false) {
  console.error(data[0].error_message);
}
```

**Вызывается из:** SaleModal.tsx (при записи продажи), ручная корректировка

---

### `set_updated_at()` — Триггерная функция

Обновляет `updated_at = now()` перед каждым UPDATE. Применена к: `clients`, `tickets`, `trainers`, `sales`.

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
- @supabase/ssr 0.3.0

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
| `/login` | Авторизация |
| `/sales` | Запись продаж, история |
| `/clients` | База клиентов, баланс |
| `/clients/[id]` | Профіль клієнта: контакти, депозит, залишок занять, історія покупок |
| `/tickets` | Управление тарифами |
| `/trainers` | Управление тренерами |
| `/halls` | Управление залами |
| `/training-types` | Типи занять (довідник) |
| `/schedule` | Розклад занять |
| `/schedule/[classId]` | Деталі заняття, записи клієнтів, відвідуваність |
| `/accounting` | Облік надходжень |
| `/accounting/trainers` | Розрахунок з тренерами |

---

## Notes for Developers

1. **RLS увімкнено** — authenticated = повний доступ. При нових таблицях: додавати GRANT + policy.
2. **Грошовий баланс тільки через RPC** — `update_client_balance()`, не UPDATE напрямую. **Залишок занять тільки через `mark_attendance()`**.
3. **Snapshots неизменяемы** — не трогать `sales.ticket_price`, `ticket_name`, `sessions`
4. **Мягкие удаления** — везде `is_active`, никогда не DELETE
5. **Timestamps UTC** — всегда `timestamptz`
6. **Деньги в гривнях** — `tickets.price`, `sales.price_paid`, `sales.amount_given` зберігаються в гривнях (₴), ділити на 100 не треба
7. **GIN-индексы на clients** — использовать для fuzzy-поиска по фамилии и телефону (`%` или `similarity()`)

---

**Last Updated**: 2026-05-06
