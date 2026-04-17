# sekta-crm — Supabase CRM

## 📋 Проект
Фитнес/танцевальная студия. CRM для управления клиентами, тренерами, абонементами и продажами.

- **Stack**: Next.js 14.2.3 + React 18 + TypeScript
- **Backend**: Supabase PostgreSQL
- **Auth**: Supabase Auth + JWT
- **Last Updated**: 2026-04-14

---

## 🗄️ Database Schema

### Entity Relationship
```
trainers ──┐
           ├──► sales ◄──── clients
tickets ───┘
```

---

## 📊 Tables

### `clients` - Клиенты студии

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| first_name | text | YES | — | |
| last_name | text | YES | — | |
| phone | text | YES | — | |
| instagram_username | text | YES | — | |
| balance | integer | YES | 0 | Remaining sessions |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | Auto-updated |

**Indexes:**
- `clients_pkey` (UNIQUE btree on id)
- `idx_clients_last_name` (btree on last_name)

**Triggers:**
- `trg_clients_updated_at` — auto-update timestamp on UPDATE

**RLS Policies:**
- `authenticated can read` — SELECT for authenticated users
- `authenticated can insert` — INSERT for authenticated users
- `authenticated can update own` — UPDATE own records only (future)

---

### `tickets` - Тарифы/абонементы

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | — | e.g. "Group Yoga" |
| ticket_type | text | NO | — | see Enums below |
| sessions | integer | NO | — | Number of sessions |
| price | integer | NO | — | Price in UAH (no decimals) |
| is_active | boolean | NO | false | Soft delete |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | Auto-updated |

**Enum: `ticket_type`**
- `group` — Group classes
- `individual` — 1-on-1 coaching
- `hallrental` — Hall rental (full)
- `smallhallrental` — Hall rental (small)
- `individualduo` — 2-person session
- `individualtrio` — 3-person session
- `pylonrental` — Pole rental
- `striprental` — Strip rental

**Constraints:**
- `price > 0` (check constraint)
- `sessions > 0` (check constraint)
- Max 20 active tickets at a time (business rule)

**Indexes:**
- `tickets_pkey` (UNIQUE btree on id)
- `idx_tickets_type` (btree on ticket_type)
- `idx_tickets_is_active` (btree on is_active)

**Triggers:**
- `trg_tickets_updated_at` — auto-update timestamp on UPDATE

---

### `trainers` - Тренеры

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | — | Trainer name |
| is_active | boolean | NO | true | Soft delete |
| instagram_username | text | YES | — | |
| telegram_username | text | YES | — | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | Auto-updated |

**Indexes:**
- `trainers_pkey` (UNIQUE btree on id)

**Triggers:**
- `trg_trainers_updated_at` — auto-update timestamp on UPDATE

---

### `sales` - Продажи (денормализованные)

| Column | Type | Nullable | FK | Notes |
|--------|------|----------|-----|-------|
| id | uuid | NO | — | PK |
| client_id | uuid | NO | → clients.id | |
| ticket_id | uuid | NO | → tickets.id | Reference only |
| trainer_id | uuid | NO | → trainers.id | |
| ticket_name | text | NO | — | **Snapshot** of ticket.name |
| ticket_price | integer | NO | — | **Snapshot** of ticket.price |
| sessions | integer | NO | — | **Snapshot** of ticket.sessions |
| price_paid | integer | NO | — | Actual amount paid (can differ) |
| payment_method | text | NO | — | Cash, card, transfer, etc |
| notes | text | YES | — | Comments |
| created_at | timestamptz | NO | — | |
| updated_at | timestamptz | NO | — | Auto-updated |

**Denormalization Note:**
⚠️ `ticket_name`, `ticket_price`, `sessions` are **immutable historical snapshots** taken at purchase time. **DO NOT** JOIN to `tickets` table for reporting — use the snapshot values directly.

**Indexes:**
- `sales_pkey` (UNIQUE btree on id)
- `idx_sales_client_id` (btree on client_id) — find by client
- `idx_sales_ticket_id` (btree on ticket_id) — find by ticket type
- `idx_sales_trainer_id` (btree on trainer_id) — find by trainer
- `idx_sales_created_at` (btree on created_at) — time-based queries

**Triggers:**
- `trg_sales_updated_at` — auto-update timestamp on UPDATE

**Foreign Keys:**
- `sales.client_id` → `clients.id` (ON DELETE: CASCADE)
- `sales.ticket_id` → `tickets.id` (ON DELETE: SET NULL)
- `sales.trainer_id` → `trainers.id` (ON DELETE: SET NULL)

---

## 🔧 Stored Procedures

### `adjust_client_balance(p_client_id uuid, p_delta integer)`

Atomically adjust client's session balance. Avoids race condition from read-modify-write.

**Signature:**
```sql
CREATE OR REPLACE FUNCTION adjust_client_balance(p_client_id uuid, p_delta integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$ ... $$;
```

**Usage:**
```sql
-- Deduct 1 session
SELECT adjust_client_balance('client-uuid'::uuid, -1);

-- Add 5 sessions
SELECT adjust_client_balance('client-uuid'::uuid, 5);
```

**Called from:**
- API endpoint when session is marked complete
- Manual admin adjustment
- Refund processing

---

## ⚡ Triggers

All tables have auto-updating `updated_at` field via trigger:

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_{table}_updated_at
BEFORE UPDATE ON {table}
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

Applied to: `clients`, `tickets`, `trainers`, `sales`

---

## 🔐 Security

### Row Level Security (RLS)

**Status:** Enabled on all public tables

**Default Policies:**

```sql
-- Authenticated users can read all (future: add role-based filtering)
CREATE POLICY "authenticated can read"
ON {table} FOR SELECT TO authenticated USING (true);

-- Authenticated users can insert (future: add role validation)
CREATE POLICY "authenticated can insert"
ON {table} FOR INSERT TO authenticated WITH CHECK (true);
```

### Future Roles
- `admin` — full access to all operations
- `trainer` — read clients, read own sales
- `user` — read own data only

### Auth
- JWT tokens from Supabase Auth
- Currently: all authenticated = same permissions
- TODO: implement row-level filtering by user_id

---

## 📝 Business Logic

### Session Balance Management
- `clients.balance` tracks remaining sessions
- Updated via `adjust_client_balance()` function
- Decrements when trainer marks session as completed
- Increments on refunds

### Denormalization in `sales`
Sales table denormalizes ticket info to preserve historical accuracy:
- If ticket price changes later, old sales show original price
- If ticket is deleted, historical record remains intact
- Reports don't need to JOIN to tickets table

### Ticket Management
- Max 20 active tickets (`is_active = true`)
- Use `is_active = false` for soft deletes
- Never physically delete (preserves sales history)

### Constraints
- Prices always in **UAH as integers** (no decimals)
- No negative balances (enforce in app layer)
- No negative prices
- Sessions count > 0

---

## 🎯 Naming Conventions

- **Case**: `snake_case` everywhere
- **PKs**: Always `id uuid DEFAULT gen_random_uuid()`
- **Timestamps**: Always `created_at`, `updated_at` (type: `timestamptz`)
- **Money**: Always `integer` (UAH, no decimals)
- **Soft deletes**: Use `is_active` boolean
- **Tables**: Plural form (`clients`, `sales`)
- **Schema**: All in `public`

---

## 📦 Stack

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

## 📜 Migrations

### Completed
- `20260414000000_adjust_client_balance.sql` — Create adjust_client_balance function
- `20260414000001_fix_adjust_client_balance.sql` — Drop ambiguous numeric overload

---

## 🚀 Roadmap (Planned)

- [ ] `visits` table — track individual session attendance
- [ ] `payments` table — detailed payment history
- [ ] Role-based access control (admin, trainer)
- [ ] Payment method validation (enum or reference table)
- [ ] Cron jobs for auto-expiry of inactive sessions
- [ ] Audit logging for financial transactions
- [ ] Client session notifications
- [ ] Trainer dashboard with earnings summary

---

## 📞 Notes for Developers

1. **RLS is enabled** — Test all queries with authenticated context
2. **Snapshots are immutable** — Don't update sales.ticket_price, etc.
3. **Use adjust_client_balance()** — Don't update balance directly
4. **Soft deletes** — Check `is_active` in WHERE clauses
5. **Timestamps are UTC** — Always use `timestamptz`
6. **No decimals for money** — Store UAH as integer (hryvnia only)
7. **Indexes exist** — Leverage them in queries (client_id, created_at, etc)

---

**Last Updated**: 2026-04-14
**Auto-generated from**: Supabase PostgreSQL schemaм