# FIX_INVENTORY.md — інвентаризація фіксів після adversarial-аудиту

**Дата складання:** 2026-06-13
**Метод:** читання реальних diff-ів міграцій + `git log` + звірка з `list_migrations` (всі застосовані на prod).

**Результат:** 10 знахідок → 10 закрито. Усі міграції пройшли до prod.

---

## ЕТАП 1+2 — Зведена таблиця

| # | Знахідка | Пріоритет | Коміт(и) | Міграція(ї) | Статус |
|---|---|---|---|---|---|
| #1 | IDOR NULL-bypass у `get_session_balance_after` | CRITICAL | `8eab975`, `6810f64` | `fix_idor_get_session_balance_after`, `fix_idor_null_bypass_gates` | ✅ Закрито (2 коміти, деталі нижче) |
| #2 | Salary 2 год vs 1 сесія | HIGH | `629aa93` | `fix_salary_v2_actual_sessions` | ✅ Закрито |
| #3 | Bulk-delete знищує сесії | HIGH | `ee1602f` | `fix_bulk_delete_classes_session_restore` | ✅ Закрито |
| #4 | Сесії без журналу — невідновлювані | MEDIUM | `070ae1d` | `fix_session_reconcile_view` | ✅ Часткова відповідь (reconcile-view; повний ledger — backlog) |
| #5 | balance integer vs numeric → округлення | MEDIUM | `8398d3e` | `fix_update_client_balance_integer_guard` | ✅ Закрито |
| #6 | Гонка вмісткості (паралельний enroll) | HIGH potential | `7a3255e` | `fix_client_enroll_advisory_lock` | ✅ Закрито |
| #7 | `restore_class` NULL-краш + брехливий count | MEDIUM potential | `36d1089` | `fix_restore_class_sessions_gate` | ✅ Закрито |
| #8 | `calc_trainer_salary` v1 ціле ділення / мертва | MEDIUM potential | `8398d3e` | `fix_update_client_balance_integer_guard` (включає DROP) | ✅ Закрито (DROP) |
| #9 | anon PUBLIC EXECUTE на всіх грошових RPC | LOW | `a1cf60c` | `fix_revoke_public_execute_rpc`, `fix_revoke_anon_execute_rpc` | ✅ Закрито |
| #10 | force_no_charge без аудит-сліду | LOW | `070ae1d` | `fix_force_no_charge_reason`, `drop_change_enrollment_status_old_overload` | ✅ Закрито |

**Поза планом:** немає. Всі коміти відповідають знахідкам із FIX_PLAN.md.

---

## ЕТАП 3 — Класифікація за ризиком

---

### #1 IDOR — `get_session_balance_after` + `get_session_balances_running`
**Коміти:** `8eab975` → перший патч; `6810f64` → другий патч (залишковий bypass)

**Що реально зроблено (перший коміт `8eab975`):**
- `REVOKE EXECUTE … FROM PUBLIC` на `get_session_balance_after`
- Переписано гейт: `array_length(NULL,1)` (повертає NULL) → `cardinality()` (повертає 0)
- Але: `p_client_ids[1] != current_client_id()` → залишилось `!=` (не `IS DISTINCT FROM`)

**Що зроблено у другому коміті `6810f64`:**
- `get_session_balance_after`: додано `current_client_id() IS NULL → RAISE` + замінено `!=` на `IS DISTINCT FROM` (закриває залишковий bypass)
- `get_session_balances_running`: аналогічно — `IS NULL` + `IS DISTINCT FROM`

**Класифікація:** СУЖЕННЯ. Обидва коміти лише ужесточили умову відмови. Нова логіка `fail-closed`:
- раніше: при NULL поверталось `false` → пропускало
- тепер: NULL → `RAISE EXCEPTION 'access denied'`
- EXECUTE-гранти не розширено

**Ризик:** низький. Легітимні виклики: staff (owner/admin/trainer) — `auth_role() <> 'client'` → проходять без гейта; зв'язаний клієнт — `current_client_id() IS NOT NULL` → проходить. Незв'язаний authenticated → тепер `access denied` (раніше теж мав відмову при коректному `p_client_id`).

**Потребує перевірки:** ClassDetailModal («баланс після заняття» для staff) і кабінет клієнта (running-баланс). Обидва шляхи не змінились по суті — тільки зміцнено гейт.

---

### #2 Salary — `calc_trainer_salary_v2`
**Коміт:** `629aa93`

**Що зроблено:**
- Тіло RPC: `rate * (c.duration_min::numeric/60)` → `rate * e.sessions_used` (для trainer_amount і studio_amount)
- `enrollClient` у `lib/queries/enrollments.ts`: додано `duration_min` до SELECT; якщо `duration_min >= 120` і hours не передано явно → `resolvedHours = [1,2]`

**Класифікація:** НОВЕ ПОВЕДІНКА (грошова формула).
- Формула ЗП змінилась: 2-год без `hours_attended` → більше не `rate×2`, а `rate×sessions_used` (яке через `auto_close` = 1 при `hours=NULL`). Після фіксу `enrollClient` нові записи матимуть `hours=[1,2]` → `sessions_used=2` → `rate×2`. Тобто для нових записів результат той самий. Але для вже-закрих з `sessions_used=1` перерахунок покаже `rate×1` замість `rate×2`.
- 7 уже-існуючих записів із `sessions_used=1` на 2-год: ЗП зменшилась на 7×rate. Якщо виплати ще не зроблені (на аудиті `trainer_payments=0`) — втрат немає.

**Ризик:** середній (грошовий). **Вимагає повторної перевірки:**
1. `/settings/salary/calculations` показує правильну суму на 2-год занятті
2. Зворотня сторона: `enrollClient` тепер завжди ставить `hours=[1,2]` для 2-год → `auto_close` спише 2 сесії. Якщо адмін хотів записати «клієнт лише на 1 годину» — нема UI-контролю (такий кейс раніше теж не підтримувався явно, але тепер сесій спишеться 2, а не 1).

---

### #3 Bulk-delete — BEFORE DELETE тригер + рефакторинг `delete_class`
**Коміт:** `ee1602f`

**Що зроблено:**
- Новий тригер `restore_sessions_on_class_delete` BEFORE DELETE FOR EACH ROW
- `delete_class` переписано: ручний реверс сесій **прибрано** (тепер через тригер); лишено гейт + `FOR UPDATE` + підрахунок `restored_count` до DELETE

**Класифікація:** НОВЕ ПОВЕДІНКА (тригер на `classes`).
- Раніше: `delete_class` сам повертав сесії; сирий DELETE — не повертав
- Тепер: будь-який DELETE (через RPC чи сирий) → тригер повертає сесії
- `delete_class` більше не робить реверс вручну → якщо тригер чомусь не спрацює (напр., `DISABLE TRIGGER`), сесії не повернуться (але раніше через сирий DELETE теж не поверталися)

**Ризик:** середній. Критична залежність: **тригер і видалення реверсу з `delete_class` — в одному коміті** (виконано, ризик подвійного повернення знятий). Але:
1. `restored_count` тепер рахується `COUNT(DISTINCT client_id) … WHERE sessions_used > 0` ДО DELETE — це правильно, але тепер це лише прогноз; тригер може повернути менше (якщо між SELECT і DELETE хтось змінить `sessions_used`). Практично нереально (FOR UPDATE блокує рядок класу).
2. Тригер — SECURITY DEFINER: правильно, інакше не може писати в `client_session_balances` (RLS там є).

**Потребує перевірки:** «виставити тиждень» поверх існуючого тижня з attended-записами → сесії повернулись; `delete_class` через UI → `restored_count` = реальна кількість.

---

### #4 Reconcile-view — `session_balance_reconcile`
**Коміт:** `070ae1d`

**Що зроблено:**
- `CREATE OR REPLACE VIEW public.session_balance_reconcile` — знаходить розбіжності між `client_session_balances` і `SUM(sales.sessions) − SUM(enrollments.sessions_used)`
- `REVOKE ALL FROM PUBLIC, anon; GRANT SELECT TO authenticated`

**Класифікація:** СУЖЕННЯ (нова VIEW з обмеженим доступом; нічого не пише).

**Ризик:** нульовий (лише читає). Але є нюанс логіки VIEW: очікуваний баланс вважається від покупок через `sales`. Для сідованих даних (купівель нема, залишки залиті напряму) `drift` завжди від'ємний — це очікувано, VIEW не хибно спрацює. Практично корисна лише після початку реальних продажів.

**Потребує перевірки:** `SELECT * FROM session_balance_reconcile` під owner → повертає рядки (або порожньо якщо 0 покупок з `ticket_id IS NOT NULL`).

---

### #5 Guard на дробове + DROP v1
**Коміт:** `8398d3e`

**Що зроблено:**
- `update_client_balance`: додано `IF p_amount <> floor(p_amount) THEN RETURN … error` — відхиляє не-цілі суми
- `DROP FUNCTION public.calc_trainer_salary(uuid, timestamptz, timestamptz)` (v1)

**Класифікація:**
- Guard — СУЖЕНИЕ (fail-closed: дробові суми тепер explicit error замість тихого округлення).
- DROP v1 — НОВЕ ПОВЕДІНКА (видалення функції).

**Ризик:**
- Guard: низький. Всі поточні виклики передають цілі суми (інваріант #6). Якщо десь дробове проскочить — тепер `success=false` + повідомлення замість тихого округлення.
- DROP v1: низький, якщо немає зовнішніх викликів. Перевірено на аудиті: 0 викликів у коді. Але: якщо є зовнішній скрипт (cron, дашборд) — зламається тихо.

**Потребує перевірки:** `/settings/salary/*` працює (v2); `create_sale`/`update_sale` з цілими сумами проходять.

---

### #6 Advisory lock у `client_enroll`
**Коміт:** `7a3255e`

**Що зроблено:**
- `PERFORM pg_advisory_xact_lock(('x' || left(md5(p_class_id::text), 16))::bit(64)::bigint)` на початку RPC перед підрахунком `active_cnt`

**Класифікація:** НОВЕ ПОВЕДІНКА (блокування).
- Додано неявне блокування per-class: паралельні записи на одне заняття тепер серіалізуються
- Блокування транзакційне (автоматично знімається при commit/rollback)

**Ризик:** низький–середній.
- Deadlock: `client_enroll` бере lock → потім `FOR UPDATE` на `enrollments` (через перевірку дубля). Але `client_cancel` або `change_enrollment_status` беруть `FOR UPDATE` на `enrollments` без advisory lock → різний порядок, теоретично deadlock. Postgres детектує deadlock і abort-ає одну транзакцію (не зависне), але клієнт отримає помилку замість чистого `success=false`.
- Завантаженість: advisory locks не блокують інші заняття (ключ — hash від `class_id`), тільки паралельні enroll на той самий клас.

**Потребує перевірки:** deadlock-сценарій: одночасний `client_enroll` і `change_enrollment_status` на одному класі.

---

### #7 `restore_class` — перероблено
**Коміт:** `36d1089`

**Що зроблено:**
- Додано гейт `can_manage_enrollment()`
- Замінено UPDATE зі скалярним RETURNING на `FOR r IN SELECT … LOOP` + INSERT в `client_session_balances` + UPDATE enrollments + `v_restored := v_restored + 1` (лічильник у циклі)
- `sessions_used` тепер: `CASE WHEN duration_min >= 120 AND hours_attended IS NOT NULL THEN COALESCE(array_length(hours_attended,1),1) ELSE 1 END`
- `EXCEPTION WHEN OTHERS`

**Класифікація:** НОВЕ ПОВЕДІНКА (повністю переписане тіло).

**Критичне спостереження — можлива логічна відмінність від плану:**
FIX_PLAN.md рекомендував: `COALESCE(array_length(hours_attended,1), CASE WHEN duration_min>=120 THEN 2 ELSE 1 END)` — тобто для 2-год **без** `hours_attended` → 2.
Реальна міграція: `CASE WHEN duration_min >= 120 AND hours_attended IS NOT NULL THEN COALESCE(array_length(...),1) ELSE 1 END` — тобто для 2-год **без** `hours_attended` → **1** (гілка ELSE).

⚠️ **Розбіжність з планом:** `restore_class` для 2-год без `hours_attended` списує назад **1** сесію, а не 2. Це узгоджено з `#2` (тренеру платимо за `sessions_used`=1), але якщо `cancel_class_and_restore_sessions` повертав 1 сесію — `restore_class` списує 1 назад. Тобто симетрія є. Але якщо `hours_attended=[1,2]` і поверталось 2, а `restore_class` для цього випадку повертає `COALESCE(array_length([1,2]),1)=2` — правильно. Проблема лише у гіпотетичному кейсі 2-год з `hours IS NULL` + `sessions_used=2` при скасуванні (такого зараз нема — `client_enroll` ставить `hours=[1,2]`, а старий `enrollClient` не ставив → `sessions_used=1` після `auto_close`).

**Ризик:** середній (переписана SECURITY DEFINER RPC). Потребує перевірки кейсу: скасувати заняття → відновити заняття → баланс повернувся до вихідного значення.

---

### #8 DROP `calc_trainer_salary` v1
**Включено в коміт `8398d3e` разом із #5.**
**Класифікація:** НОВЕ ПОВЕДІНКА (незворотне видалення).
**Ризик:** низький (0 внутрішніх викликів). Зовнішні — невідомо, але бізнес-контекст вказує на відсутність (все через UI → v2).

---

### #9 REVOKE PUBLIC/anon EXECUTE
**Коміт:** `a1cf60c` (два файли: `fix_revoke_public_execute_rpc` + `fix_revoke_anon_execute_rpc`)

**Що зроблено:**
- `REVOKE … FROM PUBLIC` на: `create_sale`, `update_sale`, `delete_sale`, `update_client_balance`, `generate_week`, `restore_class`, `auto_close_classes`, `calc_trainer_salary_v2`, `get_session_debtors_for_date`, `check_class_conflicts`, `check_client_conflict`, `cancellation_deadline`, `normalize_phone_ua`
- `REVOKE … FROM anon` на: `calc_trainer_salary`, `calc_trainer_salary_v2`, `cancellation_deadline`, `check_class_conflicts`, `check_client_conflict`, `generate_week`
- Явні GRANT для `authenticated` / `postgres`

**Класифікація:** СУЖЕНИЕ. Принцип найменших привілеїв; нічого нового не відкрито.

**Ризик:** низький. Єдиний ризик — якщо легітимний anon-флоу кличе ці RPC. Перевірено на аудиті: немає. Але `cancellation_deadline` використовується у клієнтському кабінеті (`lib/cancellation.ts`) — там клієнт **не робить** PostgREST-виклику до цієї RPC, функція реалізована на JS-стороні (TS-дзеркало). Ок.

**Потребує перевірки:** продаж / виставлення тижня / розрахунок ЗП під owner/admin.

---

### #10 force_no_charge аудит-слід (`change_enrollment_status`)
**Коміт:** `070ae1d` (два файли: `fix_force_no_charge_reason` + `drop_change_enrollment_status_old_overload`)

**Що зроблено:**
- `ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS staff_note text`
- `change_enrollment_status` переписано: новий параметр `p_staff_note text DEFAULT NULL`; при `force_no_charge=true` зберігає `staff_note` в рядок
- `DROP FUNCTION … change_enrollment_status(uuid,text,boolean,integer)` (стара 4-пар версія)

**Класифікація:** НОВЕ ПОВЕДІНКА (нова колонка + нова сигнатура RPC + DROP старої).

**Критичне спостереження — фронтенд-сумісність:**
`changeEnrollmentStatus()` у `lib/queries/enrollments.ts` — потрібно перевірити, чи він передає новий `p_staff_note` або просто використовує DEFAULT (= NULL). Якщо фронтенд викликає старий 4-параметровий overload — стара функція дропнута, виклик впаде.

**Ризик:** середній. DROP старого overload + нова колонка — потенційний регрес якщо фронтенд не оновлено. Перевірити.

---

## ВИВІД

### Закрито
| # | Закрито |
|---|---|
| #1 IDOR | ✅ (CRITICAL → закрито двома комітами) |
| #2 Salary | ✅ |
| #3 Bulk-delete | ✅ |
| #4 Reconcile | ✅ (часткова відповідь; повний ledger — backlog) |
| #5 Guard округлення | ✅ |
| #6 Race condition | ✅ |
| #7 restore_class | ✅ (з відхиленням від плану по 2-год без hours: 1 замість 2) |
| #8 DROP v1 | ✅ |
| #9 REVOKE PUBLIC | ✅ |
| #10 audit trail | ✅ |

### Що НЕ потребує повторної перевірки (чисті сужения)
- #1: обидва патчі — строго fail-closed, нових шляхів не відкрито
- #4: reconcile VIEW — read-only
- #5 guard: тільки відхиляє некоректне → існуючий код не зламає
- #9 REVOKE: звужує, не розширює

### Що ВИМАГАЄ повторної перевірки

| Фікс | Питання для перевірки |
|---|---|
| **#2 Salary** | 1. `/settings/salary/calculations` на 2-год занятті показує `sessions_used × rate`?<br>2. `enrollClient` (адмін) тепер завжди ставить `hours=[1,2]` для 2-год → `auto_close` спише 2 сесії. Якщо потрібен «1 годину з 2-год» — UI-контролю нема. |
| **#3 Bulk-delete (тригер)** | 1. «Виставити тиждень» поверх існуючого → сесії повернулись ×1 (не ×2)?<br>2. `delete_class` через UI → `restored_count` правильний? |
| **#6 Advisory lock** | 1. Deadlock-тест: `client_enroll` + `change_enrollment_status` одночасно на один клас. Postgres має детектувати і abort-ати одного з учасників (не зависнути). |
| **#7 restore_class** | 1. Скасувати заняття → відновити → баланс повернувся до вихідного ×1?<br>2. Для 2-год з `hours=[1,2]` `cancelled_from_status=attended` → відновлення списує 2 назад? |
| **#8 DROP v1** | Перевірити: немає зовнішніх дашбордів/cron що кличуть v1. |
| **#10 staff_note** | `changeEnrollmentStatus()` у фронтенді (`lib/queries/enrollments.ts`) — передає `p_staff_note` або DEFAULT? Якщо рядок переданий як 4-par → після DROP старого overload → помилка. **Перевірити найперше.** |

### Фікси без регресійної перевірки
Жоден з фіксів не має пов'язаних автоматичних тестів (тестового фреймворку немає — лише `npm run build`). Перевірка — ручна через UI або `SELECT` на prod. Для #3 (тригер навколо незворотного DELETE) і #10 (нова сигнатура RPC) регресійна перевірка особливо критична.

---

## Нотатки відновлення (що не покрито git-логом)

Всі фікси відображені в git-логу. `git log --stat -- supabase/migrations/` повністю відповідає списку `list_migrations`. Неcтиковок між локальними коментарями і prod-застосуванням немає. Прогалин у відновленні не виявлено.
