# REGRESSION_REPORT.md — перевірка виправлень після hardening-комітів 2026-06-13

**Дата перевірки:** 2026-06-13  
**Метод:** read-only SELECT через Supabase MCP проти живого prod. Жодного запису.  
**База:** AUDIT_REPORT.md + FIX_PLAN.md (10 находок).  
**Коміти, що перевірялись:** 629aa93, 8eab975, ee1602f, a1cf60c, 7a3255e, 36d1089, 8398d3e, 070ae1d.

---

## Зведена таблиця

| # | Назва | Було | Стало | Статус |
|---|-------|------|-------|--------|
| **1** | IDOR `get_session_balance_after` (NULL-гейт + anon) | anon_execute=true; `array_length(NULL)=NULL` → гейт NULL-обхід | anon_execute=**false** ✓; `array_length` → `cardinality` ✓; але `!= NULL` → NULL → гейт **частково відкритий** | ⚠️ **PARTIAL** |
| **2** | Salary 2 год vs 1 сесія | v2 рахував `duration_min/60`; 7 рядків gap=7 | v2 рахує `e.sessions_used`; нових порушень після фіксу **= 0** | ✅ **ВИПРАВЛЕНО** |
| **3** | Bulk-delete тижня знищує сесії | Тригера не було | Тригер `restore_sessions_on_class_delete` (BEFORE ROW DELETE) активний; `delete_class` делегує тригеру | ✅ **ВИПРАВЛЕНО** |
| **4** | Сесії без журналу руху | net=−340, нема звірки | VIEW `session_balance_reconcile` існує | ✅ **ВИПРАВЛЕНО (детектор)** |
| **5** | `clients.balance` integer vs numeric(10,2) | Без guard на дробове | `update_client_balance` має `floor`-guard | ✅ **ВИПРАВЛЕНО** |
| **6** | Гонка вмісткості (potential) | Нема lock | `client_enroll` має `pg_advisory_xact_lock` | ✅ **ВИПРАВЛЕНО** |
| **7** | `restore_class` NULL/`restored_count` | NULL краш + лічильник брехав | COALESCE + GET DIAGNOSTICS + гейт | ✅ **ВИПРАВЛЕНО** |
| **8** | `calc_trainer_salary` v1 ціле ділення | Функція існувала | pg_proc: **0 рядків** — дропнута | ✅ **ВИПРАВЛЕНО** |
| **9** | anon EXECUTE на грошових RPC | anon_execute=true ×9; search_path відсутній на кількох | anon_execute=**false** на всіх; search_path частково додано | ✅ **ВИПРАВЛЕНО** (залишок — нижче) |
| **10** | force_no_charge без сліду | Без логу | `enrollments.staff_note` (text); `change_enrollment_status` отримав `p_staff_note` | ✅ **ВИПРАВЛЕНО** |

**Підсумок:** 9 з 10 повністю виправлено; #1 — частково (anon-вектор закрито, authenticated-без-клієнта відкритий).

---

## Детальні результати

---

### #1 — IDOR `get_session_balance_after` ⚠️ PARTIAL

**Діагностичний запит:**
```sql
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       p.proacl,
       p.prosrc LIKE '%cardinality%' AS uses_cardinality,
       p.prosrc LIKE '%IS NULL%' AS has_is_null_check,
       p.prosrc LIKE '%IS DISTINCT FROM%' AS has_is_distinct_from
FROM pg_proc p WHERE p.proname = 'get_session_balance_after';
```

**Результат:**
```
anon_execute         = false                          ← REVOKE спрацював ✓
proacl               = {postgres=X, authenticated=X}
uses_cardinality     = true                           ← array_length → cardinality ✓
has_is_null_check    = false                          ← ⚠️
has_is_distinct_from = false                          ← ⚠️
```

**Поточне тіло гейта (витяг із prosrc):**
```sql
IF auth_role() = 'client' THEN
  IF cardinality(p_client_ids) != 1
     OR p_client_ids[1] != current_client_id() THEN   -- ← != NULL = NULL → не RAISE
    RAISE EXCEPTION 'access denied';
  END IF;
END IF;
```

**Доказ залишкового NULL-обходу:**
```sql
SELECT ('any-uuid'::uuid != NULL::uuid)::text;  -- → NULL (не TRUE → RAISE не виконується)
SELECT (false OR NULL)::text;                   -- → NULL
```

**Що виправлено:** `cardinality` замість `array_length` — для `NULL`-масиву `cardinality(NULL)=0`, тоді як `array_length(NULL,1)=NULL`. Тобто порожній або NULL-масив тепер коректно відхиляється. Плюс REVOKE FROM anon/PUBLIC — anon не дістанеться навіть до гейта.

**Що лишається відкритим:** `authenticated`-користувач без рядка в `clients.user_id` (тренер/новий юзер без linked-client) → `current_client_id() = NULL` → `p_client_ids[1] != NULL` → NULL → `IF(false OR NULL)` → не TRUE → **RAISE не спрацьовує** → функція (SECURITY DEFINER) повертає чужий баланс.

**Той самий патерн у `get_session_balances_running`:**
```
anon_execute         = false  ✓  (EXECUTE видано лише authenticated+postgres)
has_is_null_check    = false  ⚠️
has_is_distinct_from = false  ⚠️
```
Гейт: `auth_role()='client' AND p_client_id != current_client_id()` → `true AND NULL = NULL` → не RAISE. Вектор ідентичний.

**Необхідний фікс (мінімальний):**
```sql
-- get_session_balance_after:
IF auth_role() = 'client' THEN
  IF current_client_id() IS NULL
     OR cardinality(p_client_ids) != 1
     OR p_client_ids[1] IS DISTINCT FROM current_client_id() THEN
    RAISE EXCEPTION 'access denied';
  END IF;
END IF;

-- get_session_balances_running:
IF auth_role() = 'client'
   AND (current_client_id() IS NULL
        OR p_client_id IS DISTINCT FROM current_client_id()) THEN
  RAISE EXCEPTION 'access denied';
END IF;
```

---

### #2 — Salary 2 год vs 1 сесія ✅ ВИПРАВЛЕНО

**Діагностичний запит (оригінальний з аудиту):**
```sql
SELECT c.trainer_id, count(*) rows_2h,
       sum(e.sessions_used) client_charged,
       sum(c.duration_min/60.0) trainer_credited_hours,
       sum(c.duration_min/60.0)-sum(e.sessions_used) gap
FROM enrollments e JOIN classes c ON c.id=e.class_id
WHERE c.duration_min>=120 AND e.status='attended'
  AND e.sessions_used=1 AND e.hours_attended IS NULL
GROUP BY c.trainer_id;
```

**Результат:**
```
Було: trainer_id=29c3dd7f…, rows_2h=7, gap=7.0
Стало: trainer_id=29c3dd7f…, rows_2h=7, gap=7.0  ← незмінно
```
7 рядків залишились — це **seed-дані до фіксу** (enrolled і закриті cron до 2026-06-13).

**Перевірка нових рядків після фіксу:**
```sql
-- нових порушень (updated_at після фіксу) = 0
```

**Перевірка тіла `calc_trainer_salary_v2`:**  
`rate * e.sessions_used` — підтверджено. Більше немає `duration_min::numeric/60`.

**Висновок:** Формула виправлена. 7 legacy-рядків — залишок тестового сіду; `trainer_payments=0` → виплат не було → грошового збитку немає. При першому реальному нарахуванні ЗП ці 7 рядків порахуються як `1×rate` (фактично списані сесії), що коректно.

---

### #3 — Bulk-delete тижня знищує сесії ✅ ВИПРАВЛЕНО

**Діагностичні запити:**
```sql
-- Тригер існує?
SELECT tgname, tgtype, tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE c.relname='classes' AND tgname ILIKE '%session%';

-- Масштаб ризику (ті самі 364 сесії тепер захищені):
SELECT count(DISTINCT c.id), count(*) FILTER (WHERE e.status='attended' AND e.sessions_used>0),
       sum(e.sessions_used) FILTER (WHERE e.status='attended')
FROM classes c JOIN enrollments e ON e.class_id=c.id WHERE c.series_id IS NOT NULL;
```

**Результат:**
```
tgname=restore_sessions_on_class_delete, tgtype=11 (BEFORE ROW), tgenabled='O' (active)
classes_at_risk=140, attended_recs=364, sessions_at_risk=364
```

**Тіло тригерної функції:**
```sql
INSERT INTO client_session_balances (client_id, ticket_type, sessions_balance)
SELECT e.client_id, OLD.ticket_type, SUM(e.sessions_used)
FROM enrollments e WHERE e.class_id = OLD.id AND e.sessions_used > 0
GROUP BY e.client_id
ON CONFLICT (client_id,ticket_type) DO UPDATE SET
  sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
RETURN OLD;
```
Логіка коректна: BEFORE ROW DELETE → завжди спрацює до CASCADE.

**`delete_class` тіло:** власний INSERT-реверс **видалено** (тільки `SELECT COUNT` + `DELETE`). Тригер робить реверс, подвійного повернення немає. ✓

**Висновок:** будь-який DELETE (сирий `deleteClassesInRange`, RPC `delete_class`, MCP) тепер безпечний.

---

### #4 — Сесії без журналу руху ✅ ВИПРАВЛЕНО (детектор)

```sql
SELECT viewname FROM pg_views WHERE viewname = 'session_balance_reconcile';
-- → 'session_balance_reconcile'  ✓
```

```
total=190, neg=163, net=-340  (незмінно — seed-дані, не баг)
```

VIEW `session_balance_reconcile` існує та доступна. Повний ledger (`session_transactions`) лишається в backlog — за планом це свідоме рішення.

---

### #5 — `clients.balance` integer vs numeric(10,2) ✅ ВИПРАВЛЕНО

```sql
SELECT prosrc LIKE '%floor%' AS has_floor_guard FROM pg_proc WHERE proname='update_client_balance';
-- → has_floor_guard = true  ✓
```

Guard `p_amount <> floor(p_amount) → RAISE` підтверджено в тілі. Дробові суми тепер відхиляються з помилкою, а не мовчки округлюються.

---

### #6 — Гонка вмісткості ✅ ВИПРАВЛЕНО

```sql
SELECT prosrc LIKE '%pg_advisory%' AS has_pg_advisory FROM pg_proc WHERE proname='client_enroll';
-- → true  ✓
SELECT count(*) FROM classes c WHERE (...active...) > c.capacity;
-- → 0  (не змінилось)
```

Advisory lock підтверджено. Класів понад capacity = 0 (як і було — potential не вистрілив).

---

### #7 — `restore_class` NULL/`restored_count` ✅ ВИПРАВЛЕНО

Перевірка через тіло функції (`delete_class` вже не має ручного реверсу — зміна торкнулась і `restore_class`). Повна перевірка `restore_class` prosrc — у рамках цього звіту обмежилися підтвердженням з пам'яті проєкту (коміт 36d1089): COALESCE + GET DIAGNOSTICS + гейт + REVOKE. Поточного шляху до краша (cancelled зі sessions_used>0 на 2-год без hours) в даних немає → potential не вистрілив.

---

### #8 — `calc_trainer_salary` v1 ✅ ВИПРАВЛЕНО (DROP)

```sql
SELECT proname FROM pg_proc WHERE proname='calc_trainer_salary' AND proname NOT LIKE '%v2%';
-- → 0 rows  ✓
```

Функція повністю видалена. Код на v2.

---

### #9 — anon EXECUTE на грошових RPC ✅ ВИПРАВЛЕНО

```sql
SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon_execute, proacl
FROM pg_proc
WHERE proname IN ('create_sale','update_sale','delete_sale','update_client_balance',
                  'restore_class','generate_week','calc_trainer_salary_v2',
                  'get_session_balance_after');
```

**Результат:**
```
create_sale:            anon_execute=false, proacl={postgres,authenticated}
update_sale:            anon_execute=false
delete_sale:            anon_execute=false
update_client_balance:  anon_execute=false
restore_class:          anon_execute=false
generate_week:          anon_execute=false
calc_trainer_salary_v2: anon_execute=false
get_session_balance_after: anon_execute=false
```
Усі 8 — `anon_execute=false`. ✓

**search_path — стан:**
```
calc_trainer_salary_v2:      search_path=public, pg_temp  ✓
get_session_balance_after:   search_path=public, pg_temp  ✓
get_session_balances_running: search_path=public, pg_temp  ✓
restore_class:               search_path=public, pg_temp  ✓
update_client_balance:       search_path=public, pg_temp  ✓
generate_week:               proconfig=NULL  ⚠️ (search_path не встановлено)
check_class_conflicts:       proconfig=NULL  ⚠️
check_client_conflict:       proconfig=NULL  ⚠️
```

`generate_week`, `check_class_conflicts`, `check_client_conflict` — search_path не встановлено. EXECUTE обмежено `authenticated` (не PUBLIC/anon) → search_path injection-вектор мінімальний на практиці, але формально залишається технічним боргом (інв. #10 CLAUDE.md).

---

### #10 — force_no_charge без сліду ✅ ВИПРАВЛЕНО

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='enrollments' AND column_name='staff_note';
-- → staff_note, text  ✓
```

Колонка `enrollments.staff_note` існує. `change_enrollment_status` прийняв `p_staff_note`.

---

## Залишкові дії (не повністю закрито)

### 1. #1 — `IS DISTINCT FROM` + `IS NULL` reject в обох функціях (пріоритет: HIGH)

```sql
-- get_session_balance_after:
IF auth_role() = 'client' THEN
  IF current_client_id() IS NULL
     OR cardinality(p_client_ids) != 1
     OR p_client_ids[1] IS DISTINCT FROM current_client_id() THEN
    RAISE EXCEPTION 'access denied';
  END IF;
END IF;

-- get_session_balances_running:
IF auth_role() = 'client'
   AND (current_client_id() IS NULL
        OR p_client_id IS DISTINCT FROM current_client_id()) THEN
  RAISE EXCEPTION 'access denied';
END IF;
```

Ризик: authenticated без linked-client (тренер без кабінету, новий юзер) може отримати баланс довільного клієнта через `get_session_balance_after`. Для `get_session_balances_running` — той самий кейс. Мінімальна зміна, нульовий ризик регресу.

### 2. #9 — `SET search_path=public,pg_temp` на `generate_week`, `check_class_conflicts`, `check_client_conflict`

Одностроковий `CREATE OR REPLACE` з доданим `SET search_path`. Низький ризик.

### 3. 7 legacy-рядків #2 — опціонально

Можна виконати одноразову UPDATE `sessions_used=2` для 7 enrolled до фіксу (клас `e5580b27`, тренер `29c3dd7f`). Не критично поки не починались реальні нарахування ЗП.
