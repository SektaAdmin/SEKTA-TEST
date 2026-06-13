# DATABASE — живий указівник

> **Тонкий навігаційний документ.** Канонічна схема — авто-генерований `types/database.types.ts`
> (`npm run sync:schema`). Канонічні **тіла** RPC/тригерів/політик — у міграціях
> (`supabase/migrations/`, останній знімок: `20260613000001_snapshot_prod_2026_06_13.sql`).
> Бізнес-сенс і сигнатури RPC — `CLAUDE.md` §Схема БД, §RPC. Тут — лише вхідні точки + інваріанти.
> Будь-яка міграція, що змінює схему/RPC/тригер → оновлює `CLAUDE.md` (§Схема або §RPC) у тому ж
> коміті (див. [CONTRIBUTING.md](CONTRIBUTING.md)).

## Канон

| Що | Джерело правди |
|----|----------------|
| Колонки/типи таблиць | `types/database.types.ts` (авто-ген, `npm run sync:schema`) |
| Зв'язки + неочевидний бізнес-сенс колонок | `CLAUDE.md` §Схема БД, §«Неочевидний бізнес-сенс колонок» |
| Сигнатури всіх RPC | `CLAUDE.md` §RPC (Stored Procedures) |
| Тіла RPC / тригерів / RLS | `supabase/migrations/*` (знімок = канонічний дамп прод) |
| Прод-стан (звірка) | Supabase MCP (лише SELECT) — project-ref у `reference_supabase_mcp` memory |

## Таблиці (16)

`balance_transactions` · `class_series` · `classes` · `client_contacts` · `client_session_balances` ·
`clients` · `enrollments` · `halls` · `sales` · `series_clients` · `studio_expenses` · `tickets` ·
`trainer_payments` · `trainer_rates` · `trainers` · `training_types`.

Зв'язки і сенс колонок → `CLAUDE.md` §Схема БД.

## Views (4)

| View | Призначення | Вживає |
|------|-------------|--------|
| `clients_negative_balance` | Клієнти з від'ємним депозитом (алерт-картка дашборду) | `listNegativeBalanceClients` (`lib/queries/dashboard.ts`) |
| `clients_with_contacts` | `clients` + контакти з `client_contacts` (security_invoker — поважає RLS) | `lib/queries/clients.ts`, `client-detail.ts` |
| `session_balance_reconcile` | Детектор розходження залишку сесій (звірка нарахувань без журналу) — **SECURITY DEFINER by design**, див. [SECURITY.md](SECURITY.md) §Відомі сигнали advisor | у коді не вживається (детектор для ручної звірки) |
| `v_client_balance_summary` | Похідний зріз балансу клієнта (`available_credit = credit_limit + balance`, `balance_status`) над `clients` | у коді застосунку не вживається (зручний view для ручних запитів) |

## Грошові / сесійні інваріанти (повний список — `CLAUDE.md` §Залізні правила)

Те, чого **не видно з коду** і що ламає дані/гроші:

1. `clients.balance` — **тільки** через `update_client_balance()` RPC. Ніколи не `UPDATE` напряму.
2. `client_session_balances` — **тільки** через RPC (`mark_attendance`/`reverse_attendance`/`change_enrollment_status`).
3. Зміна статусу enrollment з UI — **тільки** `change_enrollment_status()`.
4. Скасування заняття — **тільки** `cancel_class_and_restore_sessions()`.
5. Snapshots у `sales` (`ticket_name`/`ticket_price`/`sessions`) — незмінні, не джоїнити `tickets` для звітів.
6. Гроші — у гривнях (₴), integer. Не ділити на 100.
7. М'які видалення (`is_active`/`is_cancelled`). Винятки (фізичний DELETE з реверсом) — лише
   `delete_enrollment`/`delete_class` (свідомий виняток, див. `CLAUDE.md` §RPC).
8. Timestamps — `timestamptz`, UTC.

## RPC (повна таблиця сигнатур + призначення — `CLAUDE.md` §RPC)

Усі повертають `TABLE(...)` — читай `data[0]`. Бізнес-помилки приходять як `success=false` +
`error_message` (не SQL-error) → розпаковуй через `callRpc()` (`lib/rpc.ts`).

Привілейовані `SECURITY DEFINER` enrollment-RPC (оминають RLS, гейт `can_manage_enrollment()`):
`change_enrollment_status`, `mark_attendance`, `cancel_class_and_restore_sessions`,
`reverse_attendance`, `delete_enrollment`, `delete_class`. Деталі гейта → [SECURITY.md](SECURITY.md).

## Правила для нової міграції

- Нова таблиця → `ENABLE ROW LEVEL SECURITY` + політика + `GRANT … TO anon, authenticated`
  (RLS-on без політики = deny-all). Деталі → [SECURITY.md](SECURITY.md).
- Новий RPC → `SET search_path = public, pg_temp` (інваріант #10).
- Після зміни схеми → `npm run sync:schema` (регенерує `types/database.types.ts`).
- **Оновити цей блок + `CLAUDE.md` §Схема/§RPC у тому самому коміті.**
