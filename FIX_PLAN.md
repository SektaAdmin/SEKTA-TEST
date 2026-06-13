# FIX_PLAN.md — план виправлень за adversarial-аудитом SEKTA CRM

**Дата:** 2026-06-13
**База:** `AUDIT_REPORT.md` (10 находок). Цей документ — аналіз, план і статус впровадження.

**Статус виправлень:**
- ✅ **#2 ВИПРАВЛЕНО** (2026-06-13): `calc_trainer_salary_v2` → `rate * sessions_used`; `enrollClient` → hours для 2-год.
- 🔲 #1, #3–#10 — у плані, ще не зроблено.

Усі перевірки нижче — повторно зроблені read-only `SELECT` проти живого prod через MCP (нічого не закомічено крім зазначеного).

---

## Резюме

| | К-сть |
|---|---|
| Усього находок | **10** |
| Підтверджено (повторив на проді) | **9** |
| Уточнено / переформульовано (суть вірна, формулювання аудиту неточне) | **2** (#1, #9 — доступ anon іде через `PUBLIC`, а не через явний `GRANT … TO anon`) |
| Відхилено як ложне спрацювання | **1** часткове: у #7 «падає на CHECK `sessions_used>=0`» — **неточно**: CHECK пропускає NULL; реальний краш — на `NOT NULL` колонки `sessions_used`. Сам дефект (#7) реальний. |

**Найголовніше уточнення, якого нема в аудиті як окремого пункту:**
у БД **жодної `REVOKE EXECUTE … FROM PUBLIC`** немає (перевірив `grep` по снапшоту + `pg_proc.proacl`). Тому **всі** функції з `proacl IS NULL` (`create_sale`, `update_sale`, `delete_sale`, `update_client_balance`, `restore_class`) і ті, що мають явний anon-grant (`generate_week`, `calc_trainer_salary`, `calc_trainer_salary_v2`, `get_session_balance_after`) — **виконувані ролью `anon` через дефолтний `EXECUTE TO PUBLIC`**. Підтверджено `has_function_privilege('anon', …, 'EXECUTE') = true` на всіх дев'ятьох. Це робить #1 експлуатованим анонімом (бо функція `SECURITY DEFINER` → RLS її не рятує), а #9 — реальним (хоч і LOW, бо для INVOKER-RPC писати все одно не дає RLS).

Контроль навпаки: `class_availability`, `client_enroll`, `get_session_balances_running` — **НЕ** PUBLIC (лише `authenticated`/`postgres`). Тобто частина новіших функцій уже має правильний REVOKE — патерн у проєкті існує, треба лише дотягнути решту.

---

## Перевірені масштаби (повтор на проді, 2026-06-13)

| Метрика | Значення | Підтверджує |
|---|---|---|
| `client_session_balances` усього / у мінусі / net | 190 / 163 / **−340** | #4 |
| 2-год `attended`, `sessions_used=1`, `hours IS NULL` | **7** | #2, #7 |
| series-класів під bulk-delete / attended-сесій у них | 140 / **364** | #3 |
| класів понад capacity зараз | **0** | #6 (potential) |
| класів з тривалістю ≠ {60,120} | **0** | #8 (potential) |
| `sales` / `balance_transactions` | 1 / 0 | контекст (грошова вісь порожня) |
| `anon` має EXECUTE на 9 грошових/salary/balance RPC | **true ×9** | #1, #9 |
| `enrollments.sessions_used` | `NOT NULL`, default 0 | уточнення #7 |
| `calc_trainer_salary` v1 виклики в коді | **0** (лише v2 у `trainer-rates.ts`) | #8 → v1 мертва |
| `enrollClient` (admin) передає hours | **ні** (`EnrollClientModal.tsx:76` — без аргументу) | корінь #2 |

---

# Находки: причина → варіанти → рекомендація → ризик

---

## 🔴 #1 — IDOR `get_session_balance_after` (NULL-обхід гейта, доступ anon через PUBLIC) — CRITICAL

**Корінь (підтверджено в тілі, снапшот 1200–1213):**
```sql
IF auth_role() = 'client' THEN
  IF array_length(p_client_ids,1) != 1 OR p_client_ids[1] != current_client_id() THEN
    RAISE EXCEPTION 'access denied';
```
Для `anon` і для `authenticated`-без-рядка в `clients.user_id`: `auth_role()` дефолтиться у `'client'`, `current_client_id()` = `NULL`. Тоді `p_client_ids[1] != NULL` → **NULL**, `IF (false OR NULL)` → не TRUE → `RAISE` не спрацьовує. Функція `SECURITY DEFINER` → оминає RLS → віддає чужий баланс. Доступ anon реальний, бо функція має `EXECUTE TO PUBLIC` (перевірено: `has_function_privilege('anon',…)=true`).

Той самий NULL-патерн у `get_session_balances_running` (снапшот 1278): `auth_role()='client' AND p_client_id != current_client_id()` → `true AND NULL` = NULL → не RAISE. Тут anon не дістане (EXECUTE не-PUBLIC), але **authenticated-без-клієнта прослизне**.

**Варіанти:**
1. **NULL-safe гейт у тілі + REVOKE FROM PUBLIC/anon** (рекомендовано).
   - `+` закриває обидва вектори (anon і authenticated-без-клієнта), мінімальна зміна, узгоджується з уже-правильним патерном `client_enroll`/`get_session_balances_running`-grants.
   - `−` треба не забути обидві функції (`_after` і `_running`).
2. Винести гейт у `SECURITY INVOKER` + покладатися на RLS.
   - `−` ці функції агрегують по масиву клієнтів — INVOKER зламає легітимний staff-доступ через RLS-нюанси; великий рефактор. Відхилено.
3. Тільки REVOKE FROM anon, без правки тіла.
   - `−` лишає дірку для authenticated-без-клієнта (реальний кейс: тренер/новий юзер без linked-client). Недостатньо.

**Рекомендація: варіант 1.** Гейт переписати на explicit-reject:
```sql
IF auth_role() <> 'client' THEN
  NULL;                                   -- owner/admin/trainer — ок
ELSIF current_client_id() IS NULL
   OR array_length(p_client_ids,1) IS DISTINCT FROM 1
   OR p_client_ids[1] IS DISTINCT FROM current_client_id() THEN
  RAISE EXCEPTION 'access denied';
END IF;
```
Аналогічно в `get_session_balances_running`:
```sql
IF auth_role() = 'client'
   AND (current_client_id() IS NULL OR p_client_id IS DISTINCT FROM current_client_id()) THEN
  RAISE EXCEPTION 'access denied';
END IF;
```
Плюс `REVOKE EXECUTE ON FUNCTION public.get_session_balance_after(uuid[],text,timestamptz) FROM anon, PUBLIC;` (легітимного анонімного виклику нема).

**Ризик впровадження:** **низький.** Не чіпає дані. Frontend: `getSessionBalancesAfter` ([enrollments.ts:104](lib/queries/enrollments.ts#L104)) викликається лише staff-UI під `authenticated` з роллю owner/admin → `auth_role() <> 'client'` → гілка `NULL` → працює як раніше. Кабінет клієнта не викликає `_after` (він на `_running`), а там зв'язаний клієнт має `current_client_id() ≠ NULL` → проходить. Регрес малоймовірний; перевірити: staff відкриває ClassDetailModal (бачить «баланс після») + клієнт у кабінеті бачить свій running-баланс.

---

## 🔴 #2 — Salary 2 год vs 1 сесія на 2-год заняттях — HIGH (підтверджено, 7 год розриву)

**Корінь:** дві формули рахують одне й те саме по-різному.
- `auto_close_classes` (снапшот 372–375) списує `COALESCE(array_length(hours_attended,1),1)` → для `NULL` = **1**.
- `calc_trainer_salary_v2` (434, 445) платить тренеру `rate * duration_min::numeric/60` → для 120 хв = **2 год**.
- `client_enroll` для 2-год ставить `hours_attended=[1,2]`, **але адмінський шлях `enrollClient` → `EnrollClientModal.tsx:76` не передає hours** → `auto_close` спише 1, а v2 нарахує 2.

Глибший корінь: **нема єдиного джерела правди «скільки коштує заняття»**. Списання з клієнта рахується від `hours_attended`/`sessions_used`, а оплата тренеру — від `duration_min`. Поки 2-год запис робить адмін без чекбоксу, вони розходяться структурно.

**Варіанти:**
1. **v2 платить тренеру за фактично списані сесії `e.sessions_used`** (рекомендовано як основний інваріант).
   - `+` єдине джерело правди = реальне списання; зайвих годин не буде ніколи, незалежно від того, хто і як записав.
   - `−` треба окремо вирішити noshow (там `sessions_used=0`, а тренеру за noshow історично платять `duration/60`) — лишити для noshow гілку `duration_min::numeric/60`, для attended — `sessions_used`.
   - `−` міняє суму ЗП на майбутніх 2-год без чекбоксу (але це і є виправлення «бреше»).
2. **Зробити hours обов'язковими для 2-год на вході** (BEFORE INSERT тригер: `duration_min>=120 AND hours_attended IS NULL → [1,2]`), а v2 лишити на `duration_min/60`.
   - `+` тоді обидві формули зійдуться (списання стане 2, оплата 2).
   - `−` змінює семантику «клієнт прийшов на 1 годину з 2-год заняття» — тригер силоміць поставить 2; треба, щоб адмінський UI міг явно проставити `[1]`/`[2]`. Поки UI 2-год запису не дає вибір годин — тригер нав'яже 2 усім.
   - `−` не лагодить уже-наявні 7 рядків.
3. Комбо: тригер (варіант 2) **+** v2 на `sessions_used` (варіант 1).
   - `+` найнадійніше — і списання консистентне, і оплата від факту.
   - `−` більший обсяг; ризик подвоєння змін на одному релізі.

**Рекомендація: варіант 1** (v2 → `e.sessions_used` для attended, `duration_min::numeric/60` для noshow). Це робить «фактичне списання» єдиним джерелом правди й автоматично закриває майбутні випадки незалежно від UI. Тригер (варіант 2) — окремим, нижчепріоритетним кроком, якщо бізнес хоче, щоб 2-год завжди списувало 2.
```sql
-- у calc_trainer_salary_v2, trainer_amount та studio_amount:
CASE WHEN e.status = 'noshow'
     THEN <rate> * (c.duration_min::numeric/60)
     ELSE <rate> * e.sessions_used END
```
**Узгодити з бізнесом** перед впровадженням: чи дійсно тренер за noshow отримує повну тривалість, а за attended — за фактично списані сесії. Це **бізнес-домовленість**, не технічна — занести в CLAUDE.md після рішення.

**Ризик впровадження:** **середній (грошовий, але дані не чіпає).** Зміна лише в тілі `calc_trainer_salary_v2` (STABLE, читає, не пише). Жодної міграції даних. **Існуючі 7 «зайвих» годин** уже могли потрапити в нараховану-але-не-виплачену ЗП — після фіксу той самий період перерахується на 7 год менше. Якщо за цей період ЗП вже виплачена — буде розбіжність у бекофісі (треба звірити вручну з тренером; зараз `trainer_payments=0`, тож на проді ще нічого не виплачено — ризик нульовий зараз, але до фіксу ЗП ще не нараховувалась реально). Перевірити: `/settings/salary/calculations` на 2-год занятті показує оплату = к-сть фактичних сесій × ставку.

---

## 🔴 #3 — Bulk-delete тижня знищує оплачені сесії без повернення — HIGH (підтверджено, 364 під ризиком)

**Корінь:** `deleteClassesInRange` ([classes.ts:349-362](lib/queries/classes.ts#L349-L362)) робить сирий `DELETE FROM classes`. `enrollments.class_id` має `ON DELETE CASCADE` → записи зникають разом із класом. RPC `delete_class` повертає `sessions_used` у `client_session_balances` **перед** DELETE; сирий шлях — ні. Журналу сесій нема (#4) → відновити неможливо. Один клік «виставити тиждень» поверх існуючого → тихо −364 сесії.

**Варіанти:**
1. **`BEFORE DELETE` тригер на `classes`, що повертає сесії** (рекомендовано).
   - `+` закриває **будь-який** шлях видалення (цей сирий DELETE, `delete_class`, майбутні, ручний DELETE з MCP). Defense-in-depth на рівні даних.
   - `+` `delete_class` можна спростити (тригер зробить реверс) — або лишити, але тоді ризик подвійного повернення → тригер і `delete_class` робитимуть реверс двічі. **Треба прибрати реверс із тіла `delete_class`**, лишивши його тригеру (інакше +2× сесій).
   - `−` обережно з `cancel_class_and_restore_sessions` (м'яке скасування) — воно НЕ робить DELETE, тож тригер не зачепить; ок. Але треба впевнитись, що `generate_week` `ON CONFLICT DO NOTHING` ніколи не DELETE-ить.
2. **Замінити сирий DELETE на цикл `delete_class(id)`** по кожному класу діапазону.
   - `+` мінімальна зміна, не чіпає схему; реверс уже всередині `delete_class`.
   - `−` N RPC-викликів замість одного DELETE (повільніше на 140 класів, але це адмінська разова дія — прийнятно).
   - `−` лишає сирий DELETE-вектор відкритим для майбутнього коду/ручних дій.
3. **Bulk-RPC `delete_classes_in_range`** (один SECURITY DEFINER, що повертає сесії агрегатно + DELETE).
   - `+` атомарно, швидко, гейт `can_manage_enrollment`.
   - `−` новий код RPC; дублює логіку реверсу `delete_class`.

**Рекомендація: варіант 1 (тригер) як основний захист + прибрати реверс із `delete_class`.** Це єдине, що робить будь-який майбутній шлях видалення безпечним, а сам код можна не міняти взагалі (сирий DELETE стане безпечним). Обов'язкова умова — узгодити з `delete_class`, щоб не повернути сесії двічі. Якщо не хочемо чіпати `delete_class` цим релізом — тимчасово варіант 2 (цикл) як швидка латка, тригер пізніше.

> ⚠️ Залежність: цей фікс краще котити **після/разом** із #4 (журнал сесій) у ідеалі, але технічно незалежний. Тригер критичний сам по собі.

**Ризик впровадження:** **середній, потрібен бекап.** Тригер змінює поведінку всіх DELETE на `classes`. Існуючі дані не чіпаються при міграції (тригер впливає лише на майбутні DELETE). Але: якщо лишити реверс і в `delete_class`, і в тригері — **подвійне повернення сесій** (баг гірший за оригінал). Тому крок atomic: «додати тригер + у тому ж коміті прибрати INSERT-реверс із тіла `delete_class`». **Перед застосуванням — снапшот/бекап** (зміна логіки навколо незворотного DELETE). Перевірити: видалити тестовий клас з attended-записом → сесія повернулась рівно 1 раз (і через `delete_class`, і через сирий DELETE).

---

## 🟠 #4 — Сесії без журналу руху, ніщо не змушує знімок сходитись — MEDIUM (підтверджено, net −340)

**Корінь:** `client_session_balances` — це **знімок-істина**, який пишуть прямими `INSERT … ON CONFLICT DO UPDATE` ~10 функцій. Окремого `session_transactions` нема (на відміну від грошей з `balance_transactions`). Будь-який пропущений реверс (#2, #3, #6) осідає назавжди й непомітно — нема з чим звірити.

**Варіанти:**
1. **Завести `session_transactions` (delta-ledger) + писати з тих самих RPC** (правильно, але великий обсяг).
   - `+` повна аудитованість, відновлюваність, дзеркало грошової осі.
   - `−` торкається ~10 функцій (кожна точка зміни балансу сесій); ризик пропустити одну = ledger розійдеться зі знімком одразу. Великий, окремий проєкт.
2. **Нічна звірка-алерт (reconcile job)** без зміни моделі.
   - `+` мінімальний обсяг: один SQL, що рахує очікуваний баланс із рухів (`SUM(sales.sessions) − SUM(enrollments.sessions_used)` по типу) і порівнює зі знімком; різниця → лог/алерт.
   - `−` не дає журналу руху (не відновить, лише виявить); і очікуваний баланс важко відновити для імпортованих сідів (зараз 163 «мінуси» — це сід без покупок, не баг).
3. **Нічого зараз, занести в борг.**
   - `−` лишає всі session-баги невидимими.

**Рекомендація: варіант 2 зараз (дешевий детектор), варіант 1 — у backlog як окремий проєкт.** На поточному обсязі (грошова/sales-вісь порожня, дані сідовані) повний ledger передчасний; детектор дасть видимість, коли почнуться реальні покупки. **Не блокує** #1–#3.

**Ризик впровадження:** варіант 2 — **нульовий** (тільки читає). Варіант 1 — високий (багато точок), окремо й обережно.

---

## 🟠 #5 — `clients.balance` integer vs `balance_transactions` numeric(10,2): тихе округлення — MEDIUM (латентно)

**Корінь:** `update_client_balance(p_amount numeric)` → `UPDATE clients SET balance = balance + p_amount` (снапшот 1788), `balance` = **integer** → assignment-cast `numeric→int` округлює half-up. У ledger пишеться точний `numeric`. Жоден constraint не звіряє `clients.balance` із `SUM(balance_transactions.amount)`. Зараз усі суми цілі (інв. #6) → розриву ще нема (0 транзакцій). Перший дробовий рух → вічний розсинхрон.

Додатково: `check_balance_consistency` (снапшот 247) **тавтологічний** — обидві гілки OR = `balance_after = balance_before + amount`; розбивка за знаком нічого не дає, і він не звіряє з `clients.balance`.

**Варіанти:**
1. **Заборонити дробове на вході RPC** (`IF p_amount <> round(p_amount) THEN RAISE`) (рекомендовано як швидкий захист).
   - `+` мінімум, узгоджується з інв. #6 «гроші — integer ₴», не чіпає схему/дані.
   - `−` не вирішує, якщо колись з'явиться легітимна потреба в копійках (тоді — варіант 2).
2. **`clients.balance` → `numeric(10,2)`.**
   - `−` суперечить інв. #6 і коду, що ніде не ділить на 100; треба перевірити всі читачі `balance` на формат; зайвий скоуп, поки копійок нема. Відхилено зараз.
3. Замінити тавтологічний CHECK + окремий reconcile-job `SUM(amount) == clients.balance`.
   - `+` ловить розсинхрон по факту; дешево.
   - комплементарно до варіанта 1.

**Рекомендація: варіант 1 (guard на дробове) + замінити мертвий CHECK на корисний або прибрати.** Реальну звірку `SUM(amount)==balance` — окремим job-ом (об'єднати з детектором #4). Тип колонки не чіпати, поки бізнес не введе копійки.

**Ризик впровадження:** **низький.** Guard у тілі RPC; усі поточні виклики передають цілі (інв. #6) → нічого не зламається. Перевірити: `create_sale`/`update_sale` з цілими сумами працюють; спроба передати `100.5` → `success=false` зрозумілою помилкою.

---

## 🟠 #6 — Гонка вмісткості: 2 паралельні enroll перевищують capacity — HIGH (potential, умови є)

**Корінь:** `check_class_capacity` (снапшот 668–676) рахує `COUNT(*)` лише закомічених рядків, без блокування. Isolation = read committed. Нема EXCLUDE/агрегатного обмеження на `class_id` (лише UNIQUE `class_id,client_id`). Два паралельні enroll на клас із 1 вільним місцем → обидва бачать `active<capacity` → обидва коммітяться → `capacity+1`. Зараз класів понад capacity 0 (ще не вистрілило), але є класи рівно `active=capacity` з резервом → один паралельний дубль = перевищення.

**Варіанти:**
1. **`pg_advisory_xact_lock(hashtextextended(class_id::text,0))` на початку `client_enroll`/`enrollClient`** перед підрахунком (рекомендовано).
   - `+` серіалізує лише записи на той самий клас; мінімальна зміна; тригер лишається запобіжником.
   - `−` adminський `enrollClient` зараз — це JS-код у `lib/queries`, що робить сирий INSERT (не RPC) → lock туди не вставиш без переносу в RPC. Тобто треба або (а) загорнути admin-enroll у RPC, або (б) прийняти, що lock покриває лише `client_enroll` (самозапис — найімовірніше джерело піку), а admin-enroll лишити на тригері.
2. **`SELECT … FROM classes WHERE id=class_id FOR UPDATE`** перед підрахунком.
   - `+` серіалізує через блокування рядка класу; природніше advisory-lock.
   - `−` той самий нюанс із admin-INSERT-ом поза RPC.
3. **EXCLUDE/тригер-constraint на матеріалізований лічильник.**
   - `−` найбільший обсяг, нову колонку-лічильник треба тримати консистентною; надмірно для поточного масштабу.

**Рекомендація: варіант 1 у `client_enroll`** (самозапис — реальне джерело паралельного піку: промо, відкриття слотів). Adminський enroll: перенести вставку в SECURITY DEFINER RPC `admin_enroll(class_id, client_id, hours)` із тим самим advisory-lock + перевірками конфлікту/балансу (зараз `enrollClient` обходить навіть їх — це окремий борг, що цей фікс заразом закриє). Якщо переносити admin-enroll задорого цим релізом — мінімум advisory-lock у `client_enroll`, тригер як запобіжник для admin-шляху.

**Ризик впровадження:** **низький–середній.** Advisory-lock не чіпає дані. У `client_enroll` — лише додати рядок lock. Перенос admin-enroll у RPC — середній скоуп (новий RPC + правка `EnrollClientModal`/`enrollClient`), узгодити з #2 (RPC має проставляти hours для 2-год = `[1,2]`). Перевірити: два паралельні enroll на клас 9/10 → один enrolled, другий waitlist (не 11/10).

---

## 🟡 #7 — `restore_class`: NULL `sessions_used` на 2-год без hours + брехливий `restored_count` — MEDIUM (potential)

**Корінь (снапшот 1618–1625):**
1. `sessions_used = CASE WHEN duration_min>=120 THEN array_length(hours_attended,1) ELSE 1 END` → для 2-год з `hours IS NULL` → `array_length(NULL,1)=NULL` → запис `NULL` у `sessions_used` (**NOT NULL** колонка — підтверджено) → виняток. EXCEPTION-handler нема → `restore_class` падає сирою SQL-помилкою.
   > Уточнення до аудиту: краш на **NOT NULL**, а не на CHECK `sessions_used>=0` (CHECK пропускає NULL). Дефект реальний, механізм інший.
2. `RETURNING 1 INTO v_count` при multi-row UPDATE кладе у скаляр лише **останній** рядок → `restored_count` завжди ≤1.

Тригериться лише якщо є `cancelled`-записи зі `sessions_used>0` на 2-год без hours. Поточний cancel-шлях ставить `sessions_used=0` (фільтр `>0` їх не ловить) → **potential**.

**Варіанти:** один очевидний правильний — фікс тіла:
```sql
sessions_used = COALESCE(array_length(hours_attended,1),
                         CASE WHEN duration_min>=120 THEN 2 ELSE 1 END)
-- count:
GET DIAGNOSTICS v_count = ROW_COUNT;
-- + EXCEPTION WHEN OTHERS як в інших RPC
```
Узгодити дефолт «2 для 2-год без hours» з рішенням #2 (єдине джерело правди).

**Рекомендація:** фікс тіла (COALESCE + GET DIAGNOSTICS + EXCEPTION-handler). Заразом додати гейт `can_manage_enrollment()` (зараз `restore_class` без гейта і PUBLIC-executable — хоч INVOKER, тож RLS блокує запис anon, але гейт привести до решти enrollment-RPC) і `REVOKE … FROM anon, PUBLIC`.

**Ризик впровадження:** **низький.** Чисте виправлення тіла; не чіпає дані. Перевірити: `restore_class` на занятті з кількома cancelled-attended → `restored_count` = реальна к-сть; на 2-год без hours → не падає, ставить 2.

---

## 🟡 #8 — `calc_trainer_salary` v1: ціле ділення `duration_min/60` ріже noshow-години — MEDIUM (potential, мертва)

**Корінь:** v1 (снапшот 395): `WHEN noshow THEN c.duration_min / 60` — int/int зрізає (90→1, 30→0). Зараз тривалості лише {60,120} → не ріже → potential.

**Уточнення:** **v1 у коді не викликається** (перевірив: тільки `calc_trainer_salary_v2` у `trainer-rates.ts:176`). UI на v2.

**Варіанти:**
1. **DROP `calc_trainer_salary` (v1)** (рекомендовано) — мертвий код + зайва PUBLIC/anon-executable поверхня.
   - `+` прибирає вектор і борг разом.
   - `−` якщо десь є зовнішній виклик (скрипт, дашборд поза репо) — зламається; малоймовірно, але перевірити з власником.
2. Полагодити на `c.duration_min::numeric/60` (як v2), лишити.
   - `+` безпечно, якщо хтось ще її кличе.
   - `−` тримати дві функції-близнюки = борг.

**Рекомендація: варіант 1 (DROP), якщо власник підтверджує, що зовнішніх викликів нема.** Інакше — варіант 2 + план на видалення.

**Ризик впровадження:** **низький** (за умови нуль зовнішніх викликів). Перевірити: `/settings/salary/*` працює (на v2) після DROP v1; `npm run build` зелений; `sync:schema` не зламався.

---

## 🟡 #9 — `anon` має EXECUTE на грошових/balance/salary RPC через PUBLIC — LOW (potential, RLS тримає)

**Корінь:** нема жодної `REVOKE EXECUTE … FROM PUBLIC` → дефолтний `EXECUTE TO PUBLIC` лишає `anon` виконавцем `create_sale/update_sale/delete_sale/update_client_balance/restore_class/generate_week/calc_trainer_salary*`. Підтверджено `has_function_privilege('anon',…)=true ×9`. Для INVOKER-RPC писати все одно не дає RLS (двічі емпірично в аудиті) → **LOW**, але порушення найменших привілеїв: один помилковий permissive-policy у майбутньому миттєво відкриє anon на запис грошей. Плюс `generate_week` — INVOKER **без `SET search_path`** (єдина така) → search_path-вектор (інв. #10).

**Варіанти:**
1. **`REVOKE EXECUTE … FROM anon, PUBLIC` на всіх грошових/balance/salary/generate RPC + `SET search_path` на `generate_week`** (рекомендовано).
   - `+` принцип найменших привілеїв; узгоджується з уже-правильними `client_enroll`/`class_availability`.
   - `−` треба впевнитись, що жоден легітимний anon-флоу їх не кличе (логін-флоу — Route Handlers зі service-role, не anon-RPC; перевірено в CLAUDE.md — анонімних викликів цих RPC нема).
2. Лишити (RLS тримає).
   - `−` defense-in-depth борг; LOW, але дешево закрити.

**Рекомендація: варіант 1.** `REVOKE … FROM anon, PUBLIC` на: `create_sale`, `update_sale`, `delete_sale`, `update_client_balance`, `restore_class`, `generate_week`, `calc_trainer_salary`(якщо не дропнули в #8), `calc_trainer_salary_v2`, `get_session_balance_after` (дублює #1). Лишити EXECUTE лише `authenticated` (+`postgres` де треба cron). Додати `SET search_path = public, pg_temp` у `generate_week`, `calc_trainer_salary_v2`, `check_class_conflicts`, `check_client_conflict` (усі без нього — перевірити список).

**Ризик впровадження:** **низький.** GRANT-зміни не чіпають дані. **Єдиний ризик** — якщо якийсь флоу таємно ходить як anon на ці RPC; перевірено — staff-UI під `authenticated`. Перевірити після: продаж/редагування продажу/виставлення тижня працюють під залогіненим owner/admin.

---

## 🟡 #10 — `force_no_charge`-скасування адміном без сліду причини — LOW (організаційний)

**Корінь:** `change_enrollment_status(p_force_no_charge=true)` — за дизайном (інв. дозволяє виняткове скасування без штрафу). Ризик не технічний: нема журналу сесій (#4) → нема сліду, хто/чому пробачив списання. `client_cancel` зашиває `force_no_charge=false` (перевірено) → клієнт обійти не може.

**Рекомендація:** залежить від #4. Коли з'явиться `session_transactions` — логувати `force_no_charge`-події з `reason` й автором (`auth.uid()`). Зараз — **занести в backlog**, не блокує нічого. Якщо потрібен мінімум зараз: додати NOT NULL `reason` при `force_no_charge=true` (RAISE якщо порожній) — дешевий організаційний контроль без журналу.

**Ризик:** н/д (нічого не міняємо зараз).

---

# ПЛАН ВПРОВАДЖЕННЯ

**Принцип:** спершу те, що б'є по конфіденційності/грошах і підтверджено; чистити дані до constraint'ів; кожен крок — окрема міграція + окремий коміт (узгоджено з робочим процесом проєкту), `npm run build` зелений перед push.

**⚠️ Спільна передумова дрейфу:** історія міграцій розходиться зі снапшотом (борг із попереднього аудиту). Усі DDL-фікси нижче застосовувати **як нові forward-міграції** (`CREATE OR REPLACE` / `REVOKE` / `CREATE TRIGGER`), що ідемпотентно лягають поверх prod, **не** через rewrite історії. Після кожної структурної зміни — `npm run sync:schema`.

---

## Хвиля 0 — підготовка (перед будь-яким DDL)
- **Бекап prod** (MCP snapshot вручну, як у попередньому hardening-коміті) — обов'язково перед #3 (тригер навколо незворотного DELETE) і #2 (грошова формула).
- Узгодити з власником **2 бізнес-рішення**, що блокують код:
  1. #2: тренеру за attended платимо за **фактичні сесії** (рекоменд.) чи за тривалість? За noshow — повна тривалість?
  2. #8: чи є зовнішні (поза репо) виклики `calc_trainer_salary` v1 → можна DROP?

---

## Хвиля 1 — CRITICAL, безпечно котити одразу (без міграції даних)

### Крок 1.1 — #1 IDOR (NULL-safe гейт + REVOKE)
- **Що:** `CREATE OR REPLACE` `get_session_balance_after` і `get_session_balances_running` з explicit-reject гейтом (`current_client_id() IS NULL` → deny, `IS DISTINCT FROM`). `REVOKE EXECUTE … FROM anon, PUBLIC` на `get_session_balance_after`.
- **Файл:** нова міграція `2026061x_fix_idor_session_balance_gates.sql`.
- **Відкат:** `CREATE OR REPLACE` назад на попереднє тіло (зберегти оригінал у коміті) + повторний GRANT (не потрібен — PUBLIC і так дефолт, але задокументувати).
- **Перевірка:** staff бачить «баланс після» в ClassDetailModal; клієнт у кабінеті бачить свій running-баланс; anon `rpc/get_session_balance_after` → `permission denied`; authenticated-без-клієнта → `access denied`.
- **Безпечно котити:** ✅ дані не чіпає. **Найвищий пріоритет** (активний витік через публічний anon-ключ).

---

## Хвиля 2 — HIGH гроші/втрата даних (бекап перед застосуванням)

### Крок 2.1 — #3 BEFORE DELETE тригер реверсу сесій + прибрати реверс із `delete_class`
- **Що:** `CREATE FUNCTION restore_sessions_before_class_delete()` + `CREATE TRIGGER trg_restore_sessions BEFORE DELETE ON classes`; у тому ж коміті прибрати INSERT-реверс із тіла `delete_class` (щоб не подвоїти).
- **Залежність:** робити **разом** (тригер без правки `delete_class` = подвійне повернення).
- **Файл:** `2026061x_restore_sessions_on_class_delete.sql`.
- **Відкат:** `DROP TRIGGER` + повернути реверс у `delete_class` (зберегти оригінал тіла).
- **Перевірка:** видалити тест-клас з attended-записом через сирий шлях («виставити тиждень» поверх) і через `delete_class` → сесія повертається рівно 1 раз у `client_session_balances` обома шляхами.
- **Котити:** після бекапу (зміна навколо незворотного DELETE). Можна без вікна обслуговування, але в тихий час.

### Крок 2.2 — #2 Salary 2год↔1сесія ✅ ВИПРАВЛЕНО 2026-06-13
- **Бізнес-інваріант (узгоджено):** тренер отримує `rate × sessions_used` для attended і noshow однаково. noshow = клієнт не прийшов, але сесія списалась за правилом скасування → тренер отримує оплату за цю сесію. 2-год: клієнт на обох годинах → sessions_used=2 → 2×rate; лише на першій → 1×rate.
- **Що зроблено:**
  - `supabase/migrations/20260613_fix_salary_v2_actual_sessions.sql` — `CREATE OR REPLACE calc_trainer_salary_v2`: замінено `duration_min::numeric/60` на `e.sessions_used` в обох підзапитах (trainer_amount + studio_amount). Додано `SET search_path`.
  - `lib/queries/enrollments.ts` `enrollClient` — додано `duration_min` до select класу; якщо `duration_min>=120` і `hoursAttended` не передано явно → `resolvedHours=[1,2]`. Дзеркало `client_enroll` RPC.
- **Перевірка:** `/settings/salary/calculations` на 2-год: оплата = сесії × ставку; noshow = оплачено.

---

## Хвиля 3 — MEDIUM/HIGH-potential (захист на майбутнє)

### Крок 3.1 — #6 advisory-lock у `client_enroll` (+ опційно admin_enroll RPC)
- **Що:** `pg_advisory_xact_lock(hashtextextended(p_class_id::text,0))` на початку `client_enroll` перед підрахунком active. Опц.: новий `admin_enroll` SECURITY DEFINER з lock + конфлікт/баланс-перевірки + hours для 2-год (закриває заразом борг «admin-enroll обходить перевірки» і частину #2).
- **Файл:** `2026061x_enroll_capacity_lock.sql`.
- **Відкат:** `CREATE OR REPLACE` назад без lock-рядка.
- **Перевірка:** два паралельні enroll на 9/10 → 1 enrolled + 1 waitlist.
- **Котити:** безпечно (lock не чіпає дані).

### Крок 3.2 — #7 restore_class фікс (COALESCE + GET DIAGNOSTICS + EXCEPTION + гейт + REVOKE)
- **Що:** `CREATE OR REPLACE restore_class` з `COALESCE(array_length(...), CASE … 2 : 1)`, `GET DIAGNOSTICS v_count=ROW_COUNT`, EXCEPTION-handler, `can_manage_enrollment()`-гейт; `REVOKE … FROM anon, PUBLIC`.
- **Файл:** `2026061x_fix_restore_class.sql`.
- **Відкат:** попереднє тіло.
- **Перевірка:** restore класу з кількома cancelled-attended → `restored_count` реальний; 2-год без hours → не падає.
- **Котити:** безпечно.

### Крок 3.3 — #9 REVOKE FROM anon/PUBLIC + search_path
- **Що:** `REVOKE EXECUTE … FROM anon, PUBLIC` на грошових/salary/generate RPC; `SET search_path=public,pg_temp` на `generate_week`, `calc_trainer_salary_v2`, `check_class_conflicts`, `check_client_conflict` (звірити повний список без search_path).
- **Файл:** `2026061x_least_privilege_rpc_grants.sql`.
- **Відкат:** повторні GRANT (PUBLIC — дефолт, тож фактично нема потреби, задокументувати).
- **Перевірка:** під owner/admin працюють продаж/редагування/виставлення тижня; anon `rpc/create_sale` → permission denied.
- **Котити:** безпечно (звірити, що нема легітимного anon-флоу — підтверджено).

---

## Хвиля 4 — MEDIUM латентне / борг (без поспіху)

### Крок 4.1 — #5 guard на дробове + замінити мертвий CHECK
- **Що:** `IF p_amount <> round(p_amount) THEN RAISE` в `update_client_balance`; замінити тавтологічний `check_balance_consistency` на корисний або прибрати (реальну звірку — у reconcile-job).
- **Котити:** безпечно (усі поточні суми цілі).

### Крок 4.2 — #8 DROP v1 (після підтвердження нуль зовнішніх викликів)
- **Що:** `DROP FUNCTION calc_trainer_salary(uuid,timestamptz,timestamptz)`.
- **Перевірка:** build зелений, `/settings/salary/*` на v2 працює, `sync:schema` ок.
- **Котити:** безпечно за умови нуль зовнішніх викликів.

### Крок 4.3 — #4 reconcile-детектор сесій (дешевий) + backlog ledger
- **Що:** нічний SQL-алерт `SUM(очікуване) vs знімок`; повний `session_transactions` — окремий проєкт у backlog.

### Крок 4.4 — #10 (опц.) `reason` обов'язковий при `force_no_charge`
- Дешевий організаційний контроль; повноцінно — після #4-ledger.

---

## Порядок і залежності (стисло)

```
Хвиля 0: бекап + 2 бізнес-рішення  ─────────────┐
Хвиля 1: 1.1 #1 IDOR (одразу, окремо)           │ найвищий пріоритет, дані не чіпає
Хвиля 2: бекап → 2.1 #3 тригер(+delete_class)   │ незворотна втрата → бекап обов'язково
         → 2.2 #2 salary (після рішення)        │
Хвиля 3: 3.1 #6 lock · 3.2 #7 restore · 3.3 #9 grants  (незалежні між собою)
Хвиля 4: 4.1 #5 · 4.2 #8 DROP · 4.3 #4 детектор · 4.4 #10   (борг, без поспіху)
```

**Жорсткі залежності:**
- #3: тригер і прибирання реверсу з `delete_class` — **в одному коміті** (інакше подвійне повернення).
- #2: код-фікс admin-enroll (hours для 2-год) і формула v2 — узгодити з бізнес-рішенням; ідеально звести з admin_enroll RPC (#6 крок 3.1).
- #7/#2: дефолт «2 для 2-год без hours» — спільний; тримати однаковим.
- #4-ledger — передумова повноцінного #10; обидва в backlog.

**Вимагають бекапу/тихого вікна:** #3 (Хвиля 2). Решта — безпечні rolling-зміни (CREATE OR REPLACE/REVOKE, дані не чіпають).

**Чим платимо (чесно):**
- #2 рекомендований варіант змінює суму ЗП на майбутніх 2-год без чекбоксу — це і є виправлення, але вимагає бізнес-узгодження одиниці оплати noshow.
- #4 свідомо відкладаємо повний ledger (дорого на ~10 точках) на користь дешевого детектора — платимо тим, що session-баги поки лише виявляються, не відновлюються.
- #3 тригер додає невидиму магію на DELETE classes — платимо тим, що треба пам'ятати про нього при майбутніх змінах `delete_class` (задокументувати в CLAUDE.md).
