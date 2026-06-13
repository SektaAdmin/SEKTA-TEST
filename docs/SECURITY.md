# SECURITY — ролі, RLS, гранти, RPC-гейти (живий указівник)

> **Тонкий навігаційний документ.** Канон політик/грантів/ролей — тіла у міграціях
> (`supabase/migrations/*`, знімок прод) + `CLAUDE.md` §Залізні правила (інв. #9, #10) і §RPC.
> Історія переходу на ролі (фази 0–5, фактичний стан) — у [ROLES_PLAN.md](ROLES_PLAN.md).
> Будь-яка міграція, що змінює RLS/гранти/роль/гейт RPC → оновлює `CLAUDE.md` (інв. #9/§RPC) і цей
> документ у тому ж коміті (див. [CONTRIBUTING.md](CONTRIBUTING.md)).

## Модель ролей

Чотири ролі через `auth_role()` (з JWT `app_metadata.role`, дефолт `client`):

- **owner** — повний доступ скрізь.
- **admin** — owner мінус ЗП (`trainer_payments`/`trainer_rates` — owner-only) і редагування довідників
  (`halls`/`training_types`/`tickets` — admin лише SELECT).
- **trainer** — вузькі політики: пише `classes`/`enrollments` лише на свої заняття
  (`trainer_id = current_trainer_id()`); не бачить контактів/грошей.
- **client** — скрізь бачить лише `*_id = current_client_id()`.

Канон ролей у коді → `lib/auth/*`, `hooks/useRole.ts`, `middleware.ts` (розводить за роллю:
owner/admin → `/dashboard`, trainer → `/trainer`, client → `/client`). Не парсити `app_metadata.role` руками.

## RLS — інваріанти (канон: `CLAUDE.md` інв. #9)

- RLS **увімкнено на всіх таблицях**. Доступ — за роллю.
- Доменний id у політиках — через `current_client_id()`/`current_trainer_id()` (SECURITY DEFINER,
  читають `clients`/`trainers` в обхід RLS, інакше рекурсія).
- ⚠️ **RLS-on БЕЗ жодної політики = deny-all** (0 рядків без помилки). Чистка політик мусить лишати
  щонайменше owner-політику.
- Нова таблиця → `ENABLE ROW LEVEL SECURITY` + (`owner_all` або `owner_admin_all`) + потрібні
  trainer/client-політики + `GRANT SELECT,INSERT,UPDATE,DELETE … TO anon, authenticated`.
- `class_series` — RLS УВІМКНЕНО (`owner_admin_all`); INSERT/UPDATE/DELETE відкликано в `anon`
  (раніше anon мав повний DML при RLS-off — дірка закрита).

Повна матриця доступу по таблицях → [ROLES_PLAN.md](ROLES_PLAN.md) §Фаза 3 «Як зроблено».

## Гранти (інваріант)

- Нова таблиця → `GRANT … TO anon, authenticated` (інакше PostgREST не бачить).
- Грошові / привілейовані RPC — EXECUTE **не** для PUBLIC/anon (вектор ескалації).

## Привілейовані RPC і гейт `can_manage_enrollment()`

Шість enrollment-RPC — `SECURITY DEFINER`, оминають RLS:
`change_enrollment_status` · `mark_attendance` · `cancel_class_and_restore_sessions` ·
`reverse_attendance` · `delete_enrollment` · `delete_class`.

Гейт `can_manage_enrollment() → boolean` пропускає, якщо:
- owner/admin (staff-UI, роль `authenticated`); **АБО**
- session-флаг `app.trusted_call='on'` (довірений внутрішній виклик — `client_cancel` ставить його
  перед делегуванням у `change_enrollment_status`); **АБО**
- немає JWT І `current_user ∉ {anon, authenticated}` (cron під роллю `postgres`).

Інакше залогінений client/trainer і anon → відмова. **Завжди boolean** (COALESCE — інакше
`NOT NULL = NULL` обходить гейт). EXECUTE на ці RPC — лише `authenticated` + `postgres`.

`mark_attendance` — EXECUTE лише `postgres` (з PostgREST недоступна; UI завжди йде через
`change_enrollment_status`).

`update_training_type_sort_orders` — SECURITY DEFINER + внутрішній гейт `auth_role() IN ('owner','admin')`,
EXECUTE лише `authenticated`.

## Нові RPC — обов'язково

- `SET search_path = public, pg_temp` (інваріант #10 — інакше security advisor + вектор ескалації).
- Привілейований (DEFINER, оминає RLS) → внутрішній гейт ролі + REVOKE від PUBLIC/anon.

## Серверні Route Handlers зі service-role

Лише в `app/api/admin/**` (створення `auth.users` потребує `SUPABASE_SERVICE_ROLE_KEY`, який не світимо
в браузер). Гейтять `isStaff` через `getRole()`. Канон → `CLAUDE.md` §Карта коду «Серверні Route Handlers».

## Перевірка дрейфу безпеки

Періодична звірка docs ↔ реальні RLS/гранти/тіла RPC на проді → [DRIFT_CHECK_PROMPT.md](DRIFT_CHECK_PROMPT.md).
`mcp__supabase__get_advisors` (security) — швидкий сигнал про RLS-дірки.

## Відомі сигнали advisor (НЕ дірки — свідомо прийняті стани)

Security advisor підіймає наведене нижче. Це **очікувано** — не плутати з реальним дрейфом/дірою.
Перш ніж «виправляти» такий сигнал, звір із цим списком.

- **`anon`-доступ до `change_enrollment_status` / `restore_sessions_before_class_delete`
  (lint 0028)** — **хибне спрацювання**. Прямий `aclexplode` на цих функціях показує EXECUTE лише
  `authenticated`+`postgres` — **гранту `anon` немає**. Advisor флагає за PostgREST-евристикою
  (функція в exposed API-схемі). Навіть якби виклик дійшов — гейт `can_manage_enrollment()`
  відсікає не-staff. Не чіпати.

- **`session_balance_reconcile` — SECURITY DEFINER view (lint 0010, рівень ERROR)** — **by design**.
  Це детектор звірки залишку сесій (відповідь на аудит-знахідку про сесії без журналу). DEFINER
  обрано свідомо; advisor підіймає як ERROR — очікувано. Не переводити на INVOKER, не «чинити».

- **4 функції без `search_path` (lint 0011, WARN): `check_client_conflict`, `check_class_conflicts`,
  `generate_week`, `set_updated_at`** — **старе живе**. Інваріант #10 (`SET search_path`) діє на
  **нові** RPC; ці — старі / тригерні. Свідомо не чіпаємо (старе робоче легасі не переписуємо).
  Нові RPC мусять мати `search_path` — це не індульгенція для нового коду.

> Реєстр свідомо прийнятих сигналів. Новий ERROR/WARN, якого тут немає, — потенційна дірка:
> розбирати, а не ігнорувати.
