# Стрес-тест і аудит уразливостей кабінету клієнта — 2026-10-13

> **Статус (2026-10-13):** #1, #3, #4a, #4b, #6 — ВИПРАВЛЕНО (міграції `20261013_*`, код; деталі в
> `docs/SECURITY.md` §«Закриті»). #2 (овербукінг) — свідомо accepted (специфіка студії). #5 (self-signup
> увімкнено) — потребує дії оператора в дашборді Supabase Auth (вимкнути signups).

Поверхня: `/client/**`, RPC `client_enroll`/`client_cancel`, RLS під роллю `client`.
Метод: емуляція JWT клієнта в БД (`set role authenticated` + `set request.jwt.claims` з реальним
`sub`/`app_metadata.role`), прямі виклики RPC/SELECT через Supabase MCP на прод-проєкті
`ukjdxezpfbhxytcnrggg`, статичний аналіз тіл RPC, `EXPLAIN ANALYZE`, звірка з `get_advisors`.
Тестовий актор — єдиний клієнт із кабінетом (`clients.user_id=24118a37…`, `client_id=6841d629…`).

**Доменні дані НЕ змінювались.** Жодного прямого `UPDATE` балансів/статусів/сесій. Усі write-RPC
під клієнтом або гейтяться (no-op/відмова), або не викликались (щоб не тригерити Telegram тренерам).
Після прогону: тестовий запис `enrolled`, заняття не скасоване, тимчасові таблиці прибрані, JWT скинуто.

---

## Зведення находок

| # | Severity | Находка | Статус |
|---|----------|---------|--------|
| 1 | **HIGH** | Будь-який клієнт читає всі колонки `trainers`, зокрема `telegram_link_token` → перехоплення Telegram тренера | Підтверджено |
| 2 | MEDIUM | `client_enroll` не списує сесії при записі → овербукінг: з балансом 1 можна записатись на N майбутніх занять | Підтверджено (код + прод) |
| 3 | MEDIUM | `client_cancel` не боронить скасування власного `attended`/`noshow` у минулому → переписування історії відвідувань і вхідних даних ЗП тренера | Підтверджено (код) |
| 4 | LOW | `client_enroll` без гейта типу заняття (`group`) і без вікна записи (лише `starts_at > now()`) | Підтверджено (код) |
| 5 | LOW | Немає app-rate-limit на логіні; самореєстрації немає, але `auth_role()` дефолт = `client` | Часткова (потребує перевірки налаштувань Supabase Auth) |
| 6 | LOW/INFO | `client_enroll` та webhook: `EXCEPTION WHEN OTHERS → SQLERRM` клієнту; секрет webhook через `!==` (не constant-time) | Підтверджено (код) |
| 7 | INFO | `class_availability` — DEFINER без гейта ролі (лише лічильники, без PII) | Підтверджено |

**Що тримається добре (перевірено, дірок нема):** RLS на `clients`/`client_contacts`/`enrollments`/
`sales`/`client_session_balances` — клієнт бачить лише своє (0 чужих рядків); `trainer_payments`/
`trainer_rates` клієнту недоступні (0 рядків); привілейовані enrollment/class-RPC
(`change_enrollment_status`, `delete_enrollment`, `delete_class`, `cancel_class_and_restore_sessions`,
`mark_attendance`) під клієнтом — no-op/відмова (гейт `can_manage_*` = false); `get_session_debtors_for_date`,
`get_session_balance_after` (IDOR по чужих `client_id`), `my_trainer_cash`, `accounting_balance`,
`calc_trainer_salary_v2` — усі віддають `access denied`/`forbidden`; жодного IDOR через URL/тіло
(сторінки резолвлять `client_id` на сервері з `auth.uid()`). `get_advisors` нових сигналів понад
прийняті в SECURITY.md не дав.

---

## 1. HIGH — витік `telegram_link_token` всіх тренерів → перехоплення Telegram

**Причина.** Політика `trainers.trainer_client_select`:
```
USING (auth_role() = ANY (ARRAY['trainer','client']))   -- без обмеження колонок
```
дозволяє будь-якому клієнту/тренеру `SELECT *` з `trainers`.

**Підтвердження (під JWT клієнта):**
```
trainers_visible=8, tokens_readable=8, phones_readable=3, emails_readable=0, chatids_readable=2
```
Клієнт прочитав `telegram_link_token` усіх 8 тренерів + 3 телефони.

**Експлуатація.** Webhook `app/api/telegram/webhook/route.ts` прив'язує чат до тренера за
`telegram_link_token`, коли `telegram_chat_id IS NULL`, і ротує токен. Зараз **6 із 8 тренерів**
угоняемі (chat_id NULL + є токен):
```
hijackable=6, already_linked=2, total=8
```
Клієнт читає токен → шле боту `/start <token>` → прив'язує СВІЙ Telegram до тренера → отримує всі
enrollment-нотифікації цього тренера (імена клієнтів, час занять). Тренери так само читають токени
один одного.

> Advisors цю діру НЕ ловлять (це дизайн RLS-політики, не лінт). SECURITY.md її теж не фіксує.

**Рекомендація.** Звузити доступ клієнта/тренера до `trainers` до безпечних колонок
(`id, name, is_active`): або окремий `security_invoker` view для публічного списку тренерів +
REVOKE прямого SELECT на таблицю, або column-level GRANT. `telegram_link_token`/`telegram_chat_id`/
`phone`/`email` — лише owner/admin (і сам тренер по `user_id`).

## 2. MEDIUM — овербукінг: запис не резервує сесію

**Причина.** `client_enroll` (`20260613_fix_client_enroll_advisory_lock.sql`) перевіряє
`sessions_balance >= v_cost`, але **не списує** сесію при записі — лише вставляє `enrollments`
(`sessions_used=0`). `client_session_balances` змінюється тільки при закритті заняття
(`change_enrollment_status` → attended/noshow/пізнє скасування вставляє `-v_charge`). Між записом і
стартом баланс не зменшується і не враховує інші pending-записи.

**Наслідок.** Клієнт із `group`-балансом 1 може записатись на багато майбутніх занять — кожен запис
читає той самий баланс 1 ≥ 1 і проходить. Баланс іде в мінус постфактум (на auto_close). Модель
мінусового балансу вже жива на проді: `smallhallrental = -2` у тестового клієнта.

**Рекомендація.** Враховувати в перевірці балансу активні майбутні записи того ж `ticket_type`
(`balance - COALESCE(pending_cost,0) >= v_cost`) всередині advisory-lock, або резервувати сесію при
записі з поверненням при скасуванні. Рішення — окремо (звіт лише фіксує).

## 3. MEDIUM — `client_cancel` переписує минулу відвідуваність

**Причина.** `client_cancel` перевіряє лише роль і власність (`v_owner_id = v_client_id`), ставить
`app.trusted_call='on'` і делегує в `change_enrollment_status(…, 'cancelled', …)`. **Не перевіряє**
ні поточний статус, ні чи заняття в минулому. `change_enrollment_status` теж не боронить перехід
`attended → cancelled`.

**Наслідок.** Клієнт може перевести СВІЙ минулий `attended`/`noshow` у `cancelled`
(`cancellation_source='self'`). По сесіях сума ~нульова (рефанд `sessions_used` → повторний charge
як пізнє скасування), але **історія відвідувань змінюється** і зникає `attended`, який рахує
`calc_trainer_salary_v2` → клієнт ретроактивно зменшує оплачені тренеру заняття/спотворює статистику.

**Рекомендація.** У `client_cancel` заборонити скасування, якщо `status NOT IN ('enrolled','waitlist')`
або `classes.starts_at <= now()` (клієнт скасовує лише майбутнє активне). Персонал-шлях лишити як є.

## 4. LOW — `client_enroll`: немає гейта типу/вікна

- Немає перевірки `ticket_type='group'` — клієнт може передати будь-який `class_id` у RPC і записатись
  на не-group заняття, якщо має баланс відповідного `ticket_type` (UI показує лише group).
- Немає вікна записи — лише `starts_at > now()`; UI обмежує 30 днів, RPC приймає будь-яку майбутню дату.

**Рекомендація.** Додати в `client_enroll` `IF v_class.ticket_type <> 'group' THEN відмова` і верхню
межу вікна (наприклад `starts_at <= now() + interval '30 days'`), щоб RPC відповідав контракту UI.

## 5. LOW — логін без app-rate-limit; дефолт ролі = `client`

- `app/login/page.tsx` кличе `supabase.auth.signInWithPassword` напряму з браузера (публічний anon-key),
  без власного throttle/captcha. Покладається лише на вбудовані ліміти Supabase Auth.
- `auth_role()` і `roleFromUser` дефолтять у `client`. Самореєстрації в застосунку немає (`signUp`
  ніде не викликається), але якщо в Supabase Auth увімкнено signups, будь-хто з anon-key може
  створити `authenticated`-юзера, що отримає клієнтські SELECT-права (усі `classes`, усі `trainers`
  разом із находкою #1) навіть без картки клієнта.

**Рекомендація.** Перевірити в дашборді Supabase Auth, що signups вимкнено і rate-limit/captcha
увімкнені; за потреби — captcha на логіні. Активний брутфорс не проводив (щоб не лочити живий акаунт).

## 6. LOW/INFO — витік внутрішніх помилок; порівняння секрету webhook

- `client_enroll`: `EXCEPTION WHEN OTHERS THEN RETURN … SQLERRM` — внутрішні помилки БД повертаються
  клієнту. Краще логувати й віддавати узагальнене повідомлення.
- `telegram/webhook`: секрет звіряється `!==` (не constant-time). Теоретичний timing-канал; низько,
  бо секрет довгий і канал зашумлений. Рекомендація — порівняння сталого часу.

## 7. INFO — `class_availability` без гейта ролі

DEFINER-функція повертає `active_count/waitlist_count/capacity` для будь-яких `class_id` будь-якому
`authenticated`. Персональних даних немає — прийнятний ризик (лічильники заповненості).

---

## Продуктивність (прод, під JWT клієнта)

| Запит | Час | План |
|-------|-----|------|
| `listBookableClasses` (group, вікно 30 днів, 31 рядок) | ~4 мс | BitmapAnd по `idx_classes_starts_at` + `idx_classes_ticket_type`, buffers hit=11 |
| `get_session_balances_running` (рік історії, 15 рядків) | ~13.5 мс | Function Scan |

Кабінетні читання дешеві; відсутніх індексів/seq-scan на гарячому шляху не виявлено. Повноцінний
конкурентний load через MCP не ставив (виклики послідовні, прод живий). Capacity-гонка закрита
`pg_advisory_xact_lock` по `class_id` у `client_enroll` (серіалізує одночасні записи на одне заняття);
овербукінг #2 — це не гонка, а відсутність резерву балансу.

## Застереження методу
- MCP `execute_sql` **комітить** (перевірено scratch-таблицею) — тому write-тести з реальним
  `client_enroll` свідомо не проводились, аби не плодити записи й не слати Telegram тренерам; #2–#4
  доведені за тілами RPC + станом прод-даних.
- Емуляція JWT у БД відтворює RLS/гейти точно, але не покриває HTTP-шар PostgREST/Auth
  (rate-limit, signups) — ті пункти позначені як «перевірити в дашборді».

## Пріоритет виправлень
1. **#1** (HIGH) — звузити колонки `trainers` для client/trainer; закрити вектор угону Telegram.
2. **#3** (MEDIUM) — гард на скасування минулого в `client_cancel`.
3. **#2** (MEDIUM) — врахувати pending у балансі `client_enroll`.
4. **#4–#6** (LOW) — гейт типу/вікна, generic-помилки, перевірка налаштувань Auth.
