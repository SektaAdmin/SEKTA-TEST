# SESSION5_TARGETED.md — Цільова перевірка 4 фіксів

**Дата:** 2026-06-13  
**Метод:** читання тіл функцій/тригерів із `pg_proc` + `information_schema.triggers` + цільові SELECT на prod (тільки читання).

---

## #3 — BEFORE DELETE тригер + `delete_class` (commit ee1602f)

### Питання
Гарантовано чи спрацьовує тригер на всіх шляхах видалення? Чи є шлях обійти повернення сесій?

### Перевірка

**Тригер на prod:**
```
trigger_name: restore_sessions_on_class_delete
event:        DELETE
timing:       BEFORE
orientation:  FOR EACH ROW
function:     restore_sessions_before_class_delete (SECURITY DEFINER)
```

**Єдиний тригер на DELETE на таблиці `classes`** — жодних інших DELETE-тригерів немає (є лише `set_updated_at` на UPDATE).

**CASCADE:** `enrollments_class_id_fkey` → `ON DELETE CASCADE`. Порядок виконання Postgres:
1. BEFORE ROW DELETE тригер на `classes` спрацьовує → читає `enrollments` (вони ще існують) → повертає сесії.
2. `DELETE FROM classes` виконується.
3. CASCADE видаляє `enrollments`. 

→ Тригер завжди читає enrollments ДО їх CASCADE-видалення. Порядок правильний.

**`generate_week` поверх існуючого тижня:**  
`generate_week` робить `INSERT ... ON CONFLICT DO NOTHING` (UNIQUE `(series_id, date(starts_at))`). Вже існуючі заняття **не видаляються** — тригер не спрацьовує, сесії не чіпаються. Безпечно.

**Шлях обійти тригер:**  
Єдиний спосіб обійти тригер — `DISABLE TRIGGER` або `ALTER TABLE DISABLE TRIGGER`. Це потребує `SUPERUSER` або власника таблиці. PostgREST через `authenticated` роль не має такого права. Шлях недоступний для будь-якого UI-флоу.

**Якщо всередині тригера виникне помилка:**  
BEFORE DELETE тригер працює всередині тієї ж транзакції. Будь-який `EXCEPTION` у тригері автоматично робить `ROLLBACK` всієї транзакції — DELETE не пройде, сесії не будуть ані повернуті ані втрачені. Це безпечна поведінка (fail-closed).

**`delete_class` на prod (актуальне тіло):** прибрано ручний реверс, лишено гейт + FOR UPDATE + підрахунок → `DELETE`. Подвійного повернення немає.

### Висновок

**ПРОБЛЕМ НЕМАЄ.** Тригер покриває всі шляхи DELETE (одиночний, bulk, через RPC). `generate_week` не видаляє. Помилка в тригері = ROLLBACK. 

**Рейтинг:** ✅ Чисто.

---

## #7 — `restore_class` (commit 36d1089)

### Питання
Симетрія `cancel_class_and_restore_sessions` ↔ `restore_class`? Чи є шляхи де restore поверне більше/менше сесій ніж забрав cancel?

### Перевірка

**`cancel_class_and_restore_sessions` (актуальне тіло на prod):**
- Повертає `e.sessions_used` у баланс для `attended/noshow WHERE sessions_used > 0`.
- Зберігає `cancelled_from_status = status`, встановлює `sessions_used = 0`.

**`restore_class` (актуальне тіло на prod):**
- Обробляє лише `cancelled_from_status IN ('attended','noshow') AND cancellation_source = 'class_cancelled'`.
- Debits back: `CASE WHEN duration_min >= 120 AND hours_attended IS NOT NULL THEN COALESCE(array_length(hours_attended,1),1) ELSE 1 END`.
- Відновлює `sessions_used` тим самим значенням.

**Сценарії симетрії:**

| Сценарій | sessions_used при cancel | cancel повертає | hours_attended | restore дебетує | Симетрично? |
|---|---|---|---|---|---|
| 60-хв, hours=NULL, attended | 1 | 1 | NULL | 1 (ELSE 1) | ✅ |
| 120-хв, hours=[1,2], attended | 2 | 2 | [1,2] | array_length=2 | ✅ |
| 120-хв, hours=[1], attended | 1 | 1 | [1] | array_length=1 | ✅ |
| 120-хв, hours=NULL, attended | 1 (старий запис) | 1 | NULL | 1 (ELSE 1) | ✅ |
| 120-хв, hours=NULL, sessions_used=2 (гіпотетичний) | 2 | 2 | NULL | 1 (ELSE 1) | ❌ -1 |

**Гіпотетичний ❌ кейс:** `duration_min>=120, hours_attended=NULL, sessions_used=2`. Cancel поверне 2, restore спише 1 → залишиться +1 зайва сесія у клієнта назавжди.

**Чи можливий цей кейс на практиці?**  
`sessions_used` для attended/noshow виставляється через `auto_close → mark_attendance`:
```sql
sessions_used = COALESCE(array_length(hours_attended, 1), 1)
```
Для `hours_attended=NULL` → `sessions_used=1`. Тобто 2-год запис з `hours=NULL` отримає `sessions_used=1` від auto_close, а не 2. Значення `sessions_used=2` з `hours=NULL` неможливе через поточний код.

**Підтвердження на prod:**  
Всі `attended` на 2-год заняттях: `hours_attended=NULL, sessions_used=1` (7 записів). Жодного з `sessions_used=2` і `hours=NULL`.

**Prod-дані по скасованих заняттях (2 enrollments `class_cancelled`):**
```
duration_min=60, hours=NULL, sessions_used=0 (вже зануленo cancel)
restore_would_debit = 1 ← cancel також повертав 1. Симетрія ✅
```

### Висновок

**ПРОБЛЕМ НЕМАЄ** для всіх реальних та теоретично досяжних кейсів. Гіпотетична асиметрія при `sessions_used=2, hours=NULL` є логічно, але цей стан недосяжний через `mark_attendance` (auto_close). Відхилення від FIX_PLAN.md (`ELSE 1` замість `ELSE 2` для 2-год без hours) є **навмисним та правильним** — відповідає реальному `sessions_used=1` який cancel повертав.

**Рейтинг:** ✅ Чисто.

---

## #6 — Advisory lock у `client_enroll` (commit 7a3255e)

### Питання
Deadlock між `client_enroll` і `change_enrollment_status` на один клас? Чи звільняється lock на всіх шляхах?

### Перевірка

**Ключ блокування:**
```sql
('x' || left(md5(p_class_id::text), 16))::bit(64)::bigint
```
- Детерміністичний: один і той самий `class_id` → один і той самий bigint (підтверджено: `-3934587039931422528` ≡ `-3934587039931422528`).
- Різні `class_id` → різні ключі (підтверджено: два uuid → `-3934587039931422528` vs `-9082591804657318590`).
- Простір bigint (2^64) — колізія від md5-зрізу теоретично можлива (~1/2^32 для кожної пари), але з кількома десятками занять практично нульова.

**Звільнення lock:**  
`pg_advisory_xact_lock` — транзакційний: автоматично звільняється при `COMMIT` або `ROLLBACK`. Блок `EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT false, ...` завершує транзакцію чисто (виняток у plpgsql pisgql не є implicit rollback, але PostgREST загортає кожен RPC-виклик в транзакцію, тому при `EXCEPTION` транзакція відкочується → lock знімається). Шляху утримати lock після виходу функції немає.

**Deadlock-аналіз — порядок захоплення ресурсів:**

`client_enroll`:
1. `pg_advisory_xact_lock(class_hash)` — advisory lock
2. `SELECT classes WHERE id=...` — shared read, no row lock
3. `SELECT enrollments WHERE ...` — shared reads, no row lock
4. `INSERT enrollments (new row)` — lock on new row only

`change_enrollment_status`:
1. `SELECT enrollments FOR UPDATE` — exclusive row lock на ІСНУЮЧИЙ рядок enrollment
2. `SELECT classes WHERE id=...` — shared read, no row lock
3. `INSERT/UPDATE client_session_balances` — row lock
4. `UPDATE enrollments` — same row as step 1

**Перетин:** `client_enroll` захоплює advisory lock (per-class), потім вставляє НОВИЙ рядок enrollment. `change_enrollment_status` захоплює FOR UPDATE на ІСНУЮЧИЙ рядок enrollment (інший рядок). Вони **ніколи не конкурують за один і той самий ресурс в протилежному порядку**. Deadlock неможливий у цій парі.

**Єдиний сценарій queue-like blocking:** два одночасних `client_enroll` на той самий клас → другий чекає на advisory lock першого. Postgres чекає (не кидає exception) — `lock_timeout = 0` (без таймауту). Після завершення першого другий входить і коректно оцінює лічильники. Точно той ефект, для якого lock додано.

**Чи потрібно ловити помилку lock і повертати `success=false`?**  
При `lock_timeout=0` `pg_advisory_xact_lock` ніколи не кидає exception — він лише блокує. Raw exception від lock неможливий у поточній конфігурації. Якби встановили `lock_timeout`, тоді варто було б ловити `lock_not_available (55P03)` і повертати чистий `success=false`. Зараз — не потрібно.

### Висновок

**ПРОБЛЕМ НЕМАЄ.** Deadlock між `client_enroll` і `change_enrollment_status` неможливий (різні ресурси, різний порядок). Lock коректно звільняється на всіх шляхах. При `lock_timeout=0` raw exception від lock виключений.

**Рекомендація (не баг):** якщо в майбутньому встановлять `lock_timeout` на рівні сесії або оточення, варто додати `EXCEPTION WHEN lock_not_available THEN RETURN QUERY SELECT false, NULL, NULL, 'Спробуйте ще раз'::text`. Зараз — не критично.

**Рейтинг:** ✅ Чисто (з превентивною нотаткою щодо lock_timeout).

---

## #2 — `calc_trainer_salary_v2` + `enrollClient` hours=[1,2] (commit 629aa93)

### Питання
Зарплата сходиться? Немає подвійного списання?

### Перевірка

**Нова формула на prod:** `rate × e.sessions_used` (підтверджено з `pg_proc`).

**SELECT-порівняння старої і нової логіки на prod-даних:**
```
trainer_id: 29c3dd7f (один тренер з 2-год заняттями)
enrollment_count: 7 (всі attended, duration_min=120, hours_attended=NULL, sessions_used=1)

old_total (rate × duration_min/60 = rate × 2): 1260 ₴
new_total (rate × sessions_used = rate × 1):    630 ₴
diff: 630 ₴
```

Rate = 1260/7/2 = **90 ₴/год**. 7 × 90 × 2 = 1260 (стара), 7 × 90 × 1 = 630 (нова).

**Причина розриву:** всі 7 старих attended записів мають `hours_attended=NULL` — вони були створені до фіксу `enrollClient`. `auto_close` списав по 1 сесії (`COALESCE(NULL, 1) = 1`). Нова формула (`rate × sessions_used`) коректно відображає факт: тренеру платимо за те, скільки реально списали клієнту. 630 ₴ — правильна сума за фактично надані/оплачені клієнтами людино-години.

**Виплати:** `trainer_payments` = 0 записів. Виплат не було — розрив 630 ₴ не викликав фінансових втрат.

### ⚠️ АКТИВНА ПРОБЛЕМА — 31 enrolled без hours_attended на майбутніх 2-год заняттях

На prod є **31 enrolled-запис** на 2-год заняттях **без `hours_attended`**, які ще не відбулися:

```
2026-06-14 10:00 Kyiv  trainer_184f  5 клієнтів
2026-06-14 14:00 Kyiv  trainer_222e  7 клієнтів
2026-06-17 16:00 Kyiv  trainer_29c3  7 клієнтів
2026-06-21 10:00 Kyiv  trainer_184f  5 клієнтів
2026-06-21 14:00 Kyiv  trainer_222e  7 клієнтів
```

**Що відбудеться при `auto_close`:** `mark_attendance` виконає `sessions_used = COALESCE(array_length(NULL,1), 1) = 1`. Клієнт заплатить **1 сесію** за 2-год заняття, тренер отримає **rate×1** замість **rate×2**.

**Фікс `enrollClient` (JS) ставить `hours=[1,2]` для нових записів через UI.** Але ці 31 записи вже існують — вони були створені ДО фіксу або через generate_week (series_clients → enrollments без hours_attended через `INSERT INTO enrollments ... SELECT ... FROM series_clients`).

**Дивись також:** `generate_week` прокидує `sc.hours_attended` з `series_clients`:
```sql
INSERT INTO enrollments (class_id, client_id, status, sessions_used, hours_attended)
SELECT v_class_id, sc.client_id, 'enrolled', 0, sc.hours_attended
FROM series_clients sc WHERE sc.series_id = v_series.id
```
Якщо `series_clients.hours_attended` = NULL — запис iде без hours. Це джерело 31 проблемного запису.

**Фінансовий вплив (приблизний):** 31 клієнт × 1 недосписана сесія = 31 сесія. Також тренери отримають rate×1 замість rate×2 за ці записи.

### Висновок

**#2 Salary formula:** ✅ Правильна. `rate × sessions_used` точніше відповідає бізнес-інваріанту. Різниця 630 ₴ по старим записам — коректна (тренеру платили б за сесії, яких реально не списали клієнтам).

**⚠️ ВІДКРИТА ПРОБЛЕМА — средня серйозність:**  
31 existing `enrolled` записів на майбутніх 2-год заняттях без `hours_attended`. При auto_close → 1 сесія замість 2. Клієнти недоплатять, тренери недоотримають.

**Як чинити:**
```sql
-- Backfill: проставити hours_attended=[1,2] для enrolled на майбутніх 2-год заняттях
-- де hours_attended IS NULL і заняття ще не почалось
UPDATE public.enrollments e
SET hours_attended = ARRAY[1, 2], updated_at = now()
FROM public.classes c
WHERE e.class_id = c.id
  AND c.duration_min >= 120
  AND c.starts_at > now()
  AND e.status IN ('enrolled', 'waitlist')
  AND e.hours_attended IS NULL;
-- Зачіпає: 31 enrolled + 0 waitlist = 31 рядків.
-- Безпечно: sessions_used залишаються 0 (ще не списані).
-- Підтвердити кількість перед виконанням.
```

Також: `generate_week` прокидує `sc.hours_attended` з `series_clients`. Якщо постійники завжди беруть 2-год цілком — варто проставити `hours_attended=[1,2]` у `series_clients` для 2-год серій.

**Рейтинг:** ⚠️ Є відкрита проблема (не регресія фіксу, а недоробка backfill + generate_week).

---

## Зведена таблиця

| Фікс | Статус | Серйозність | Дія |
|---|---|---|---|
| **#3 Bulk-delete тригер** | ✅ Чисто | — | Нічого |
| **#7 restore_class симетрія** | ✅ Чисто | — | Нічого |
| **#6 Advisory lock** | ✅ Чисто | — | Нічого (нотатка: lock_timeout у майбутньому) |
| **#2 Salary formula** | ⚠️ Відкрита проблема | MEDIUM | Backfill 31 enrolled + перевір series_clients |

---

## Рекомендовані дії

### Негайно (до наступного auto_close — найближче заняття 2026-06-14)

1. **Backfill 31 enrolled без hours_attended:**
   ```sql
   -- Спочатку перевір кількість:
   SELECT COUNT(*) FROM public.enrollments e
   JOIN public.classes c ON c.id = e.class_id
   WHERE c.duration_min >= 120 AND c.starts_at > now()
     AND e.status IN ('enrolled', 'waitlist') AND e.hours_attended IS NULL;
   -- Очікується: 31
   
   -- Потім UPDATE (з підтвердженням):
   UPDATE public.enrollments e
   SET hours_attended = ARRAY[1, 2], updated_at = now()
   FROM public.classes c
   WHERE e.class_id = c.id
     AND c.duration_min >= 120 AND c.starts_at > now()
     AND e.status IN ('enrolled', 'waitlist') AND e.hours_attended IS NULL;
   ```

2. **Перевір series_clients для 2-год шаблонів:**
   ```sql
   SELECT sc.id, sc.series_id, cs.duration_min, sc.hours_attended
   FROM series_clients sc
   JOIN class_series cs ON cs.id = sc.series_id
   WHERE cs.duration_min >= 120 AND sc.hours_attended IS NULL;
   ```
   Якщо є NULL — UPDATE їх на `ARRAY[1,2]`, інакше generate_week знову прокине NULL.

### Не термінові

3. **#6 lock_timeout:** якщо в майбутньому встановлять `lock_timeout` для Supabase проекту — додати `EXCEPTION WHEN lock_not_available` у `client_enroll`.
