# SECURITY — ролі, RLS, гранти, RPC-гейти

Канон: тіла політик/грантів → `supabase/migrations/*` + `CLAUDE.md` інв. #9/#10, §RPC. Міграція, що змінює RLS/гранти/роль/гейт → оновлює `CLAUDE.md` + цей файл у тому ж коміті.

## Ролі (`auth_role()` з JWT `app_metadata.role`, дефолт `client`)
- **owner** — повний доступ.
- **admin** — owner мінус ЗП (`trainer_payments`/`trainer_rates` owner-only) і редагування довідників (`halls`/`training_types`/`tickets` — SELECT).
- **trainer** — пише `classes`/`enrollments` лише свої (`trainer_id = current_trainer_id()`); не бачить контактів/грошей.
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
Сім enrollment-RPC `SECURITY DEFINER` (оминають RLS): `change_enrollment_status` · `mark_attendance` · `cancel_class_and_restore_sessions` · `reverse_attendance` · `delete_enrollment` · `delete_class` · `restore_class`.

`can_manage_enrollment() → boolean` пропускає якщо: owner/admin; АБО `app.trusted_call='on'` (`client_cancel` ставить перед делегуванням); АБО немає JWT І `current_user ∉ {anon, authenticated}` (cron під `postgres`). Інакше відмова. Завжди boolean (COALESCE — інакше `NOT NULL = NULL` обходить). EXECUTE — `authenticated`+`postgres`; частина має PUBLIC grant (дефолт PostgREST), гейт відсікає.

- `mark_attendance` — EXECUTE лише `postgres` (UI завжди через `change_enrollment_status`).
- `update_training_type_sort_orders` — SECURITY DEFINER + гейт `auth_role() IN ('owner','admin')`, EXECUTE лише `authenticated`.

## Нові RPC
- `SET search_path = public, pg_temp` (інв. #10).
- Привілейований (DEFINER) → внутрішній гейт ролі + REVOKE від PUBLIC/anon.

## Route Handlers зі service-role
Лише в `app/api/admin/**` (`SUPABASE_SERVICE_ROLE_KEY` не світимо в браузер). Гейтять `isStaff` через `getRole()`. Канон → `CLAUDE.md` §Карта коду.

## Перевірка дрейфу
Звірка docs ↔ RLS/гранти/тіла RPC → `DRIFT_CHECK_PROMPT.md`. `mcp__supabase__get_advisors` (security) — сигнал про RLS-дірки.

## Свідомо прийняті сигнали advisor (НЕ дірки)
- **`anon`-доступ до `change_enrollment_status`/`restore_sessions_before_class_delete` (lint 0028)** — PUBLIC grant є (дефолт); гейт `can_manage_enrollment()` відсікає. REVOKE PUBLIC зламає routing.
- **`session_balance_reconcile` — SECURITY DEFINER view (lint 0010, ERROR)** — by design (детектор звірки). Не на INVOKER.
- **4 функції без `search_path` (lint 0011, WARN): `check_client_conflict`, `check_class_conflicts`, `generate_week`, `set_updated_at`** — легасі/тригерне. Інв. #10 діє лише на нові RPC.
- **`public_bucket_allows_listing` (WARN) — bucket `receipts`** — `receipts_public_select` дозволяє listing; назви містять receipt-UUID+client-id (info leak). Прийнято тимчасово; звузити до object-level SELECT.
- **`auth_leaked_password_protection` (WARN)** — HaveIBeenPwned вимкнено (генеровані паролі, не самореєстрація).

> Новий ERROR/WARN, якого тут немає, — потенційна дірка: розбирати, не ігнорувати.

---

## Залізні правила
9. RLS на всіх таблицях, доступ за роллю `auth_role()` (`owner`/`admin`/`trainer`/`client`, дефолт `client`). Доменний id через `current_client_id()`/`current_trainer_id()` (SECURITY DEFINER). Нова таблиця → `ENABLE ROW LEVEL SECURITY` + політика (`owner_all`/`owner_admin_all`) + trainer/client-політики + `GRANT … TO anon, authenticated`. RLS-on БЕЗ політики = deny-all.
10. Нові RPC — `SET search_path = public, pg_temp`.
