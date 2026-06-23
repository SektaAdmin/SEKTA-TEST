# План: ролі та особисті кабінети

> Статус: джерело правди для переходу від моделі «всі залогінені = повний доступ» до рольової
> моделі з кабінетами тренера і клієнта. Виконуємо фазами; кожна фаза безпечна сама по собі
> (адмінка працює весь час).
>
> **Прогрес:** ✅ Фаза 0 (anon-витічка закрита) · ✅ Фаза 1 (фундамент: `auth_role()`,
> `user_id`) · ✅ Фаза 2 (контакти в `client_contacts` + view `clients_with_contacts`
> security_invoker; перевірено: trainer 0 телефонів, owner 526) · ✅ Фаза 3 (RLS по ролях:
> хелпери `current_client_id()`/`current_trainer_id()`, усі доменні таблиці переписані на
> `owner_admin_all` + trainer/client-політики; перевірено симуляцією JWT: owner бачить усе,
> trainer 0 контактів/продажів/витрат, привʼязаний client — лише свій рядок) · ✅ Фаза 4
> (хелпери ролі `lib/auth/*`+`useRole`; middleware за роллю; admin-обмеження в RLS — ЗП owner-only,
> довідники admin SELECT-only; клієнтські RPC `client_enroll`/`client_cancel`; MVP-кабінети
> `/trainer` і `/client`; префікс-шляхи; перевірено симуляцією: admin без ЗП/без write-довідників,
> client_enroll happy+no_sessions) · ✅ Фаза 5 (онбординг: логін по телефону з картки клієнта,
> Route Handler зі service-role, `clients.user_id` UNIQUE, `normalize_phone_ua()`; дублі неможливі
> by design — кабінет лише з наявної картки). **Усі фази переходу завершені.**

## Контекст і чому це робиться

Зараз CRM — внутрішній інструмент для адміна: 2 користувачі в `auth.users`, усі RLS-політики
`authenticated_all USING(true)` (інваріант #9). Це безпечно, поки всі залогінені — довірені адміни.

Мета: відкрити доступ **тренерам** і **клієнтам** (особистий кабінет). У поточній моделі перший же
залогінений клієнт побачить усе — чужі баланси, виручку, зарплати. Тому **модель доступу — фундамент**,
її треба перебудувати ДО написання кабінетів. Після кабінетів змінювати в 10 разів дорожче.

---

## Ролі (узгоджено через інтерв'ю)

| Роль | Бачить | Змінює |
|------|--------|--------|
| **owner** (власник) | усе | усе |
| **admin** (ресепшен) | усе, **крім зарплат** | усе, **крім** зарплат і налаштувань-довідників (зали / типи тренувань / тарифи) |
| **trainer** | розклад цілком (чуже — read-only), своя ЗП + своя готівка на руках, усіх клієнтів **без контактів** | лише свої заняття (CRUD) + запис/виписка клієнтів **на свої** заняття |
| **client** | свій депозит, залишок занять, свій розклад/записи, історія покупок і відвідувань, **свої** контакти, ціни тарифів | запис (якщо є оплачені заняття потрібного типу) / відміна (з попередженням про списання після дедлайну) |

### Уточнені бізнес-правила (з інтерв'ю)

- **Контакти від тренера приховані по-справжньому** (рішення A1): телефон/інстаграм/телеграм виносимо
  в окрему таблицю `client_contacts`, RLS лише для owner/admin. Тренер не дістане їх навіть через консоль.
- **Клієнт відміняє після дедлайну** → дозволено, але з попередженням «заняття буде списано» перед
  підтвердженням (без розвилки no-charge — це привілей лише адміна через `p_force_no_charge`).
- **Клієнт записується без оплачених занять** → заборонено («немає оплачених занять, купіть абонемент»).
  НЕ пускати в мінус (мінус — лише авто-закриття адмінського запису).
- **Один тренер на заняття** (`classes.trainer_id`). Заміна = зміна значення. Нічого не додаємо.
- **Усім клієнтам потрібні логіни.** Механіку онбордингу (як саме клієнт отримує логін і привʼязується
  до картки) проєктуємо окремо — Фаза 4.

---

## Модель ролі в БД

Роль зберігаємо в **`auth.users.raw_app_meta_data.role`** (`owner` / `admin` / `trainer` / `client`).

Чому `app_metadata`, а не колонка в таблиці:
- користувач **не може** змінити її сам (на відміну від `user_metadata`) — це безпечно;
- вона потрапляє в JWT → RLS читає її дешево, без джойнів на кожен рядок.

Хелпер у БД (єдине джерело правди для всіх політик):

```sql
create or replace function auth_role() returns text
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role'),
    'client'  -- дефолт найменш привілейований: незнайома роль = клієнт
  );
$$;
```

Зв'язок логіна з доменом (nullable — наявні картки без логіна продовжують жити):
- `clients.user_id uuid references auth.users(id)` — хто з клієнтів має кабінет
- `trainers.user_id uuid references auth.users(id)` — який тренер за яким логіном

---

## ФАЗИ

### Фаза 0 — закрити поточну витічку (окремо від ролей, безпечно, робиться першою)

В БД зараз висять ДВІ зайві політики, що дають доступ **анонімам** (незалогіненим):
- `sales` → `"sales: anon can read" SELECT USING(true)` — анонім читає **всю виручку**
- `tickets` → `"tickets: anon can read" SELECT USING(true)` — анонім читає тарифи

Це витічка незалежно від кабінетів (спадок налагодження). Видалити обидві.
Адмінка ходить як `authenticated` → не помітить.

```sql
drop policy if exists "sales: anon can read" on sales;
drop policy if exists "tickets: anon can read" on tickets;
```

**Перевірка:** залогінений адмін бачить продажі/тарифи як раніше; анонімний запит → 0 рядків.

---

### Фаза 1 — фундамент ролей у БД (фронт ще не чіпаємо)

1. Створити `auth_role()` (вище).
2. `alter table clients add column user_id uuid references auth.users(id);`
   `alter table trainers add column user_id uuid references auth.users(id);`
   (+ індекси по `user_id`).
3. Наявним користувачам проставити роль. У БД їх двоє: `sekta-admin-owner@proton.me` (реальний
   власник) і `e2e@sekta.test` (Playwright-бот). Обидва → **owner** (щоб смоук-тести бачили весь
   функціонал після введення RLS). Реальних адмінів-ресепшенів поки немає — заведуться окремо.
4. `npm run sync:schema` → оновити `types/database.types.ts`.

Після Фази 1 **поведінка не змінюється** — політики ще `USING(true)`. Це лише підготовка ґрунту.

---

### Фаза 2 — винести контакти (рішення A1)

Контактні поля в `clients` зараз: **`phone`, `instagram_username`, `telegram_username`**.
Імʼя (`first_name`/`last_name`) і `balance` лишаються в `clients` (тренер їх бачить).

1. Міграція:
   ```sql
   create table client_contacts (
     client_id uuid primary key references clients(id) on delete cascade,
     phone text,
     instagram_username text,
     telegram_username text
   );
   -- перенести наявні дані
   insert into client_contacts (client_id, phone, instagram_username, telegram_username)
   select id, phone, instagram_username, telegram_username from clients;
   -- RLS: лише owner/admin
   alter table client_contacts enable row level security;
   create policy owner_admin_all on client_contacts for all to authenticated
     using (auth_role() in ('owner','admin')) with check (auth_role() in ('owner','admin'));
   grant select,insert,update,delete on client_contacts to anon, authenticated;
   -- ⚠️ колонки в clients НЕ дропаємо одразу — спершу мігруємо код (крок 3), потім окремим комітом drop
   ```
2. `npm run sync:schema`.
3. Оновити `lib/queries/clients.ts` — усе читання/запис контактів перевести на `client_contacts`
   (точки: `listClients` select, пошук по phone в combobox, `createClient`/`updateClient`,
   дублікат-чек по phone). Компоненти `ClientModal` і `ClientDetailClient` — лише UI, дані беруть з queries.
4. Після зеленого білда — окремим комітом `alter table clients drop column phone, drop column ...`.

**Чому контакти окремою фазою, до RLS-по-ролях:** щоб «тренер не бачить телефон» працювало на рівні БД,
телефон має фізично жити в таблиці, куди тренеру закрито доступ. Спершу розділяємо дані, потім роздаємо ролі.

---

### Фаза 3 — переписати RLS по ролях (таблиця за таблицею)

Для кожної доменної таблиці замість єдиної `authenticated_all USING(true)` — політики під ролі.
Робимо ПО ОДНІЙ таблиці, після кожної перевіряємо, що адмінка не зламалась.

Орієнтовна матриця (деталі уточнюємо на кроці кожної таблиці):

| Таблиця | owner | admin | trainer | client |
|---------|-------|-------|---------|--------|
| `clients` | ALL | ALL | SELECT (без контактів — вони вже в окремій таблиці) | SELECT свій (`user_id = auth.uid()`) |
| `client_contacts` | ALL | ALL | — | SELECT свій |
| `sales` | ALL | ALL | — | SELECT свій |
| `balance_transactions` | ALL | ALL | — | SELECT свій |
| `client_session_balances` | ALL | ALL | SELECT | SELECT свій |
| `enrollments` | ALL | ALL | SELECT усі + INSERT/UPDATE/DELETE лише на свої заняття | SELECT свій + запис/відміна свій (через RPC, правила нижче) |
| `classes` | ALL | ALL | SELECT усі + CRUD лише `trainer_id = me` | SELECT (розклад) |
| `trainer_payments` | ALL | — (admin не бачить ЗП) | SELECT свій | — |
| `trainer_rates` | ALL | — | SELECT свій | — |
| `studio_expenses` | ALL | ALL | — | — |
| `halls` / `training_types` / `tickets` | ALL | SELECT (admin не редагує довідники) | SELECT | SELECT (ціни) |

> ⚠️ Тонкощі, які вирішуємо під час Фази 3, не зараз:
> - «trainer редагує лише свої заняття» — `USING (trainer_id = (select id from trainers where user_id = auth.uid()))`.
>   Кеш/продуктивність перевірити (можливо, тренерський `trainers.id` класти теж у JWT).
> - admin без зарплат: політики `trainer_payments`/`trainer_rates` віддають лише `auth_role() in ('owner','trainer-self')`.
> - admin не редагує довідники: на `halls`/`training_types`/`tickets` для admin лише SELECT,
>   INSERT/UPDATE — `auth_role() = 'owner'`.

**Інваріант #9 у CLAUDE.md переписується** в цій фазі: з «усі = повний доступ» на «доступ за роллю через `auth_role()`».

#### Як зроблено (фактичний стан після Фази 3)

- Хелпери `current_client_id()` / `current_trainer_id()` — SECURITY DEFINER, stable, `search_path=public,pg_temp`,
  мапінг `auth.uid()`→`clients.id`/`trainers.id` (DEFINER, бо читають ці ж таблиці в обхід RLS — інакше рекурсія).
  `revoke from public` + `grant execute to authenticated`.
- **owner+admin поки рівні** — обидва `owner_admin_all` (`auth_role() in ('owner','admin')` FOR ALL).
  Обмеження admin із матриці (без `trainer_payments`/`trainer_rates`, лише SELECT на `halls`/`training_types`/`tickets`)
  **відкладено на Фазу 4** — реальних admin-логінів ще немає, а звуження зараз ризикує зламати робочу owner-адмінку.
- trainer/client write-флоу через `SECURITY DEFINER` RPC (`change_enrollment_status`, `mark_attendance` тощо)
  обходить RLS; прямий INSERT enrollment (`enrollClient`) — INVOKER → під RLS, тому trainer має write-політики
  на `classes`/`enrollments` лише для своїх занять.
- `series_clients` (шаблони серій) — owner/admin ALL + trainer SELECT; client доступу не має (бачить `enrollments`, не шаблони).
- Перевірка — симуляція `set request.jwt.claims` + `set local role authenticated` у транзакції з rollback (без реальних логінів).

---

### Фаза 4 — кабінети у фронті + RPC для клієнтських дій

> Рішення (інтервʼю 2026-06-03): **префікс-шляхи** (не route-групи), **MVP-кабінети** (решта
> ітеративно), **admin-обмеження в RLS — у цій фазі**.

1. **Маршрути — префікс-шляхи:** адмін-сторінки лишаються в корені (`/dashboard`, `/sales`, …);
   додаємо `app/trainer/*` і `app/client/*`. (Sidebar/BottomNav рендеряться per-page, не в
   root-layout, тож масовий git-move сторінок не потрібен.)
2. **Хелпер ролі:** `lib/auth/role.ts` — server `getRole()` (з `getUser().app_metadata.role`,
   union `owner|admin|trainer|client`, дефолт `client`) + клієнтський `useRole()`.
3. **Middleware за роллю:** після `getUser()` читає роль → матриця «роль → дозволені шляхи» →
   недозволений шлях редіректить у домашню зону ролі. Виправити дефолтний редирект з `/sales` на
   `/dashboard` (owner/admin), `/trainer` (trainer), `/client` (client). Login-редирект — теж за роллю.
4. **Sidebar/BottomNav за роллю:** owner — усе; admin — без «Зарплати»; trainer/client — свій набір.
5. **MVP-кабінети:**
   - trainer: `/trainer` — свій розклад (read-only чужого, дії на свої заняття через наявні RPC).
   - client: `/client` — депозит, залишок занять, свій розклад/записи, запис/відміна.
6. **RPC для клієнтських дій** (логіка в БД, `SET search_path = public, pg_temp`, розпаковка `callRpc`):
   - `client_enroll(p_class_id)` — роль=client; є оплачені заняття потрібного типу (інакше
     `success=false, error='no_sessions'`); немає конфлікту; INSERT enrollment. **Не пускати в мінус.**
   - `client_cancel(p_enrollment_id)` — застосовує `cancellation_deadline`; після дедлайну зі списанням
     (фронт показав попередження). `p_force_no_charge` НЕдоступний.
7. **RLS: admin-обмеження** (окрема міграція) — звузити admin: `trainer_payments`/`trainer_rates` →
   owner-only; `halls`/`training_types`/`tickets` → admin лише SELECT, INSERT/UPDATE/DELETE owner-only.
   Інваріант #9 у CLAUDE.md оновити (admin ≠ owner у RLS).
8. **Перевірка:** симуляція JWT (admin/trainer/client) + ручний прохід адмінки; build зелений.

#### Як зроблено (фактичний стан після Фази 4)

- **Хелпери ролі:** `lib/auth/role.ts` (чистий/edge-safe: `Role`, `roleFromUser`, `homePathForRole`,
  `isStaff`), `lib/auth/getRole.ts` (server), `hooks/useRole.ts` (client, слухає auth-зміни).
  `server-only` пакет НЕ встановлено — getRole серверний завдяки `next/headers` усередині
  `createServerSupabase` (не імпортувати `server-only`, build впаде).
- **Middleware:** `canAccess(role, path)` — `/trainer*`→trainer|staff, `/client*`→client|staff,
  решта→staff. `/` і `/login` редіректять у `homePathForRole`. Login-сторінка тепер шле на `/` (роль
  розводить middleware), не хардкод `/sales`.
- **RLS admin-обмеження:** `trainer_payments`/`trainer_rates` → `owner_all` (owner-only);
  `halls`/`training_types`/`tickets` → `owner_all` + `staff_ref_select` (admin/trainer/client SELECT).
  Поточні логіни обидва owner → робоча адмінка не зачеплена. Перевірено: admin read довідників ✅,
  UPDATE tickets = 0 рядків ✅, payments/rates = 0 ✅; owner UPDATE tickets = 1 ✅.
- **Клієнтські RPC** (`SECURITY DEFINER` + self-перевірка `current_client_id()`): `client_enroll`
  (гейт no_sessions/conflict/duplicate, не в мінус, списання потім через auto_close), `client_cancel`
  (делегує в `change_enrollment_status('cancelled')`). Обгортки — `lib/queries/client-cabinet.ts`.
  Перевірено: happy enroll ✅, no_sessions ✅, чужий enrollment відсікає RLS+RPC ✅.
- **Кабінети:** `/trainer` (свій майбутній розклад) і `/client` (депозит, залишки по типах, майбутні
  записи + self-відміна). Серверні сторінки + `CabinetHeader` (вихід), без Sidebar. Запис клієнта на
  нові заняття (browse розкладу) — свідомо відкладено на наступну ітерацію.

> ⚠️ Спадковий ризик (поза Фазою 4): старі RPC `change_enrollment_status`/`mark_attendance`/
> `cancel_class_and_restore_sessions`/`reverse_attendance` обходять RLS (DEFINER). Anon-доступ відтоді
> закрито (EXECUTE лише `authenticated`+`postgres`; видно `authenticated` — advisor 0029, гейт
> `can_manage_enrollment()` відсікає). Актуальний стан сигналів → [SECURITY.md](SECURITY.md).

---

### Фаза 5 — онбординг клієнтів

**Рішення: лише запрошення адміном, identifier = телефон. Самореєстрації немає.**

Чому так (з даних бази на момент рішення): з 1575 клієнтів телефон лише в ~33%, email у схемі
взагалі немає (тільки phone/instagram/telegram), 7 номерів спільні (діти на номері батьків).
Тому: матчинг по телефону покрив би лише третину й не унікальний → автоматичну/гібридну
саморегистрацію відкинули. Канал доставки — Instagram/Telegram директ (ручний).

**Як зроблено:**
- Кабінет створюється **лише з наявної картки `clients`** (`/clients/[id]`, картка «Контакти»,
  кнопка «Створити кабінет»). Дублі `clients` неможливі by design — немає шляху «реєстрація з нуля».
- Серверний Route Handler `app/api/admin/create-client-login/route.ts` (перший `app/api/**` у проєкті):
  гейт `isStaff` через `getRole()`; читає телефон з `client_contacts`; нормалізує
  `normalize_phone_ua()` (`0XX…`→`+380XX…`); перевіряє `clients.user_id IS NULL`
  (UNIQUE `clients_user_id_key`) і що номер не зайнятий іншим `auth.users`; `auth.admin.createUser`
  з `phone`+`password`+`app_metadata.role='client'`; привʼязує `clients.user_id`; на помилці привʼязки
  відкочує auth-юзера. Потребує `SUPABASE_SERVICE_ROLE_KEY` (не світиться в браузер).
- Frontend: `lib/queries/client-login.ts` (`createClientLogin`) → `fetch`. Успіх → модалка з готовим
  текстом «Логін/Пароль» + кнопка «Скопіювати» (адмін шле в директ). Якщо кабінет уже є — бейдж.
- **Спільний номер (діти):** один номер = один кабінет. Дитина на номері батьків отримає кабінет
  пізніше, коли їй поставлять власний номер (`phone_taken` поки блокує — це очікувано, не баг).
- **Без телефону (67%):** кнопка disabled, поки адмін не додасть номер. Природний фільтр.
- **Вхід:** зараз логін(телефон)+пароль. Далі — OTP по SMS (`signInWithOtp({phone})`) на той самий
  `auth.users.phone`, без переробок (потрібен лише SMS-провайдер).

---

## Порядок виконання (рекомендований)

Фаза 0 → 1 → 2 → 3 (по таблиці) → 4 → 5. Кожна — окремий коміт (або кілька), build зелений на кожному.
Фази 0–3 не дають видимих змін адміну (крім зникнення витічки) — це навмисно: фундамент кладемо
непомітно, кабінети зʼявляються лише у Фазі 4.

## Що НЕ робимо (щоб не палити сили)

- Не будуємо кабінети раніше за RLS (Фаза 4 — після Фази 3).
- Не ховаємо контакти «на фронті» (відкинули A2 на користь A1 — справжня межа в БД).
- Не закладаємось на масштаб, якого не буде (мікросервіси/черги/кеші — ні).
- Не переписуємо робочий CSS/UI заради чистоти.
