# SECURITY — ролі, RLS, гранти, RPC-гейти

Канон: тіла політик/грантів → `supabase/migrations/*`; залізні правила #9/#10 — внизу цього файлу; сигнатури RPC → [DATABASE.md](DATABASE.md) §RPC. Міграція, що змінює RLS/гранти/роль/гейт → оновлює цей файл у тому ж коміті.

## Ролі (`auth_role()` з JWT `app_metadata.role`, дефолт `client`)
- **owner** — повний доступ.
- **admin** — owner мінус ЗП (`trainer_payments`/`trainer_rates` owner-only) і редагування довідників (`halls`/`training_types`/`tickets` — SELECT).
- **trainer** — пише `classes`/`enrollments` лише свої (`trainer_id = current_trainer_id()`); не бачить контактів/чужих грошей; SELECT свої `trainer_payments`/`trainer_rates` (своя ЗП, `trainer_select_own`).
- **client** — бачить лише `*_id = current_client_id()`.

Код: `lib/auth/*`, `hooks/useRole.ts`, `middleware.ts` (owner/admin→`/dashboard`, trainer→`/trainer`, client→`/client`). Не парсити `app_metadata.role` руками.

## RLS (інв. #9)
- Увімкнено на всіх таблицях. Доступ за роллю.
- Доменний id у політиках — `current_client_id()`/`current_trainer_id()` (SECURITY DEFINER, в обхід RLS).
- RLS-on БЕЗ політики = deny-all. Чистка політик лишає щонайменше owner-політику.
- Нова таблиця → `ENABLE ROW LEVEL SECURITY` + (`owner_all` або `owner_admin_all`) + trainer/client-політики + `GRANT SELECT,INSERT,UPDATE,DELETE … TO anon, authenticated`.
- `class_series` — RLS УВІМКНЕНО (`owner_admin_all`); DML відкликано в `anon`.
- Матриця → `ROLES_PLAN.md` §Фаза 3.

## Гранти
- Нова таблиця → `GRANT … TO anon, authenticated` (інакше PostgREST не бачить).
- Грошові/привілейовані RPC — EXECUTE не для PUBLIC/anon.

## Гейт `can_manage_enrollment()`
Сім enrollment-RPC `SECURITY DEFINER` (оминають RLS): `change_enrollment_status` · `mark_attendance` · `cancel_class_and_restore_sessions` · `reverse_attendance` · `delete_enrollment` · `delete_class` · `restore_class`. Гейти: `can_manage_class(p_class_id)` (class-RPC) і `can_manage_class_enrollment(p_enrollment_id)` (enrollment-RPC) — обидва = `can_manage_enrollment()` АБО тренер-власник; мапа по RPC → [DATABASE.md](DATABASE.md) §RPC.

`can_manage_enrollment() → boolean` пропускає якщо: owner/admin; АБО `app.trusted_call='on'` (`client_cancel` ставить перед делегуванням); АБО немає JWT І `current_user ∉ {anon, authenticated}` (cron під `postgres`). Інакше відмова. Завжди boolean (COALESCE — інакше `NOT NULL = NULL` обходить). EXECUTE цих RPC — лише `authenticated`+`postgres` (без anon/PUBLIC); видимі `authenticated` через PostgREST (advisor 0029), гейт відсікає.

- `mark_attendance` — EXECUTE лише `postgres` (UI завжди через `change_enrollment_status`).
- `update_training_type_sort_orders` — SECURITY DEFINER + гейт `auth_role() IN ('owner','admin')`, EXECUTE лише `authenticated`.

## Нові RPC
- `SET search_path = public, pg_temp` (інв. #10).
- Привілейований (DEFINER) → внутрішній гейт ролі + REVOKE від PUBLIC/anon.

## Route Handlers зі service-role
`SUPABASE_SERVICE_ROLE_KEY` не світимо в браузер; service-role лише в `app/api/admin/**` (гейт ролі через `getRole()`) та `app/api/telegram/**`. Механіка → [ARCHITECTURE.md](ARCHITECTURE.md) §Route Handlers.
- `create-trainer-login` / `create-client-login` — гейт `isStaff` (owner/admin).
- `telegram/webhook` — гейт secret-header `x-telegram-bot-api-secret-token` (задається в setWebhook, без збігу 401); пише `trainers.telegram_chat_id` + ротує `telegram_link_token`. `telegram/disconnect` — гейт «залогінений власник картки тренера» (auth-user→`trainers.user_id`); зануляє chat_id + ротує токен.
- `create-client` — гейт `owner/admin/trainer`. Тренер за RLS не має доступу до `client_contacts` і не може INSERT-ити `clients` напряму; цей ендпоінт під service-role робить дедуп (телефон сирий+нормалізований, ім'я+прізвище) і запис у `clients`+`client_contacts`. Контакти лише надходять — назад тренеру НЕ повертаються (інваріант «тренер не бачить контактів» лишається). Екран — `/trainer/clients` (список ім'я+баланс із `clients` по `trainer_select` RLS, без контактів).

## Перевірка дрейфу
Звірка docs ↔ RLS/гранти/тіла RPC → `npm run sync:docs` (`scripts/sync-docs.prompt.md`). `mcp__supabase__get_advisors` (security) — сигнал про RLS-дірки.

## Свідомо прийняті сигнали advisor (НЕ дірки)
- **`anon`-доступ до `restore_sessions_before_class_delete` (lint 0028, WARN)** — тригерна DEFINER-функція з PUBLIC grant (дефолт); викликати напряму безглуздо (тільки BEFORE DELETE), DML по `classes` під RLS. REVOKE PUBLIC ризикує зламати routing.
- **`authenticated`-доступ до DEFINER-RPC (lint 0029, WARN)** — усі привілейовані/клієнтські RPC видно `authenticated` через PostgREST (`change_enrollment_status`, `cancel_class_and_restore_sessions`, `reverse_attendance`, `delete_enrollment`, `delete_class`, `restore_class`, `update_training_type_sort_orders`, `client_enroll`, `client_cancel`, `class_availability`, `get_session_*`, `accounting_balance`/`accounting_feed_page`/`sales_feed_page`, `current_client_id`/`current_trainer_id`). Захист — внутрішній гейт (`can_manage_enrollment()` / `auth_role()` / self-перевірка), не відсутність EXECUTE. REVOKE зламає routing.
- **`session_balance_reconcile` — SECURITY DEFINER view (lint 0010, ERROR)** — by design (детектор звірки). Не на INVOKER.
- **4 функції без `search_path` (lint 0011, WARN): `check_client_conflict`, `check_class_conflicts`, `generate_week`, `set_updated_at`** — легасі/тригерне. Інв. #10 діє лише на нові RPC.
- **`extension_in_public` (lint 0014, WARN) — `pg_trgm`, `pg_net`** — trigram-пошук і HTTP Telegram-диспатчера; розширення в `public`. Прийнято (переносити схему ризиковано без потреби).
- **`public_bucket_allows_listing` (WARN) — bucket `receipts`** — `receipts_public_select` дозволяє listing; назви містять receipt-UUID+client-id (info leak). Прийнято тимчасово; звузити до object-level SELECT.
- **`auth_leaked_password_protection` (WARN)** — HaveIBeenPwned вимкнено (генеровані паролі, не самореєстрація).

## Відкриті сигнали advisor (НЕ прийнято — розібрати)
- **`render_enrollment_event_message(…, p_enrollment_id)` — anon може виконати DEFINER-функцію (lint 0028, WARN)**: 5-арг overload має PUBLIC EXECUTE → незалогінений рендерить текст з іменем клієнта/часом заняття по довільних uuid (info-leak). Фікс: REVOKE від PUBLIC/anon/`authenticated`, лишити `postgres` (кличе лише `emit_enrollment_event`); легасі 4-арг overload — DROP.

> Новий ERROR/WARN, якого тут немає, — потенційна дірка: розбирати, не ігнорувати.

---

## Залізні правила
9. RLS на всіх таблицях, доступ за роллю `auth_role()` (`owner`/`admin`/`trainer`/`client`, дефолт `client`). Доменний id через `current_client_id()`/`current_trainer_id()` (SECURITY DEFINER). Нова таблиця → `ENABLE ROW LEVEL SECURITY` + політика (`owner_all`/`owner_admin_all`) + trainer/client-політики + `GRANT … TO anon, authenticated`. RLS-on БЕЗ політики = deny-all.
10. Нові RPC — `SET search_path = public, pg_temp`.
