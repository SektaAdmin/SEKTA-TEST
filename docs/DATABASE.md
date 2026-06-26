# DATABASE

Канон: колонки/типи → `types/database.types.ts` (`npm run sync:schema`); зв'язки+бізнес-сенс → `CLAUDE.md` §Схема; сигнатури RPC → `CLAUDE.md` §RPC; тіла RPC/тригерів/RLS → `supabase/migrations/*`; прод-стан → Supabase MCP (лише SELECT, project-ref у `reference_supabase_mcp`).

## Таблиці (17)
`balance_transactions` · `class_series` · `classes` · `client_contacts` · `client_session_balances` · `clients` · `enrollment_events` · `enrollments` · `halls` · `sales` · `series_clients` · `studio_expenses` · `tickets` · `trainer_payments` · `trainer_rates` · `trainers` · `training_types`.

## Views (4)
| View | Призначення | Вживає |
|------|-------------|--------|
| `clients_negative_balance` | від'ємний депозит | `listNegativeBalanceClients` |
| `clients_with_contacts` | `clients`+`client_contacts` (security_invoker) | `clients.ts`, `client-detail.ts` |
| `session_balance_reconcile` | детектор розходження сесій. SECURITY DEFINER by design | ручна звірка |
| `v_client_balance_summary` | зріз балансу (`available_credit=credit_limit+balance`, `balance_status`) | — |

## Інваріанти (канон — `CLAUDE.md`)
1. `clients.balance` — тільки `update_client_balance()`. Ніколи прямий `UPDATE`.
2. `client_session_balances` — тільки RPC (`mark_attendance`/`reverse_attendance`/`change_enrollment_status`).
3. Статус enrollment з UI — тільки `change_enrollment_status()`.
4. Скасування заняття — тільки `cancel_class_and_restore_sessions()`.
5. Snapshots у `sales` (`ticket_name`/`ticket_price`/`sessions`) незмінні. Не джоїнити `tickets` для звітів.
6. Гроші — ₴, integer. Не ділити на 100.
7. М'які видалення (`is_active`/`is_cancelled`). Виняток: `delete_enrollment`/`delete_class` (фізичний DELETE з реверсом).
8. Timestamps — `timestamptz`, UTC.

## RPC — загальне
Усі повертають `TABLE(...)` → читай `data[0]`. Бізнес-помилки = `success=false`+`error_message` → `callRpc()` (`lib/rpc.ts`).
Привілейовані `SECURITY DEFINER` (оминають RLS, гейт `can_manage_enrollment()`): `change_enrollment_status`, `mark_attendance`, `cancel_class_and_restore_sessions`, `reverse_attendance`, `delete_enrollment`, `delete_class`.

## Нова міграція
- Нова таблиця → `ENABLE ROW LEVEL SECURITY` + політика + `GRANT … TO anon, authenticated` (RLS-on без політики = deny-all).
- Новий RPC → `SET search_path = public, pg_temp` (інв. #10).
- Після зміни схеми → `npm run sync:schema`. Оновити цей файл + `CLAUDE.md` §Схема/§RPC у тому ж коміті.

---

## Схема
```
clients ──< sales >── tickets        balance_transactions >── clients
   │            │
   │            └── trainers          client_session_balances >── clients
   └──< enrollments >── classes ──< class_series (шаблон/серія)
                          │              └──< series_clients >── clients
                          └── halls, trainers
trainer_rates >── trainers (trainer_id NULL = глобальна)
trainer_payments >── trainers      studio_expenses >── trainers (optional)
training_types — довідник
```

## Колонки — бізнес-сенс
- `clients.balance` — депозит ₴ (від'ємний до `-credit_limit`, дефолт 10000).
- `client_session_balances` — залишок по типу (`ticket_type`), не загальний.
- `tickets.ticket_type` — вільний текст (не enum), = `training_types.code`. Відомі: `group`, `individual`, `hallrental`, `smallhallrental`, `individualduo`, `individualtrio`, `pylonrental`, `striprental`, `selftraining`. Max 20 активних тарифів.
- Оренда (`*rental`) — звичайний абонемент: N сесій наперед, списується сесія, депозит НЕ чіпається. `enrollClient` НЕ створює sale.
- `sales.payment_method` — `cash`/`fop`/`personal_card`/`deposit`. `deposit` — 4-й спосіб у `SaleModal` (лише для абонемента). Закон: `Δдепозит = amount_given − price_paid` (`create_sale`/`update_sale`). `amount_given`=живі гроші; `deposit`→`amount_given=0`, `price_paid`=списання. Жива оплата абонемента: `amount_given>0` (zod).
- `sales.cash_holder` / `studio_expenses.cash_holder` / `trainer_payments.cash_holder` — `uuid`→`trainers.id` (хто тримає готівку, лише `cash`). НЕ текст.
- `sales` без тікета (`ticket_id=null`) = депозитна операція: `+amount_given` поповнення / `−price_paid` списання.
- `sales.receipt_number` — `SEQUENCE`, унікальний. `receipt_url` — публічний PNG у bucket `receipts`. `session_balance_snapshot` — jsonb `[{ticket_type, sessions_balance}]`. Генерація: `hooks/useReceipt.ts` (html2canvas→upload→update). «🧾» генерує+зберігає; «📋» копіює PNG (Clipboard).
- `training_types.code` — незмінний id; `label` редагований; `short_label` nullable (звіти/PDF ЗП). Лейбли з БД (RefsContext/`listTrainingTypeLabels`).
- `class_series.type` — `'template'` (шаблон тижня) / `'series'` (разова). `day_of_week`: 0=Нд..6=Сб. `generate_week()` будує `classes` з `type='template'`.
- `classes.choreo_stage` — вільний текст, етап хореографії на ЗАНЯТТІ (не серії). НЕ змішувати з `notes`. `generate_week` НЕ переносить. Inline-edit `updateClassChoreoStage()`.
- `enrollments.status` — `enrolled`/`attended`/`cancelled`/`noshow`/`waitlist`. Тригер `check_class_capacity` авто `enrolled`→`waitlist` при повному залі. Фінфакт у `sessions_used` (>0=списано): `cancelled` зі `sessions_used>0` = «скасовано пізно, штраф». Статус НЕ ділимо на early/late.
- `enrollments.cancellation_source` — `self`/`staff_manual`/`class_cancelled`/`auto_close`. `cancelled_at` — час переходу в `cancelled` (NULL поки ні). `cancelled_from_status` — з якого статусу (для `cancel_class_and_restore_sessions`).
- `enrollments.hours_attended` — `int[]` для `duration_min>=120`: `[1]`/`[2]`/`[1,2]`. `NULL`=усе заняття. `sessions_used = hours_attended.length` (або 1 якщо NULL).
- `enrollments.staff_note` — `text` nullable. Пишеться `change_enrollment_status` лише при `p_force_no_charge=true`.
- `enrollment_events` — append-only лог змін enrollment + аутбокс Telegram-нотифікацій (одна таблиця: `notify`/`delivered` роблять її і логом, і чергою). Пише ТІЛЬКИ тригер `log_enrollment_event` (SECURITY DEFINER) на `enrollments` AFTER INSERT/UPDATE OF status. `actor_role` — owner/admin/trainer/client/**system** (cron: `auth.uid()` NULL + cron-ідіома). `is_self_owner`=власник діє у себе. `notify` (=actor≠system AND not self-owner AND owner≠NULL AND type∈enrolled/cancelled/waitlisted) → подію шле dispatcher. `class_id`/`client_id` — FK `ON DELETE SET NULL`; решта (`owner_trainer_id` тощо) — снапшот-uuid без FK. RLS: SELECT лише owner/admin; INSERT/UPDATE без grant (definer-тригер + dispatcher-postgres). frontend — `/audit` (`listEnrollmentEvents`).
- `trainers.telegram_chat_id` (`bigint`, UNIQUE) — куди слати нотифікації; пише лише service-role webhook (`/api/telegram/webhook`), тренер не має UPDATE на свій рядок. `telegram_link_token` (`uuid`, UNIQUE) — одноразовий deep-link `t.me/<bot>?start=<token>`; ротується webhook-ом після привʼязки.
- Дедлайн відміни — `cancellation_deadline(starts_at)`: початок `<14:00` → 19:00 попереднього дня; `>=14:00` → `starts_at−6год`. До дедлайну `cancelled` без списання, після — зі списанням. `noshow` списує завжди.
- `studio_expenses.direction` — `expense` (зменшує) / `income` (збільшує). `payment_method` без `deposit`.
- `trainers.phone`/`email` — контакти для логіну, UNIQUE серед заповнених. `trainers.user_id` заповнений = є кабінет.
- `trainer_rates` — `trainer_rate`+`studio_rate` (₴/людино-год), `valid_from`/`valid_to` (NULL=активна). Пріоритет: індивід.+зал > індивід. > глоб.+зал > глоб. Зміна = закрити стару (`valid_to`) + додати нову.

## RLS (інв. #9, через `auth_role()`)
Доменні таблиці: `owner_admin_all` (owner+admin FOR ALL) АБО `owner_all` (owner FOR ALL) + SELECT-політики. `class_series` — RLS УВІМКНЕНО (`owner_admin_all`; DML відкликано в `anon`). Матриця → `docs/ROLES_PLAN.md` §Фаза 3.
- `client_contacts`/`sales`/`balance_transactions`/`studio_expenses`/`trainer_payments`/`trainer_rates` — trainer не бачить.
- admin не бачить `trainer_payments`/`trainer_rates` (owner-only); не редагує `halls`/`training_types`/`tickets` (SELECT).
- trainer пише `classes`/`enrollments` лише свої (`trainer_id = current_trainer_id()`).
- client бачить лише `*_id = current_client_id()`.
- RLS-on БЕЗ політики = deny-all.

---

## RPC
| RPC | Призначення |
|-----|-------------|
| `create_sale(p_client_id, p_ticket_id, p_trainer_id, p_cash_holder, p_price_paid, p_amount_given, p_payment_method, p_notes, p_created_at)` | INSERT sales + `update_client_balance` в одній транзакції |
| `update_sale(p_sale_id, …, p_cash_holder, p_ticket_name, p_ticket_price, p_sessions, p_ticket_type, …)` | реверс старого балансу + новий |
| `delete_sale(p_sale_id)` | видалити sale + реверс балансу |
| `update_client_balance(p_client_id, p_amount, p_transaction_type, p_description, p_related_sale_id, p_reason)` | → `(success, new_balance, transaction_id, error_message)`. FOR UPDATE + credit_limit + лог |
| `mark_attendance(p_enrollment_id, p_sessions_used=1)` | → `(success, error_message)`. Декремент сесій (allow negative), status=attended. Лише cron; UI → `change_enrollment_status`. Гейт `can_manage_enrollment()`; EXECUTE лише `postgres` |
| `change_enrollment_status(p_enrollment_id, p_new_status, p_force_no_charge=false, p_sessions_used=null, p_staff_note=null)` | → `(success, charged, error_message)`. Єдина точка зміни статусу з UI. Вирівнює баланс сесій + правило скасування. Ставить `cancelled_at=now()`+`cancellation_source='staff_manual'` при `cancelled`, NULL при виході. `p_staff_note` лише при `p_force_no_charge=true`. Гейт `can_manage_enrollment()` |
| `delete_enrollment(p_enrollment_id)` | → `(success, error_message)`. Фізичне видалення. Повертає `sessions_used` ПЕРЕД `DELETE`. Виняток з інв. #7. frontend `deleteEnrollment()`. Гейт `can_manage_enrollment()` |
| `cancellation_deadline(starts_at) → timestamptz` | дедлайн безкоштовного скасування |
| `reverse_attendance(p_enrollment_id)` | → `(success, error_message)`. Повертає сесії, status=cancelled, sessions_used=0, `cancellation_source='staff_manual'`, `cancelled_at=now()`. Гейт `can_manage_enrollment()` |
| `cancel_class_and_restore_sessions(p_class_id)` | → `(success, restored_count, error_message)`. attended+noshow → повернути `sessions_used` (якщо `>0`); enrolled → скасувати без повернення; is_cancelled=true. Гейт `can_manage_enrollment()` |
| `delete_class(p_class_id)` | → `(success, restored_count, error_message)`. Фізичне видалення. Сесії повертає тригер `restore_sessions_on_class_delete` (BEFORE DELETE); записи CASCADE. Виняток з інв. #7. Заняття з `series_id` `generate_week` пересоздасть. frontend `deleteClass()`. Гейт `can_manage_enrollment()` |
| `restore_class(p_class_id)` | → `(success, restored_count, error_message)`. Зворотне до `cancel_class_and_restore_sessions`: списує сесії назад для `attended`/`noshow`, відновлює `sessions_used`+статус з `cancelled_from_status`, чистить cancellation-поля. Гейт `can_manage_enrollment()`. Перед викликом `check_class_conflicts` |
| `can_manage_enrollment() → boolean` | базовий гейт: owner/admin АБО `app.trusted_call='on'` АБО cron-postgres. Вживають `mark_attendance`, `client_cancel` |
| `can_manage_class(p_class_id) → boolean` | + тренер-власник (`trainer_id = current_trainer_id()`). Вживають `cancel_class_and_restore_sessions`, `restore_class`, `delete_class` |
| `can_manage_class_enrollment(p_enrollment_id) → boolean` | + тренер-власник (JOIN enrollments→classes). Вживають `change_enrollment_status`, `reverse_attendance`, `delete_enrollment` |
| `generate_week(p_start_date, p_weeks=1)` | → `(classes_created, enrollments_created)`. Ідемпотентна (UNIQUE `uq_classes_series_date`). Прокидує series_clients в enrollments |
| `update_training_type_sort_orders(p_ids[], p_orders[])` | → `void`. Пакетний UPDATE `sort_order`. SECURITY DEFINER + гейт `auth_role() IN ('owner','admin')`, `SET search_path`. EXECUTE лише `authenticated`. frontend `reorderTrainingTypes()` |
| `calc_trainer_salary_v2(p_trainer_id, p_start, p_end)` | рядок на enrollment (attended+noshow). Оплата: `rate × e.sessions_used`. `noshow` оплачується. Ставка з `trainer_rates` на дату заняття. Для `/settings/salary/calculations` |
| `check_class_conflicts(p_starts_at, p_duration_min, p_hall_id, p_trainer_id, p_exclude_id)` | перетин по залу/тренеру |
| `check_client_conflict(p_client_id, p_class_id)` | клієнт уже на паралельному занятті |
| `auth_role() → text` | роль із JWT (`app_metadata.role`), дефолт `'client'`. Правда для RLS |
| `current_client_id() / current_trainer_id() → uuid` | SECURITY DEFINER. Мапінг `auth.uid()`→доменний id для RLS (в обхід RLS) |
| `normalize_phone_ua(p_phone) → text` | IMMUTABLE. Укр. номер → E.164. NULL якщо некоректний. Route Handler онбордингу |
| `client_enroll(p_class_id)` | → `(success, enrollment_id, enrolled_status, error_message)`. Self-запис. Гейт: роль=client, є оплачені заняття типу (`'no_sessions'`), без конфлікту (`'conflict'`)/дубля (`'duplicate'`), не в мінус. Черга: `waitlist` якщо нема місць (`active>=capacity`) АБО черга вже є; інакше `enrolled`. `duration_min>=120` → `hours_attended=[1,2]`. Списання через auto_close. **Реанімація**: UNIQUE `(class_id, client_id)` → після self-відміни лишається рядок `cancelled`; `INSERT ... ON CONFLICT (class_id, client_id) DO UPDATE … WHERE status∈(cancelled,noshow)` оживляє його як нову заявку (скидає `sessions_used/sale_id/hours/cancellation`-поля) замість падіння на 23505. Дзеркало в `enrollClient()` (адмінка) |
| `get_session_balances_running(p_client_id, p_from)` | → `TABLE(enrollment_id, balance_after)`. SECURITY DEFINER (`search_path`), EXECUTE `authenticated`, client-гейт. Наростаючий залишок ПІСЛЯ кожного майбутнього запису по типах (window `SUM(cost) OVER PARTITION BY ticket_type ORDER BY starts_at`; cost=`COALESCE(array_length(hours_attended,1),1)`, is_cancelled→0). frontend `listMyRunningBalances()` |
| `get_session_balance_after(p_client_ids uuid[], p_ticket_type text, p_at timestamptz)` | → `TABLE(client_id, balance_after)`. SECURITY DEFINER, EXECUTE `authenticated`+`postgres`, client-гейт. Точковий залишок для масиву × 1 заняття (`ClassDetailModal`) |
| `get_session_debtors_for_date(p_date)` | → `TABLE(time_str, start_min, hall, trainer, short_label, clients jsonb)`. SECURITY DEFINER, EXECUTE `authenticated`+`postgres`. Агрегат боржників по сесіях на дату. frontend `listSessionDebtorsForDate()` |
| `class_availability(p_class_ids[])` | → `TABLE(class_id, active_count, waitlist_count, capacity)`. SECURITY DEFINER, лише числові агрегати (IDOR-безпечно). EXECUTE `authenticated`. frontend `getClassAvailability()`; дзеркало `goesToWaitlist()` |
| `client_cancel(p_enrollment_id)` | → `(success, charged, error_message)`. Self-відміна. Перевіряє «це мій запис», ставить `app.trusted_call='on'`, делегує в `change_enrollment_status('cancelled')`. `p_force_no_charge=false` зашито |
| `auto_close_classes()` | pg_cron щохвилини. «Почалось=проведено»: закриває `enrolled` для `starts_at<=now()` через `mark_attendance`→`attended`. Списує `COALESCE(array_length(hours_attended,1),1)` сесій (в мінус якщо нема). Непришедших адмін → `noshow`/`cancelled` вручну. Запис постфактум закривається одразу через `change_enrollment_status` (НЕ `mark_attendance` — EXECUTE лише `postgres`) |
| `log_enrollment_event()` | TRIGGER `trg_enrollment_event` AFTER INSERT OR UPDATE OF status ON `enrollments`. SECURITY DEFINER. Визначає актора (system якщо cron/`auth.uid()` NULL), власника заняття, suppress (власник у себе), пише рядок у `enrollment_events`. Тіло в `exception when others → warning` (НЕ валить грошовий шлях). Гард: UPDATE без зміни статусу → no-op |
| `render_enrollment_event_message(p_event_type, p_class_id, p_client_id, p_actor_role) → text` | SECURITY DEFINER STABLE. Українське повідомлення для Telegram, час `Europe/Kyiv`. Викликає тригер для notify-рядків |
| `dispatch_telegram_notifications()` | **Двофазна.** Фаза 1: шле до 50 недоставлених notify-рядків (`request_id is null`) через `net.http_post` (pg_net), пише `request_id`/`dispatched_at`, cap 5 спроб. Фаза 2: звіряє `net._http_response` по `request_id` → `delivered=true` лише при status 200 + `ok:true` (інакше скидає `request_id` на ретрай). Токен з `vault.decrypted_secrets('telegram_bot_token')`. chat_id `coalesce(снапшот, trainers.telegram_chat_id)`. SECURITY DEFINER, EXECUTE лише `postgres`. **Викликається двома шляхами:** (1) **миттєво** з `emit_enrollment_event` одразу після INSERT notify-рядка — доставка ~1–2с замість лагу до тіку крона; (2) pg_cron `dispatch-telegram` щохвилини — фолбек: фаза 2 (підтвердження) + ретраї невдалих. pg_net транзакційний → відкат RPC відкочує і запит (без фантомів). Токен — ручний крок: `vault.create_secret('<BOT_TOKEN>','telegram_bot_token')` |
