# AUDIT_REPORT.md — adversarial-аудит БД та фінансової логіки SEKTA CRM

**Дата:** 2026-06-13
**Метод:** read-only. Прочитано міграції/снапшот + слой доступу (`lib/queries/*`). Усі перевірки на живій prod-БД — лише `SELECT` + `SET LOCAL ROLE … ; … ; ROLLBACK` (жодного запису не закомічено). Рольовий доступ перевірявся імперсонацією `anon`/`authenticated` через `SET LOCAL ROLE` + `request.jwt.claims`.

> ⚠️ **Важливо про стан даних.** prod зараз наповнений **частково/тестово**: 1575 clients, 792 enrollments, 306 classes, **але 1 sale, 0 balance_transactions, 0 studio_expenses, 0 trainer_payments** і при цьому **190 client_session_balances**. Тобто залишки сесій були **залиті імпортом напряму**, а не через `create_sale`. Через це грошова вісь (sales/expenses/salary у гривнях) **порожня** — там, де дані відсутні, доказ будується на тілі функції + умовах, які вже існують у даних. Де розходження вже матеріальне — воно в розділі «Підтверджено на проді».

---

## 0. Інвентар

**Прочитані файли**
- `supabase/migrations/20260613000001_snapshot_prod_2026_06_13.sql` (канонічний снапшот: 16 таблиць, ~30 функцій, тригери, RLS, GRANT, 3 view).
- Решта міграцій (історія) — звірено з тілами у снапшоті.
- Слой доступу: `lib/supabase.ts`, `lib/queries/{enrollments,classes,sales,studio-expenses,trainer-rates,client-cabinet-data,…}.ts`.

**Таблиці:** balance_transactions, class_series, classes, client_contacts, **client_session_balances**, clients, enrollments, halls, sales, series_clients, studio_expenses, tickets, trainer_payments, trainer_rates, trainers, training_types.

**Ключові RPC:** `create_sale`, `update_sale`, `delete_sale`, `update_client_balance`, `mark_attendance`, `change_enrollment_status`, `reverse_attendance`, `cancel_class_and_restore_sessions`, `delete_class`, `delete_enrollment`, `restore_class`, `client_enroll`, `client_cancel`, `generate_week`, `auto_close_classes`, `calc_trainer_salary` (v1/v2), `get_session_balance_after`, `get_session_balances_running`, `get_session_debtors_for_date`, `can_manage_enrollment`, `auth_role`, `current_client_id/current_trainer_id`.

**Політики:** усі `TO authenticated` (анонімних/PUBLIC-політик немає — перевірено). RLS enabled на всіх 16 таблицях, **`relforcerowsecurity=false`** (owner оминає, але PostgREST ходить як anon/authenticated → під RLS).

**Виконані діагностичні SELECT-и (головні):**
1. Підрахунок рядків усіх таблиць.
2. Реконструкція очікуваного залишку сесій з рухів (`sales.sessions − enrollments.sessions_used`) vs знімок `client_session_balances` → 0 розбіжностей (тривіально, бо покупок майже нема).
3. Від'ємні залишки сесій: **163 рядки, найгірший −7, сума −364**.
4. Класи понад capacity зараз → **0** (гонка ще не «вистрілила»).
5. 120-хв `attended` з `sessions_used=1` і `hours_attended IS NULL` → **7 рядків**.
6. Розподіл тривалостей: тільки {60, 120} (немає 90 → інт-ділення v1 поки не ріже).
7. IDOR `get_session_balance_after` як `anon` і як `authenticated`-без-клієнта → **витік підтверджено**.
8. Спроба запису як `anon` через `create_sale`, raw INSERT у `classes`, `generate_week` → **RLS блокує** (`permission denied` / `violates row-level security`).
9. Тип колонок: `clients.balance` = **integer**, `balance_transactions.amount/before/after` = **numeric(10,2)**.
10. Зона salary: trainer credited **14 год** vs client charged **7 сесій** на тих 7 заняттях.
11. Ризик bulk-delete: **140 series-класів, 364 attended-записи, 364 сесії**, які зникнуть без повернення.

---

# ПІДТВЕРДЖЕНО НА ПРОДІ
*(SELECT знайшов реальне розходження / реальну вразливість прямо зараз)*

---

## 🔴 CRITICAL #1 — IDOR: будь-хто (навіть анонім) читає залишок сесій будь-якого клієнта
**`get_session_balance_after()`** — `SECURITY DEFINER`, `GRANT EXECUTE … TO anon`.
Файл: снапшот рядки **1200–1213**.

```sql
IF auth_role() = 'client' THEN
  IF array_length(p_client_ids, 1) != 1
     OR p_client_ids[1] != current_client_id() THEN     -- ← current_client_id() = NULL для анона/незв'язаного
    RAISE EXCEPTION 'access denied';
  END IF;
END IF;
```

**Корінь:** для `anon` (і для будь-якого `authenticated` юзера без рядка в `clients.user_id`) `auth_role()` дефолтиться у `'client'`, а `current_client_id()` повертає `NULL`. Порівняння `p_client_ids[1] != NULL` → **`NULL`**, отже `IF (… OR NULL)` → не TRUE → **`RAISE` не виконується**. `SECURITY DEFINER` оминає RLS → функція повертає чужий залишок.

**Сценарій:** зловмисник без логіну (anon-ключ із бандла фронту — публічний) шле PostgREST `POST /rest/v1/rpc/get_session_balance_after` з масивом будь-яких `client_id` (UUID можна збирати з інших ендпойнтів/реальних посилань) → отримує залишок сесій по типу.

**Що «бреше»:** приватні дані клієнта віддаються неавторизованому. Не «бреше» цифра, а **витікає** (порушення конфіденційності, потенційно весь список через перебір UUID масивом).

**Доказ (жива БД):**
```sql
SET LOCAL ROLE anon;  -- без JWT
SELECT public.get_session_balance_after(
  ARRAY['65f3a737-e6ff-409b-a30d-31065b76a322']::uuid[], 'group', now());
-- → (65f3a737-…, -7)   ❗ повернув чужий баланс
```
І як `authenticated` без зв'язаного клієнта (`sub` випадковий):
```sql
SET LOCAL request.jwt.claims = '{"sub":"00000000-…","role":"authenticated"}';
SELECT * FROM public.get_session_balance_after(ARRAY['65f3a737-…']::uuid[],'group',now());
-- → {client_id:65f3a737-…, balance_after:-7}   ❗
```
*Контроль:* `get_session_balances_running` (той самий патерн гейта, але `current_client_id()` ≠ NULL для зв'язаного клієнта) для **зв'язаного** клієнта проти чужого id **коректно** кинув `access denied`. Тобто проблема саме у NULL-обході, коли `current_client_id()` = NULL.

**Серйозність: CRITICAL** (неавторизований доступ до даних клієнтів, через публічний anon-ключ).

**Як чинити:** зробити гейт NULL-safe і не пускати анонімів зовсім.
```sql
-- у get_session_balance_after (і дзеркально в усіх client-гейтах):
IF auth_role() <> 'client' THEN
  -- staff (owner/admin/trainer) — ок
  NULL;
ELSE
  IF current_client_id() IS NULL                       -- анонім/незв'язаний → відмова
     OR array_length(p_client_ids,1) IS DISTINCT FROM 1
     OR p_client_ids[1] IS DISTINCT FROM current_client_id() THEN
    RAISE EXCEPTION 'access denied';
  END IF;
END IF;
```
Плюс **`REVOKE EXECUTE ON FUNCTION public.get_session_balance_after(...) FROM anon;`** (немає сценарію, де анонім легітимно це викликає).
Той самий NULL-патерн перевірити в `get_session_balances_running` (там гейт `auth_role()='client' AND p_client_id != current_client_id()` — для анона `AND` дає NULL → не RAISE; врятовано лише тим, що EXECUTE не видано anon, але **authenticated-без-клієнта все одно прослизне** — теж полагодити `IS DISTINCT FROM` + явний `current_client_id() IS NULL` reject).

---

## 🔴 HIGH #2 — Salary бреше на двогодинних заняттях: тренеру платять 2 год, клієнт платить 1 сесію
**`auto_close_classes` + `calc_trainer_salary_v2`** розходяться на класах `duration_min>=120`, де `hours_attended IS NULL`.
Файли: `auto_close` рядки **372–375**; v2 — рядки **434, 445** (`* (c.duration_min::numeric/60)`).

**Корінь:** `auto_close` списує `COALESCE(array_length(hours_attended,1),1)` → для `NULL` це **1**. А `calc_trainer_salary_v2` рахує тренеру `rate * duration_min/60` → для 120 хв це **2 год**. `client_enroll` для 2-год ставить `hours_attended=[1,2]` (→2), **але адмінський `enrollClient` (`lib/queries/enrollments.ts:200`) вставляє без hours**, і будь-який запис, закритий cron при `hours_attended IS NULL`, лишає списання = 1.

**Що бреше:** ЗП-розрахунок (`/settings/salary/calculations`) показує тренеру оплату за 2 год/заняття, тоді як студія списала з клієнтів лише 1 сесію/заняття. На кожному такому занятті студія платить за «зайву» годину, якої клієнт не оплатив.

**Доказ (жива БД):**
```sql
SELECT c.trainer_id, count(*) rows_2h,
       sum(e.sessions_used) client_charged,            -- 7
       sum(c.duration_min/60.0) trainer_credited_hours, -- 14
       sum(c.duration_min/60.0)-sum(e.sessions_used) gap -- 7
FROM enrollments e JOIN classes c ON c.id=e.class_id
WHERE c.duration_min>=120 AND e.status='attended' AND e.sessions_used=1 AND e.hours_attended IS NULL
GROUP BY c.trainer_id;
-- → trainer 29c3dd7f…: rows_2h=7, client_charged=7, trainer_credited_hours=14, gap=7
```
7 «безкоштовних» для клієнтів годин уже нараховуються тренеру до оплати. Усі 7 — на одному занятті `e5580b27` (group, 120 хв).

**Серйозність: HIGH** (пряме грошове розходження ЗП↔каса; масштабується з кожним 2-год заняттям).

**Як чинити (вибрати інваріант і тримати з обох боків):**
- Узгодити одиницю: або `auto_close`/`mark_attendance` для `duration_min>=120` списує **2** навіть при `hours_attended IS NULL` (зробити hours обов'язковими для 2-год через `BEFORE INSERT` тригер на enrollments, що проставляє `[1,2]` коли `duration>=120 AND hours_attended IS NULL`), або v2 рахує тренеру за **фактично списані сесії** (`e.sessions_used`), а не за `duration_min/60`.
- Рекомендація: тренеру платити за **`e.sessions_used`** (єдине джерело правди = фактичне списання), тоді зайвих годин не буде:
```sql
-- у calc_trainer_salary_v2: множник = фактичні сесії, а не години заняття
SELECT tr.trainer_rate * e.sessions_used  -- замість * (c.duration_min/60)
```
  (узгодити з бізнес-домовленістю про оплату noshow, де sessions_used=0 — там окрема гілка).

---

## 🔴 HIGH #3 — Bulk-delete тижня знищує оплачені сесії без повернення (admin)
**`deleteClassesInRange()`** — `lib/queries/classes.ts:349-362` — робить **сирий `DELETE FROM classes`** в обхід RPC `delete_class`.

```ts
await supabase.from('classes').delete()
  .in('series_id', seriesIds).gte('starts_at', fromISO).lt('starts_at', toISO)
```

**Корінь:** `enrollments.class_id` має `ON DELETE CASCADE`. Видалення класу зносить усі його enrollments. RPC `delete_class` перед видаленням **повертає `sessions_used` у `client_session_balances`** (снапшот 1012–1025). Цей же шлях у коді (кнопка «виставити тиждень» → спершу очищає діапазон) **сесій не повертає** — вони просто зникають разом із записами.

**Що бреше:** після перевиставлення тижня залишки сесій клієнтів стають завищеними відносно реальності (з них зникло списання за attended-заняття) — або, якщо дивитись з боку «оплачено vs проведено», студія втрачає слід проведених занять. Журналу немає (сесії взагалі не журналяться), тож відновити неможливо.

**Доказ (жива БД) — масштаб ризику зараз:**
```sql
SELECT count(DISTINCT c.id) classes_at_risk,                                  -- 140
       count(*) FILTER (WHERE e.status='attended' AND e.sessions_used>0) recs, -- 364
       COALESCE(sum(e.sessions_used) FILTER (WHERE e.status='attended'),0) sess -- 364
FROM classes c JOIN enrollments e ON e.class_id=c.id
WHERE c.series_id IS NOT NULL;
-- → 140 класів, 364 attended-записи, 364 сесії під загрозою тихого знищення
```
Один клік «виставити тиждень» поверх існуючого тижня → −364 сесії з історії без жодного сліду.

**Серйозність: HIGH** (незворотна втрата фінансово значущих даних одним адмінським кліком; не атака, а пастка-фоторушниця).

**Як чинити:**
- Видаляти серієві класи **тільки** через `delete_class` (поштучно або новий bulk-RPC, що повертає сесії), або
- Перед `DELETE` пройтись `delete_class(id)` по кожному, або
- На рівні БД зробити `ON DELETE` тригер на `classes`, що повертає `sessions_used` у `client_session_balances` (тоді будь-який шлях видалення безпечний). Це найнадійніше — закриває і цей код, і майбутні.
```sql
CREATE FUNCTION restore_sessions_before_class_delete() RETURNS trigger AS $$
BEGIN
  INSERT INTO client_session_balances (client_id, ticket_type, sessions_balance)
  SELECT e.client_id, OLD.ticket_type, SUM(e.sessions_used)
  FROM enrollments e WHERE e.class_id = OLD.id AND e.sessions_used>0
  GROUP BY e.client_id
  ON CONFLICT (client_id,ticket_type)
  DO UPDATE SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_restore_sessions BEFORE DELETE ON classes
  FOR EACH ROW EXECUTE FUNCTION restore_sessions_before_class_delete();
-- тоді delete_class можна спростити (тригер зробить роботу), а сирий DELETE стане безпечним.
```

---

## 🟠 MEDIUM #4 — Залишок сесій — це знімок без журналу; нічого не змушує його сходитись з рухами
**Архітектурний.** `client_session_balances` пишеться **прямими** `INSERT … ON CONFLICT DO UPDATE` з ~8 функцій (`create_sale`, `update_sale`, `delete_sale`, `mark_attendance`, `change_enrollment_status`, `reverse_attendance`, `cancel_class_and_restore_sessions`, `delete_class`, `delete_enrollment`, `restore_class`). **Окремого журналу руху сесій немає** (на відміну від грошей, де є `balance_transactions`). Отже залишок сесій неможливо перерахувати/звірити — він і є єдина істина, і будь-який пропущений реверс осідає назавжди.

**Доказ (жива БД):** знімок зараз показує **net −340 сесій** при **24 куплених і 364 спожитих** — тобто 163 клієнти «в мінусі» по сесіях, бо записи/відвідування заливались без покупок. Це легітимно для тестового сіду, **але демонструє суть**: система спокійно тримає від'ємні залишки і не має чим їх пояснити (немає рядків руху). У бойових даних будь-який баг реверсу (див. #2, #3, #6) так само осяде непомітно.
```sql
SELECT count(*) total, count(*) FILTER (WHERE sessions_balance<0) neg,
       sum(sessions_balance) net FROM client_session_balances;
-- → total=190, neg=163, net=-340
```

**Серйозність: MEDIUM** (не миттєвий збиток, але це причина, чому всі «session»-баги непомітні й невідновлювані).

**Як чинити:** завести `session_transactions` (client_id, ticket_type, delta, reason, related_enrollment_id, related_sale_id, created_at), писати в нього з тих самих RPC у тій же транзакції, а `client_session_balances` зробити похідним (тригер-сума або періодична звірка `SUM(delta) == sessions_balance`). Мінімум — нічна звірка-алерт.

---

## 🟠 MEDIUM #5 — `clients.balance` (integer) vs `balance_transactions` (numeric 10,2): тихе округлення = розсинхрон ledger↔знімок
Файли: типи колонок (information_schema), `update_client_balance` рядок **1788, 1798**.

**Корінь:** `update_client_balance(p_amount numeric)` робить `UPDATE clients SET balance = balance + p_amount`, де `balance` — **integer**. Postgres робить assignment-cast `numeric→integer` із **округленням half-up**. У журнал пишеться точний `numeric(10,2)` (`balance_before/after`, `amount`), а в `clients.balance` — округлений integer. Жоден constraint не звіряє суму журналу з `clients.balance`.

**Доказ (жива БД) — округлення реальне:**
```sql
SELECT (100 + 0.5)::integer half, (100+0.4)::integer down, (100+0.6)::integer up;
-- → 101, 100, 101   (half-up; 0.5 → +1)
-- типи: clients.balance=integer(scale 0); balance_transactions.amount/before/after=numeric(10,2)
```
Наразі всі суми цілі (інваріант #6 «гроші — integer ₴»), тож розходження ще нема (0 транзакцій). **Але схема дозволяє** дробову `amount` (precision 10,2), і перший же дробовий рух (напр., якщо колись з'явиться знижка/перерахунок) дасть `clients.balance` ≠ `SUM(balance_transactions.amount)` назавжди.

Додатково: **`check_balance_consistency` — тавтологічний** (снапшот 247): обидві гілки `OR` = `balance_after = balance_before + amount`; розбивка за знаком `amount` нічого не додає, і він **не перевіряє** зв'язок із `clients.balance`.

**Серйозність: MEDIUM** (латентно; стає реальним з першою дробовою сумою або зміною типу).

**Як чинити:** або `clients.balance` → `numeric(10,2)` (узгодити з кодом, що ділить/не ділить на 100 — інваріант #6), або заборонити дробові на вході RPC (`IF p_amount <> round(p_amount) THEN RAISE`). І замінити тавтологічний CHECK на корисний (він і так лише дублює внутрішню арифметику рядка — справжню звірку робити окремим job-ом `SUM(amount) == clients.balance`).

---

# ПОТЕНЦІЙНО
*(дыра в логіці доведена з коду/ізоляції, але у поточних даних ще не «вистрілила»)*

---

## 🟠 HIGH (potential) #6 — Гонка вмісткості: два паралельні записи перевищують capacity
**`client_enroll`** (снапшот 856–884) і адмінський **`enrollClient`** (`enrollments.ts:200`). Єдиний захист — тригер `check_class_capacity`.

**Механіка (доведено):**
- `default_transaction_isolation = read committed` (перевірено).
- `check_class_capacity` рахує `COUNT(*) … WHERE status IN('enrolled','attended') AND id != NEW.id` — **лише закомічені** рядки.
- На enrollments **немає** EXCLUDE/агрегатного обмеження на `class_id` (є лише UNIQUE `(class_id, client_id)` — рятує від дубля одного клієнта, **не** від двох різних).
- Два паралельні enroll на клас із 1 вільним місцем: обидві транзакції читають `active = capacity−1 < capacity`, обидві вставляють `enrolled`, жодна не бачить незакомічений рядок іншої → **обидві комітяться → capacity+1**.

**Доказ умов (жива БД):** ізоляція read committed; відсутність обмеження (`pg_constraint` показав лише pkey/unique(class_id,client_id)/checks); і вже є **класи рівно на межі** `active=10, capacity=10`, з людьми в резерві позаду:
```sql
-- багато класів active=10/capacity=10 (+ waitlist) → один паралельний дубль на 9/10 і буде 11/10
```
Перевірка «зараз понад capacity» → **0** (ще не сталось). Тому **Potential**, не Confirmed.

**Серйозність: HIGH (potential)** — перевищення вмісткості залу/класу під час пікового запису (промо, відкриття слотів).

**Як чинити:** серіалізувати запис на клас. Найпростіше — **advisory lock на `class_id`** на час перевірки+вставки в `client_enroll`/`enrollClient`:
```sql
PERFORM pg_advisory_xact_lock(hashtextextended(p_class_id::text, 0));
-- далі рахунок active і вставка — конкуренти чекають
```
Або матеріалізувати лічильник із перевіркою через constraint, або `SELECT … FOR UPDATE` на рядку `classes` перед підрахунком (тригер усе одно лишити запобіжником). Адмінський `enrollClient` теж має проходити через захищений шлях (зараз він обходить навіть конфлікт/баланс-перевірки — лише тригер capacity).

---

## 🟡 MEDIUM (potential) #7 — `restore_class` дає NULL `sessions_used` на 2-год без hours → або падає, або недорахунок `restored_count`
**`restore_class`** снапшот 1618–1625.

```sql
UPDATE enrollments SET status='attended', sessions_used =
  CASE WHEN duration_min>=120 THEN array_length(hours_attended,1) ELSE 1 END
WHERE class_id=p_class_id AND status='cancelled' AND sessions_used>0
RETURNING 1 INTO v_count;
```

Два дефекти:
1. **NULL-краш:** для 2-год заняття з `hours_attended IS NULL` → `array_length(NULL,1) = NULL` → `sessions_used = NULL` порушує `enrollments_sessions_used_check (>=0)`/NOT NULL → виняток. Функція **не має** EXCEPTION-handler → весь `restore_class` падає сирою помилкою. Дані для цього вже існують (7 рядків 2-год з `hours_attended IS NULL`), хоч поточний шлях cancel ставить `sessions_used=0` і фільтр `>0` їх не ловить — тому **Potential** (тригериться, якщо enrollment скасований іншим шляхом зі збереженим `sessions_used>0`).
2. **`RETURNING 1 INTO v_count`** при multi-row UPDATE кладе у скаляр лише **останній** рядок → `restored_count` завжди ≤1, бреше адміну про к-сть відновлених.

**Серйозність: MEDIUM (potential).**

**Як чинити:** `sessions_used = COALESCE(array_length(hours_attended,1), CASE WHEN duration_min>=120 THEN 2 ELSE 1 END)`; рахувати через `GET DIAGNOSTICS v_count = ROW_COUNT;`; обгорнути в EXCEPTION як інші RPC. (Узгодити з фіксом #2 — джерело істини для 2-год.)

---

## 🟡 MEDIUM (potential) #8 — `calc_trainer_salary` (v1): ціле ділення `duration_min/60` ріже noshow-години
**v1** снапшот 396: `WHEN e.status='noshow' THEN c.duration_min / 60` — обидва integer → **зрізає** (90 хв → 1, 30 хв → 0). v2 рахує numeric (`duration_min::numeric/60`), v1 — ні.

**Зараз не ріже:** тривалості тільки {60,120} (перевірено: `classes_with_fractional_hours=0`). Тому **Potential**. Як тільки з'явиться 90-хв клас із noshow — тренеру недорахують години. Невідомо, чи v1 ще використовується (UI на v2), але функція жива й видана anon/authenticated.

**Як чинити:** `c.duration_min::numeric/60` (як у v2), або викинути v1, якщо мертва. Узгодити noshow-логіку з #2.

---

## 🟡 LOW (potential) #9 — `anon` має повний DML-GRANT на всі таблиці (захист тримає лише RLS)
Снапшот 2037–2072: `GRANT SELECT,INSERT,UPDATE,DELETE … TO anon` на `clients`, `balance_transactions`, `client_session_balances`, `sales`, `enrollments`, `trainer_payments`, `trainer_rates` тощо.

**Перевірено — наразі не експлуатується:** анонімних/PUBLIC-політик немає, RLS enabled → для anon усі політики дають deny-all. Емпірично:
```sql
SET LOCAL ROLE anon;
SELECT * FROM create_sale(…);          -- → success=false, "permission denied for table sales"
INSERT INTO classes(…) RETURNING id;    -- → ERROR: new row violates row-level security policy
```
Тобто **RLS реально блокує запис anon** (двічі підтверджено). Грошові INVOKER-RPC (`create_sale/update_sale/delete_sale/update_client_balance/generate_week/restore_class`), хоч і видані anon, не пишуть — бо їхні внутрішні INSERT/UPDATE йдуть від імені anon і падають на RLS.

**Чому все одно LOW, а не «ок»:** це порушення принципу найменших привілеїв і defense-in-depth. Один помилковий permissive-policy у майбутньому (напр. тимчасовий `TO public` для дебагу) миттєво відкриє anon на запис грошей. Плюс `generate_week` (INVOKER, **без `SET search_path`** — єдина така) видана anon — search_path-вектор.

**Як чинити:** `REVOKE INSERT,UPDATE,DELETE ON <усі доменні таблиці> FROM anon;` (лишити лише там, де реально треба, — ніде). Додати `SET search_path = public, pg_temp` у `generate_week`, `calc_trainer_salary*`, `check_*` (інв. #10). `REVOKE … FROM anon` на `generate_week`, `create_sale`, `update_sale`, `delete_sale`, `update_client_balance`, `restore_class` (анонім їх не викликає легітимно).

---

## 🟡 LOW (potential) #10 — Скасування «заднім числом» через `change_enrollment_status` (admin) обходить дедлайн
`change_enrollment_status` рахує штраф від `cancellation_deadline(v_class.starts_at)` і приймає `p_force_no_charge`. Адмін свідомо може скасувати без штрафу (`forceNoCharge`) навіть пізно — це **за дизайном** (інв. описує `p_force_no_charge`). Ризик не технічний, а організаційний: будь-який admin може «пробачити» списання без сліду причини (поле `reason` для сесій відсутнє — журналу сесій немає, див. #4). Клієнтський `client_cancel` зашиває `force_no_charge=false` — тут обходу немає (перевірено в тілі).

**Серйозність: LOW.** **Як чинити:** якщо потрібен контроль — логувати `force_no_charge`-скасування у журнал сесій (#4) з `reason` й автором.

---

## ✅ Перевірено й виявилось НЕ вразливим (щоб не шукати вдруге)
- **Прямий запис у БД поза `lib/queries`** — немає (grep чистий; усі `.from()/.rpc()` лише в queries-шарі / Route Handlers).
- **`anon` запис у таблиці** — RLS блокує (двічі емпірично).
- **Trainer бачить усіх клієнтів і всі `client_session_balances`** (1575/190), але **не** бачить `sales`/`balance_transactions` (1/0) — **за документованим дизайном** (CLAUDE.md §RLS). Не витік грошей; широта доступу до списку клієнтів — свідома.
- **`get_session_balances_running`** для **зв'язаного** клієнта проти чужого id — коректно `access denied` (NULL-обхід б'є лише при `current_client_id()=NULL`, але EXECUTE anon не видано; authenticated-без-клієнта все одно треба полагодити — врахо в #1).
- **`mark_attendance` / `change_enrollment_status`→attended** — ідемпотентні щодо повторного списання: `mark_attendance` відсікає `status='attended'`; `change_enrollment_status` робить no-op при `v_enrollment.status = p_new_status`. Подвійного списання простим повтором немає.
- **`studio_expenses`** прямі insert/update/delete — без побічних ефектів на баланси; звіт = сума рядків, редагування коректно змінює суму. Чисто.
- **`enrollments (class_id,client_id)` UNIQUE** — блокує дубль того самого клієнта (підтверджено в `pg_constraint`).

---

## Зведена таблиця

| # | Назва | Вісь | Серйозність | Стан |
|---|-------|------|-------------|------|
| 1 | IDOR `get_session_balance_after` (NULL-обхід гейта, anon) | цілісність доступу | **CRITICAL** | ✅ Підтверджено |
| 2 | Salary 2 год vs 1 сесія на 2-год заняттях | гроші (атомарність моделі) | **HIGH** | ✅ Підтверджено (7 год розриву) |
| 3 | Bulk-delete тижня знищує сесії без повернення | цілісність (atomicity) | **HIGH** | ✅ Підтверджено (364 під ризиком) |
| 4 | Сесії без журналу → невідновлювані | цілісність моделі | MEDIUM | ✅ Підтверджено (net −340) |
| 5 | balance integer vs numeric → округлення | гроші (ledger↔знімок) | MEDIUM | ✅ Підтверджено (округлення), розрив латентний |
| 6 | Гонка вмісткості (2× enroll) | гонки | HIGH | 🟠 Потенційно (умови є) |
| 7 | `restore_class` NULL/`restored_count` | ідемпотентність/цілісність | MEDIUM | 🟠 Потенційно |
| 8 | `calc_trainer_salary` v1 ціле ділення | гроші | MEDIUM | 🟠 Потенційно (нема 90-хв) |
| 9 | anon повний DML-GRANT | привілеї/defense-in-depth | LOW | 🟠 Потенційно (RLS тримає) |
| 10 | force_no_charge скасування без сліду | організаційний | LOW | 🟠 Потенційно |

**Найгостріше до виправлення:** #1 (витік даних, неавторизований), потім #2 і #3 (реальні гроші/незворотна втрата одним кліком). #6 — закрити advisory-lock'ом до першого піку записів.
