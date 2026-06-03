# CLAUDE.md

Guidance for Claude Code working in this repository.

## Проєкт

CRM для фітнес/танцювальної студії: клієнти, тренери, абонементи, продажі, розклад занять, нарахування зарплат тренерам, звірка з банком.

**Stack:** Next.js 14.2.3 (App Router) · React 18 · TypeScript (`strict`) · Supabase PostgreSQL · Supabase Auth (JWT) · Tailwind CSS 4 + shadcn/ui (CSS Modules співіснують) · react-hook-form + zod · sonner (toast) · date-fns.

UI — **тільки українською**. Спілкування зі мною — будь-якою мовою.

## Команди

```bash
npm run dev          # localhost:3000
npm run build        # production build + type-check (єдиний "тест" — лінтера/тестів немає)
npm run start        # serve build
npm run sync:schema  # регенерує types/database.types.ts через Supabase Management API
```

`.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
`sync:schema` додатково потребує `SUPABASE_ACCESS_TOKEN` в оточенні (особистий токен з dashboard/account/tokens — НЕ комітити). Тягне офіційний генератор типів, не хардкодить список таблиць.

Деплой: GitHub `SektaAdmin/SEKTA-TEST`, авто-деплой з `main` через Vercel.

---

## Залізні правила (інваріанти)

Це те, що НЕ видно з коду і ламає дані/гроші, якщо порушити:

1. **Грошовий баланс клієнта (`clients.balance`) — тільки через `update_client_balance()` RPC.** Ніколи не `UPDATE clients.balance` напряму. RPC блокує рядок, перевіряє `credit_limit`, пише в `balance_transactions`.
2. **Залишок занять (`client_session_balances`) — тільки через RPC.** Ніколи не `UPDATE` напряму. Списання/повернення: `mark_attendance()`/`reverse_attendance()` (вживає cron). Зміна статусу з UI — **тільки `change_enrollment_status()`**.
3. **Зміна статусу enrollment — тільки через `change_enrollment_status()` RPC.** Прямий `UPDATE enrollments SET status` ламає баланс сесій. RPC сам вирівнює `client_session_balances` (реверс старого списання → застосування нового) і застосовує **правило скасування у часових рамках** (див. нижче). frontend-обгортка — `changeEnrollmentStatus()` у `lib/queries/enrollments.ts`.
4. **Скасування заняття — тільки через `cancel_class_and_restore_sessions()` RPC.** Воно коректно повертає сесії за статусами. Не `UPDATE classes.is_cancelled` напряму.
5. **Snapshots у `sales` незмінні.** `ticket_name`, `ticket_price`, `sessions` — знімки на момент продажу. Не оновлювати, не джоїнити `tickets` для звітів — бери зі snapshot.
6. **Гроші — в гривнях (₴), integer.** `tickets.price`, `sales.price_paid`, `sales.amount_given`, `studio_expenses.amount` — НЕ ділити на 100.
7. **М'які видалення скрізь** — `is_active` / `is_cancelled`. Ніколи не `DELETE` довідкові/доменні рядки.
8. **Timestamps — `timestamptz`, UTC.**
9. **RLS увімкнено на всіх таблицях, доступ — за роллю через `auth_role()`** (`owner`/`admin`/`trainer`/`client`, дефолт `client`). owner = повний доступ скрізь; **admin = owner мінус ЗП і редагування довідників** (`trainer_payments`/`trainer_rates` — owner-only; `halls`/`training_types`/`tickets` — admin лише SELECT); trainer/client — вузькі політики (read чужого закрито, write — лише своє). Доменний id у політиках через `current_client_id()`/`current_trainer_id()` (SECURITY DEFINER, мапінг `auth.uid()`→`clients.id`/`trainers.id`). Нова таблиця в міграції → `ENABLE ROW LEVEL SECURITY` + політика (`owner_all` або `owner_admin_all` залежно від того, чи admin має write) + потрібні trainer/client-політики + `GRANT SELECT,INSERT,UPDATE,DELETE ... TO anon, authenticated`. RLS-on БЕЗ жодної політики = deny-all (0 рядків без помилки).
10. **Нові RPC — `SET search_path = public, pg_temp`** (інакше security advisor скаржиться; вектор ескалації).
11. **CLAUDE.md актуальний у тому ж коміті**, що й зміна архітектури/схеми/патернів. Стан, не changelog (історія — в `git log`). Дати/«фази»/«видалено раніше» сюди не пишемо.
12. **Уніфікація — комплексно, не скальпінгом.** `grep -rn` по всьому проекту → таблиця розбіжностей → один коміт. Перевіряти і CSS контейнера, і JSX дочірніх (flex-shrink/height/padding). Не «фікс файл → коміт → наступний».

---

## Схема БД

**Канонічна схема — `types/database.types.ts`** (авто-ген, `npm run sync:schema`). Тут — тільки зв'язки і бізнес-сенс колонок, якого не видно з типу.

```
clients ──< sales >── tickets        balance_transactions >── clients
   │            │
   │            └── trainers          client_session_balances >── clients
   │
   └──< enrollments >── classes ──< class_series (шаблон/серія)
                          │              └──< series_clients >── clients
                          └── halls, trainers

trainer_rates >── trainers (trainer_id NULL = глобальна)
trainer_payments >── trainers
studio_expenses >── trainers (optional)
training_types — довідник типів занять
```

### Неочевидний бізнес-сенс колонок

- **`clients.balance`** — грошовий депозит у ₴ (може бути від'ємним до `-credit_limit`, дефолт ліміту 10000).
- **`client_session_balances`** — залишок занять **по типу** (`ticket_type`), не загальний.
- **`tickets.ticket_type`** — вільний текст, **не enum**. Має збігатися з `training_types.code`. Відомі: `group`, `individual`, `hallrental`, `smallhallrental`, `individualduo`, `individualtrio`, `pylonrental`, `striprental` + будь-які нові з `training_types`. Max 20 активних тарифів (бізнес-правило).
- **⚠️ Оренда (`hallrental`/`smallhallrental`/`pylonrental`/`striprental`) — звичайний абонемент**, як `group`/`individual`: купується наперед = N сесій, при записі/відвідуванні списується **сесія**. Депозит (гроші) НЕ чіпається. `enrollClient` НЕ створює sale для оренди (стара хибна гілка з `payment_method='deposit'` видалена).
- **`sales.payment_method`** — `cash` / `fop` / `personal_card` / `deposit`. У `SaleModal` `deposit` — **четвертий спосіб оплати** (кнопка, не окремий таб; доступна лише коли обрано абонемент), не окрема вісь. Закон грошей у формі: **`Δдепозит = amount_given − price_paid`** (його застосовує `create_sale`/`update_sale`). `amount_given` = скільки клієнт дав живими; при `deposit` `amount_given=0`, `price_paid`=сума списання (Δ=−price_paid). Жива оплата абонемента вимагає `amount_given > 0` (zod) — «дав 0» = оплата з депозиту, для цього є кнопка «З депозиту» (інакше списання з депозиту хибно мітиться як cash і псує звіт каси).
- **`sales.cash_holder`** / `studio_expenses.cash_holder` / `trainer_payments.cash_holder` — **`uuid` → trainers.id**. Хто фізично тримає готівку «на руках» (актуально лише для `cash`). НЕ текст.
- **`sales` без тікета** (`ticket_id=null`) = депозитна операція: `+amount_given` поповнення, `-price_paid` списання.
- **`training_types.code`** — незмінний ідентифікатор; `label` — редагований. Константи `TICKET_TYPES`/`TICKET_TYPE_LABELS` видалені з коду — всі лейбли читаються з БД (RefsContext / `listTrainingTypeLabels`).
- **`class_series.type`** — `'template'` (постійний шаблон тижня) vs `'series'` (разова серія). `day_of_week`: 0=Нд..6=Сб. `generate_week()` будує `classes` з `type='template'`.
- **`classes.choreo_stage`** — вільний текст, етап вивчення хореографії **на конкретному занятті** (не на серії). Окреме поле, НЕ змішувати з `classes.notes` (загальні нотатки). Запис на кожне заняття; `generate_week` НЕ переносить (нові заняття з порожнім полем). Редагується inline в ClassDetailModal через `updateClassChoreoStage()`; показується read-only на дашборді (FreeSpacesBlock) і в картці клієнта (upcoming-записи).
- **`enrollments.status`** — `enrolled` / `attended` / `cancelled` / `noshow` / `waitlist`. Тригер `check_class_capacity` авто-переводить `enrolled`→`waitlist` при повному залі. **Фінансовий факт — у `sessions_used`** (>0 = сесію списано), не в окремому статусі: `cancelled` зі `sessions_used>0` = «скасувала пізно, штраф».
- **`enrollments.hours_attended`** — `int[]` для занять `duration_min >= 120`: `[1]`, `[2]` або `[1,2]`. `NULL` = усе заняття. `sessions_used = hours_attended.length` (або 1 якщо NULL).
- **Правило скасування (дедлайн безкоштовності)** — у `cancellation_deadline(starts_at)`: початок `< 14:00` → дедлайн 19:00 попереднього дня; `>= 14:00` → `starts_at − 6 год`. До дедлайну `cancelled` без списання, після — зі списанням. `noshow` списує завжди. `change_enrollment_status` приймає `p_force_no_charge` для виняткового скасування без штрафу.
- **`studio_expenses.direction`** — `expense` (зменшує метод) / `income` (збільшує). `payment_method` тут без `deposit`.
- **`trainers.phone`/`trainers.email`** — контакти тренера (на відміну від клієнта, який тримає контакти в `client_contacts`). Потрібні для логіну в кабінет; UNIQUE серед заповнених. Редагуються в `TrainerModal` (edit-режим). `trainers.user_id` заповнений = у тренера є кабінет.
- **`trainer_rates`** — `trainer_rate`+`studio_rate` (₴/людино-годину), `valid_from`/`valid_to` (NULL=активна). Пріоритет: індивід.+зал > індивід. > глоб.+зал > глоб. Зміна = закрити стару (`valid_to`) + додати нову.
- **RLS — за роллю через `auth_role()`** (інваріант #9). Доменні таблиці мають `owner_admin_all` (owner+admin FOR ALL) АБО `owner_all` (owner FOR ALL) + окремі SELECT-політики — залежно від того, чи admin має право write; виняток — `class_series` (RLS вимкнено). Повна матриця — у [docs/ROLES_PLAN.md](docs/ROLES_PLAN.md) §Фаза 3. Ключове: `client_contacts`/`sales`/`balance_transactions`/`studio_expenses`/`trainer_payments`/`trainer_rates` — trainer не бачить (контакти/гроші); **admin не бачить `trainer_payments`/`trainer_rates` (owner-only) і не редагує `halls`/`training_types`/`tickets` (лише SELECT)**; trainer пише `classes`/`enrollments` лише на свої заняття (`trainer_id = current_trainer_id()`); client скрізь бачить лише `*_id = current_client_id()`. ⚠️ RLS-on БЕЗ жодної політики = deny-all (0 рядків без помилки); чистка політик мусить лишати щонайменше owner-політику.

---

## RPC (Stored Procedures)

Усі повертають `TABLE(...)` — читай `data[0]`. Помилки бізнес-логіки приходять як `success=false` + `error_message`, **не** як SQL-error.

| RPC | Призначення |
|-----|-------------|
| `create_sale(p_client_id, p_ticket_id, p_trainer_id, p_cash_holder, p_price_paid, p_amount_given, p_payment_method, p_notes, p_created_at)` | INSERT sales + `update_client_balance` в одній транзакції |
| `update_sale(p_sale_id, …, p_cash_holder, p_ticket_name, p_ticket_price, p_sessions, p_ticket_type, …)` | Реверс старого балансу + застосування нового |
| `delete_sale(p_sale_id)` | Видалити sale + реверс балансу |
| `update_client_balance(p_client_id, p_amount, p_transaction_type, p_description, p_related_sale_id, p_reason)` | → `(success, new_balance, transaction_id, error_message)`. FOR UPDATE + credit_limit + лог |
| `mark_attendance(p_enrollment_id, p_sessions_used=1)` | → `(success, error_message)`. Декремент сесій (allow negative — балансу нема → йде в мінус), status=attended. **Вживає лише cron**; UI → `change_enrollment_status` |
| `change_enrollment_status(p_enrollment_id, p_new_status, p_force_no_charge=false, p_sessions_used=null)` | → `(success, charged, error_message)`. Єдина точка зміни статусу з UI. Вирівнює баланс сесій + застосовує правило скасування. `charged` = чи списано сесію |
| `cancellation_deadline(starts_at) → timestamptz` | Дедлайн безкоштовного скасування (див. бізнес-правило вище) |
| `reverse_attendance(p_enrollment_id)` | → `(success, error_message)`. Повертає сесії, status=cancelled, sessions_used=0 |
| `cancel_class_and_restore_sessions(p_class_id)` | → `(success, restored_count, error_message)`. attended→повернути sessions_used; noshow→duration/60; enrolled→скасувати без повернення; is_cancelled=true |
| `restore_class(p_class_id)` | → `(success, restored_count, error_message)`. Зворотне до cancel. Перед викликом перевір `check_class_conflicts` |
| `generate_week(p_start_date, p_weeks=1)` | → `(classes_created, enrollments_created)`. Ідемпотентна (UNIQUE `uq_classes_series_date`). Прокидує series_clients в enrollments |
| `calc_trainer_salary_v2(p_trainer_id, p_start, p_end)` | Рядок на enrollment (attended+noshow). Ставка на дату заняття. Для `/settings/salary/calculations` |
| `check_class_conflicts(p_starts_at, p_duration_min, p_hall_id, p_trainer_id, p_exclude_id)` | Перетин по залу/тренеру |
| `check_client_conflict(p_client_id, p_class_id)` | Чи клієнт уже на паралельному занятті |
| `auth_role() → text` | Роль із JWT (`app_metadata.role`), дефолт `'client'`. Джерело правди для всіх RLS-політик |
| `current_client_id() / current_trainer_id() → uuid` | SECURITY DEFINER. Мапінг `auth.uid()`→доменний id для RLS-політик. Читають `clients`/`trainers` в обхід RLS (інакше рекурсія) |
| `normalize_phone_ua(p_phone) → text` | IMMUTABLE. Укр. номер → E.164 (`0XXXXXXXXX`→`+380XXXXXXXXX`, або 12-цифр `380…`→`+…`). NULL якщо некоректний. Вживає Route Handler онбордингу (Фаза 5) як єдине джерело формату телефону |
| `client_enroll(p_class_id)` | → `(success, enrollment_id, error_message)`. Клієнтський self-запис із кабінету. Гейт: роль=client, є оплачені заняття типу (`error='no_sessions'`), без конфлікту (`'conflict'`)/дубля (`'duplicate'`), **не в мінус**. Списання — потім, через auto_close |
| `client_cancel(p_enrollment_id)` | → `(success, charged, error_message)`. Клієнтська self-відміна. Перевіряє «це мій запис», делегує в `change_enrollment_status('cancelled')`. `p_force_no_charge` НЕдоступний |
| `auto_close_classes()` | pg_cron щохвилини. Модель «почалось = проведено»: закриває всі `enrolled` для занять із `starts_at <= now()` (без верхньої межі) через `mark_attendance` → `attended`, списує сесію (в мінус якщо нема). Непришедших адмін переводить у `noshow`/`cancelled` вручну постфактум. **Запис постфактум** (`enrollClient` у вже-минуле заняття) закривається одразу в `attended`, не чекаючи тик cron (cron лишається страховкою) |

---

## Карта коду — де що шукати (без grep по всьому проекту)

Централізовані осі. Нові місця беруть звідси, **не** оголошуй локальні копії:

- **Supabase-клієнт** → `lib/supabase.ts` (синглтон `export const supabase`, browser, `createBrowserClient<Database>`). Server Components → `lib/supabase-server.ts` (`createServerClient<Database>`). Generic `<Database>` обов'язковий — без нього клієнт нетипізований і весь шар запитів злітає в `any`.
- **Роль користувача** → `lib/auth/role.ts` (чистий, edge-safe): тип `Role`, `roleFromUser(user)` (дефолт `client`), `homePathForRole`, `isStaff`. Server → `lib/auth/getRole.ts` (`getRole()` з `getUser()`). Client → `hooks/useRole.ts` (`useRole()`, слухає auth-зміни). Доступ за маршрутами розводить `middleware.ts` (owner/admin → корінь; trainer → `/trainer`; client → `/client`). Не парсити `app_metadata.role` руками.
- **Усі запити до БД — читання І мутації — у `lib/queries/*.ts`.** Компоненти/хуки/сторінки **не** пишуть `.from()`/`.rpc()` напряму (інваріант, перевіряється `grep -rn "\.from(\|\.rpc(" app components hooks contexts | grep -v "lib/queries\|app/api\|Array.from"` → має бути порожньо; `app/api/**` Route Handlers зі service-role — легітимний виняток, див. нижче). Кожна query-функція: перший аргумент `supabase: Db` (**НЕ** голий `SupabaseClient` = `<any>` → стирає типізацію; `Db = SupabaseClient<Database>` у `lib/queries/_db.ts`, там же `Row/Insert/Update<'table'>`-хелпери), повертає `{ …, error: string | null }` (success/error_message-RPC → через `callRpc`). Компонент тримає лише UI-оркестрацію (toast/setError/форматування повідомлень). `accounting.ts` — feed звірки; conflict-check / week-gen / series+series_clients CRUD / class insert-update-delete — у `classes.ts`; combobox-пошук+`getClientBalance` — у `clients.ts`; cash-надходження за день — у `dashboard.ts`. **Кабінети:** `client-cabinet.ts` (RPC `clientEnroll`/`clientCancel`), `client-cabinet-data.ts` (`getMyClient`/`listMySessionBalances`/`listMyUpcomingEnrollments`), `trainer-cabinet.ts` (`getMyTrainer`/`listMyUpcomingClasses`). **Онбординг логіну:** `client-login.ts` (`createClientLogin(clientId)`) — `fetch` до серверного Route Handler (не RPC).
- **⚠️ Серверні Route Handlers зі service-role — лише в `app/api/**`.** Створення `auth.users` (логіни клієнтів/тренерів) потребує `SUPABASE_SERVICE_ROLE_KEY` (`createClient<Database>(url, serviceKey)` + `auth.admin.createUser`), який НЕ можна світити в браузер → robиться у Route Handler, не в `lib/queries`/компоненті. Зараз два:
  - `app/api/admin/create-client-login/route.ts` (Фаза 5) — гейтить `isStaff` через `getRole()`, читає телефон з `client_contacts`, нормалізує через `normalize_phone_ua()`, перевіряє `clients.user_id IS NULL` (UNIQUE `clients_user_id_key`) + що номер не зайнятий, створює auth-юзера з `app_metadata.role='client'`, привʼязує `clients.user_id`. Identifier = телефон (E.164 `+380…`).
  - `app/api/admin/create-trainer-login/route.ts` — те саме для тренера, `role='trainer'`, таблиця `trainers`. Контакти живуть у самій `trainers` (`phone`/`email`), тож читає їх звідти; ідентифікатор — телефон у пріоритеті (нормалізує через `normalize_phone_ua`), інакше `email`. UNIQUE `trainers_user_id_key`/`trainers_phone_key`/`trainers_email_key`. Frontend — `createTrainerLogin()` у `lib/queries/trainer-login.ts`, кнопка «Створити кабінет» у `TrainerModal` (edit-режим).
  - Обидва: зараз логін+пароль (адмін шле в директ), далі — OTP по SMS на той самий `auth.users.phone`; middleware відсікає не-staff на `/api/**` (редирект). Виняток з інваріанта «всі `.from()`/`.rpc()` у `lib/queries`»: admin-клієнт у Route Handler пише напряму.
  - **Скидання пароля = той самий endpoint.** Якщо `user_id` уже заповнений, handler НЕ повертає `already_linked`, а генерує новий пароль (`auth.admin.updateUserById`) і повертає `{login, password, reset:true}`. Пароль ніде не зберігається (Supabase хешує) — показати старий неможливо, тому «скинути» = згенерувати новий (старий перестає діяти). Кнопка «Скинути пароль» у картці клієнта (`resetMode`) і в `TrainerModal` (коли кабінет активний). `create*Login()` повертає прапорець `reset` для адаптації тексту в UI.
- **⚠️ Row-типи запитів — ВИВОДИТИ зі схеми через `QueryData<typeof query>`, НЕ оголошувати руками.** Патерн: винести select у `const X_SELECT = '…' as const`, query-функцію `function xQuery(supabase: Db) { return supabase.from('t').select(X_SELECT) }`, тип `export type XRow = QueryData<ReturnType<typeof xQuery>>[number]`. `as unknown as RowType` у шарі queries = **заборонено** (було 31, тепер 0). Винятки-приведення лише обґрунтовані: (а) **union-звуження** доменом (`payment_method`/`direction`/`enrollment_status` — БД `text`, форма/CHECK звужує) через `Omit<…, 'f'> & { f: Union }` + `as` (НЕ `as unknown as`) на межі; (б) `cash_holder!` після `.not('cash_holder','is',null)`-фільтра (TS не звужує).
  - **⚠️ `select` має бути СТАТИЧНИМ літералом (`as const`), без template `${}`.** QueryData парсить embed лише зі статичного рядка — `trainers!${TRAINER_FK.sales}(name)` (template) → тип стає `string` → весь row = `GenericStringError`. Тому FK на двофкових таблицях **вшито рядком-літералом** (`trainers!sales_trainer_id_fkey(name)`) + compile-time guard `const _x: typeof TRAINER_FK.sales = 'sales_trainer_id_fkey'`.
- **RPC-розпаковка** → `callRpc()` у `lib/rpc.ts`. Усі обгортки success/error_message-RPC йдуть через нього (НЕ переписувати `data?.[0]?.success` руками). Data-RPC (calc_trainer_salary*, check_*) — без нього.
- **⚠️ Embed `trainers(...)` на `sales`/`studio_expenses`/`trainer_payments` — явний FK обов'язковий.** Ці три таблиці мають ДВА FK на `trainers` (`trainer_id` + `cash_holder`), тому голий `trainers(name)` → рантайм «Could not embed because more than one relationship was found». **У QueryData-запитах FK вшито рядком-літералом** (`trainers!sales_trainer_id_fkey(name)`, бо template `${TRAINER_FK.sales}` ламає виведення типу — див. вище) + compile-time guard проти `TRAINER_FK.{sales,expenses,payments}` (`lib/queries/_fk.ts`). Імена FK: `sales_trainer_id_fkey` / `studio_expenses_trainer_id_fkey` / `trainer_payments_trainer_id_fkey`. Решта таблиць (classes/enrollments/trainer_rates/class_series) мають один FK → голий `trainers(name)` ок. Перевірка: `grep -rn "trainers(" lib/queries/{sales,studio-expenses,accounting,trainer-rates}.ts | grep -v "_fkey\|_fk.ts\|TRAINER_FK" | grep "trainers("` → лише single-FK-таблиці (trainer_rates).
- **Підтягування даних у компонент** — НЕ писати руками триаду `useState(data/loading/error)+useEffect+fetch`. Бери готовий хук:
  - **список (з фільтрами/пагінацією)** → `useListQuery(fetcher, deps, {realtime?, refetchOnVisible?})` у `hooks/useListQuery.ts` → `{data, total, loading, error, refetch}`. `fetcher` замикає актуальні deps і повертає `{data, count?, error}` (готова query-функція з `lib/queries`). Сам гасить застарілі відповіді (AbortController), підписку realtime і refetch при поверненні вкладки. Приклади: `useSales`, `useSeriesTemplates`, `/journal`, `/clients`, дашборд-блоки списків.
  - **одне значення/об'єкт (НЕ список)** → `useAsync(fetcher, deps, {realtime?})` у `hooks/useAsync.ts` → `{data, loading, error, refetch}` (`data: T|null`). Для агрегатів-карток дашборду (`MoneyCardsBlock`, `AlertCardsBlock`). Кілька джерел → fetcher повертає один derived-об'єкт.
  - **довідкова сутність з toggle** → `useRefEntity` (нижче).
  - Винятки (свій fetch лишається): сторінки з кількома незалежними списками + оптимістичними мутаціями (`/accounting` — sales+expenses+payments), складні мульти-джерельні (`/schedule`, `/clients/[id]`, salary). `useRealtime([])` — no-op (idle-канал не створюється).
- **Довідкові сутності** (halls/trainers/tickets/training_types — `{id,…,is_active}`) → query через фабрику `refEntityQueries(table, columns, {orderBy})` у `lib/queries/_refEntity.ts` (list/listActive/toggle/insert); хук через `useRefEntity(table, listFn, toggleFn)` у `hooks/useRefEntity.ts` (`{data,loading,fetchError,toggling,toggle,refetch}`). Іменовані хуки (`useHalls` тощо) — тонкі обгортки, що перейменовують `data`→`halls`. Кастомні запити (Labels, custom insert) — поруч у файлі сутності.
- **Довідники** (tickets/trainers/halls/trainingTypes) → `contexts/RefsContext.tsx` через `useRefs()`. Не тягнути props зі сторінок. Має `refetch*` для оновлення після мутацій у налаштуваннях.
- **Лейбли+класи бейджів** (статуси enrollment, методи оплати, короткі типи) → `lib/badges.ts`. `enrollmentStatusClass`/`paymentClass` повертають готовий `'badge badge-cash'` → у `className` напряму. CSS бейджів — у `globals.css`. Лейбли статусів — дієслова (Записалась/Відвідала/Не прийшла/Скасувала/Черга). `personal_card` = «Картка».
- **Повні людські назви типів занять** → `label` з БД (RefsContext / `listTrainingTypeLabels`), НЕ хардкод. Короткі ярлики для звітів → `ticketTypeShortLabel` у badges.ts. Абревіатури-значки (1–2 латинські літери: G/I/ID/IT/H/SH/P/S) для overview-розкладу на мобільному → `ticketTypeAbbr` у badges.ts (fallback = 1-ша літера коду).
- **KPI-картка** (число + підпис, сітка карток) → `StatCard` (`components/ui/StatCard.tsx`). `value` передавати **вже форматованим** (через `formatMoney` тощо), опційні `hint`/`href`/`accent`/`loading` (скелет замість value — не плодити `'…'`-рядки під час завантаження). Не плодити локальні `.balanceBlock`/`.summary`-копії.
- **Дашборд-запити** (агрегати «на сьогодні») → `lib/queries/dashboard.ts`: `getMoneyTotalsForDate` (продажі по методах + витрати/доходи), `listNegativeBalanceClients` (view `clients_negative_balance`), `listSessionDebtorsForDate` (боржники по сесіях **агрегатно, 3 запити, без N+1** — класи→enrollments по `class_id IN`→баланси по `client_id IN`), `listHallBusyIntervalsForDate`. Чиста логіка групування звіту боржників — `lib/dashboardReport.ts`. Готівка тренерів — `listAllCashBalances` (≈4 запити на всіх, НЕ N×getTrainerCashBalance*). Блок «вільні місця» — з `listClassesForDate`/`listEnrolledCountsForDate`. Не дублювати.
- **Гроші (формат)** → `formatMoney(n)` у `lib/formatters.ts` («1 000 ₴»). Знак ± і «—» для 0 — на місці виклику.
- **Дати display** → `lib/formatters.ts`: `formatDate` (ДД.ММ.РРРР), `formatDateShort` (ДД.ММ), `formatDateYY` — вхід ISO/Date (через `new Date`). Дата → РРРР-ММ-ДД для `<input type=date>` → `toYMD`/`isoToYMD` у `lib/dateUtils.ts`. ⚠️ Для РРРР-ММ-ДД-рядка (значення date-picker'ів) display і parse — split-based у `lib/dateUtils.ts`: `ymdToDisplay` (→ДД.ММ.РРРР) і `parseYMD` (→Date local-midnight), БЕЗ `new Date(ymd)` (TZ-ризик). Не писати `getFullYear()+padStart` локально.
- **⚠️ Дні тижня — ДВІ конвенції** в `lib/dateUtils.ts`: `DOW_LABELS_SHORT/FULL` (0=Нд, індексувати значенням `day_of_week` з БД) vs `WEEKDAYS_SHORT/FULL` (0=Пн, для заголовків сітки). JS `Date` → Monday-based через `dowMondayIndex(date)`. Не плутати.
- **Місяці** → `MONTHS_UK_SHORT/FULL/CAP` у `lib/dateUtils.ts` (`CAP` = з великої літери, для заголовків календарів CalendarPopover/SalesDateRangePicker).
- **Метрики розкладу** (capacity/waitlist/fill) → `lib/scheduleMetrics.ts` (`getActiveCount`, `getWaitlistCount`, `isFull`, `isAlmost`, `fillPct`; для шаблонів — `*ClientCount*`). Не дублювати формули.
- **Ефективний баланс сесій** (скільки буде з урахуванням заняття, для відображення в рядку enrollment) → `effectiveSessionBalance(raw, status, sessionsUsed, hours)` у `lib/scheduleMetrics.ts`. `enrolled` → `raw − cost` («як буде»); вже-списані/waitlist/cancelled → `raw`. Вживається в ClassDetailModal і ClassDetailClient.
- **Validation-повідомлення** → `lib/validation-messages.ts` (`VM.required.*`/`VM.invalid.*`). Усі zod/RHF беруть звідси.
- **Empty-state тексти** → `lib/messages.ts` (`MSG.empty.*`). Повторювані toast-рядки — `MSG.toast.*` (`saved`/`copied`/`copyFailed`/`deleteFailed`). Одиничні доменні toast-літерали лишаються на місці (виносимо лише з другим використанням).
- **Кольори типів занять** → `lib/typeColor.ts`.
- **isMobile** → `hooks/useIsMobile.ts` (matchMedia, breakpoint 640px). Не дублювати `window.innerWidth`.
- **Realtime** → `lib/useRealtime.ts` (debounce 300ms, JWT обов'язковий для RLS-таблиць).
- **Типи домену** → `types/index.ts`. Авто-ген типи БД → `types/database.types.ts`.

Ще НЕ централізовано (чекає на друге місце перед виносом): `TX_LABELS` (типи balance-транзакцій, у ClientModal).

---

## Як додати N (scaffold-шляхи)

Готові шаблони з робочим кодом — у `docs/templates/`. Не винаходити з нуля:

- **Нова форм-модалка** → копіювати `TrainerModal` (RHF + FormField + ModalShell + ModalFooter + VM). **НЕ** `SaleModal` (спец-логіка `useSaleForm`/`useSaleSubmit`). Покроково — **[docs/templates/new-modal.md](docs/templates/new-modal.md)**.
- **Нова довідкова сутність** (таблиця `{id,…,is_active}` + сторінка в /settings) → міграція (RLS+policy+GRANT, інакше deny-all) → `sync:schema` → `refEntityQueries` → `useRefEntity`-обгортка → модалка → `RefEntityPage`. Повний чекліст — **[docs/templates/new-feature.md](docs/templates/new-feature.md)**.
- **Нова /settings сторінка-довідник** → `RefEntityPage` (`app/settings/_RefEntityPage.tsx`) + масив `RefColumn`, образець — `app/settings/halls/page.tsx` (29 рядків). Editable (inline-редагування) → prop `editable` + модалці `existing={editing}`, образець — `training-types`.
- **Новий RPC-виклик** (success/error_message) → обгортка в `lib/queries/`, розпаковка через `callRpc()` (`lib/rpc.ts`).
- **Type-check під час активного `npm run dev`** → `npx tsc --noEmit` (НЕ `npm run build` — ділить `.next` з dev, ламає чанки).

---

## Frontend

UI-компоненти, модалки, CSS-система, layout і per-page mobile-адаптація — у **[docs/FRONTEND.md](docs/FRONTEND.md)**. Коротко:

- Усі модалки через `ModalShell` + `ModalFooter` + `FormField` (`components/ui/`).
- Shared page layout через класи `.page-layout/.page-main/.page-head/.page-body/.page-foot` у `globals.css` — нова сторінка не задає margin/height/overflow вручну. Виняток: `/schedule*` має власну scroll-архітектуру.
- CSS Modules + Tailwind співіснують; нове — Tailwind. У `*.module.css` — лише `var()`-токени, ніяких HEX/rgba. Бордери `1px` (не `0.5px` — баг Chrome mobile).
- Toast → `sonner`. Іконки навігації → `components/icons/navigation.tsx`.

---

## Сторінки

| Route | Призначення |
|-------|-------------|
| `/login` | Авторизація |
| `/dashboard` | Операційний пульт на сьогодні. Зони згори вниз: **гроші** (KPI-картки по методах: готівка/ФОП/картка/депозит/витрати) → **алерти** (картки: боржники по сесіях, мінус по депозиту) → **боржники по сесіях** (згортається, +копія звіту тренерам) → **розклад** (вільні місця, вільні слоти залів 8:00–22:00, готівка тренерів). Головна після логіну |
| `/sales` | Продажі + кнопка «+ Витрата/Дохід» (studio_expenses). Фільтр дат |
| `/clients`, `/clients/[id]` | База клієнтів; профіль (депозит, залишки занять, покупки, записи). У картці «Контакти» — кнопка «Створити кабінет» (Фаза 5): створює логін по телефону → модалка з логіном+паролем для копіювання; якщо кабінет уже є — бейдж «Кабінет активний» |
| `/schedule` | Розклад день/тиждень. Деталі заняття — `ClassDetailModal` (модалка, не сторінка), відкривається кліком тут / у /journal / картці клієнта / дашборді. Навігація назад ≤30 днів |
| `/schedule/templates` | Шаблони тижня (HallWeekGrid), постійники, «виставити тиждень» |
| `/journal` | Минулі заняття (`starts_at < today`), фільтри, пагінація → ClassDetailModal |
| `/accounting` | Звірка з банком: feed sales+expenses+payments, картки підсумків, чекбокси |
| `/settings/salary/rates`, `/settings/salary/calculations` | Ставки тренерів; нарахування зп (період → заняття, готівка на руках, виплати) |
| `/settings/{tickets,trainers,halls,training-types}` | Довідники: активні + архів. `trainers` — editable (TrainerModal: імʼя, телефон, email, соцмережі) + кнопка «Створити кабінет» у модалці (логін тренеру по телефону/email) |
| `/trainer` | **Кабінет тренера** (MVP): свій майбутній розклад (read-only). Зона trainer (доступна й owner/admin). Без Sidebar — `CabinetHeader` із виходом |
| `/client` | **Кабінет клієнта** (MVP): депозит, залишки занять по типах, мої майбутні записи + self-відміна (`client_cancel`, з попередженням про списання). Запис на нові заняття — наступна ітерація. Зона client |
| `/` | Редирект за роллю (middleware): owner/admin → `/dashboard`, trainer → `/trainer`, client → `/client`; не залогінений → `/login` |
| `/settings`, `/tickets`, `/trainers`, `/halls`, `/training-types`, `/accounting/trainers*`, `/schedule/[classId]` | Редиректи (`/schedule/[classId]` → `/schedule`: старі посилання на деталі заняття, тепер модалка) |

