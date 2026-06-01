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
npm run sync:schema  # регенерує types/database.types.ts після змін схеми в Supabase
```

`.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

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
9. **RLS увімкнено на всіх таблицях.** Нова таблиця в міграції → `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + політика `authenticated_all` + `GRANT SELECT,INSERT,UPDATE,DELETE ... TO anon, authenticated`. Усі authenticated = однакові права.
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
- **`sales.payment_method`** — `cash` / `fop` / `personal_card` / `deposit`.
- **`sales.cash_holder`** / `studio_expenses.cash_holder` / `trainer_payments.cash_holder` — **`uuid` → trainers.id**. Хто фізично тримає готівку «на руках» (актуально лише для `cash`). НЕ текст.
- **`sales` без тікета** (`ticket_id=null`) = депозитна операція: `+amount_given` поповнення, `-price_paid` списання.
- **`training_types.code`** — незмінний ідентифікатор; `label` — редагований. Константи `TICKET_TYPES`/`TICKET_TYPE_LABELS` видалені з коду — всі лейбли читаються з БД (RefsContext / `listTrainingTypeLabels`).
- **`class_series.type`** — `'template'` (постійний шаблон тижня) vs `'series'` (разова серія). `day_of_week`: 0=Нд..6=Сб. `generate_week()` будує `classes` з `type='template'`.
- **`enrollments.status`** — `enrolled` / `attended` / `cancelled` / `noshow` / `waitlist`. Тригер `check_class_capacity` авто-переводить `enrolled`→`waitlist` при повному залі. **Фінансовий факт — у `sessions_used`** (>0 = сесію списано), не в окремому статусі: `cancelled` зі `sessions_used>0` = «скасувала пізно, штраф».
- **`enrollments.hours_attended`** — `int[]` для занять `duration_min >= 120`: `[1]`, `[2]` або `[1,2]`. `NULL` = усе заняття. `sessions_used = hours_attended.length` (або 1 якщо NULL).
- **Правило скасування (дедлайн безкоштовності)** — у `cancellation_deadline(starts_at)`: початок `< 14:00` → дедлайн 19:00 попереднього дня; `>= 14:00` → `starts_at − 6 год`. До дедлайну `cancelled` без списання, після — зі списанням. `noshow` списує завжди. `change_enrollment_status` приймає `p_force_no_charge` для виняткового скасування без штрафу.
- **`studio_expenses.direction`** — `expense` (зменшує метод) / `income` (збільшує). `payment_method` тут без `deposit`.
- **`trainer_rates`** — `trainer_rate`+`studio_rate` (₴/людино-годину), `valid_from`/`valid_to` (NULL=активна). Пріоритет: індивід.+зал > індивід. > глоб.+зал > глоб. Зміна = закрити стару (`valid_to`) + додати нову.
- **RLS вимкнено** на: `tickets`, `trainers`, `sales`, `balance_transactions`, `halls`, `training_types`, `classes`, `class_series`. Увімкнено на: `clients`, `client_session_balances`, `series_clients`, `studio_expenses`, `trainer_rates`, `trainer_payments`.

---

## RPC (Stored Procedures)

Усі повертають `TABLE(...)` — читай `data[0]`. Помилки бізнес-логіки приходять як `success=false` + `error_message`, **не** як SQL-error.

| RPC | Призначення |
|-----|-------------|
| `create_sale(p_client_id, p_ticket_id, p_trainer_id, p_cash_holder, p_price_paid, p_amount_given, p_payment_method, p_notes, p_created_at)` | INSERT sales + `update_client_balance` в одній транзакції |
| `update_sale(p_sale_id, …, p_cash_holder, p_ticket_name, p_ticket_price, p_sessions, p_ticket_type, …)` | Реверс старого балансу + застосування нового |
| `delete_sale(p_sale_id)` | Видалити sale + реверс балансу |
| `update_client_balance(p_client_id, p_amount, p_transaction_type, p_description, p_related_sale_id, p_reason)` | → `(success, new_balance, transaction_id, error_message)`. FOR UPDATE + credit_limit + лог |
| `mark_attendance(p_enrollment_id, p_sessions_used=1)` | → `(success, error_message)`. Декремент сесій, status=attended. `success=false` якщо балансу нема. **Вживає лише cron**; UI → `change_enrollment_status` |
| `change_enrollment_status(p_enrollment_id, p_new_status, p_force_no_charge=false, p_sessions_used=null)` | → `(success, charged, error_message)`. Єдина точка зміни статусу з UI. Вирівнює баланс сесій + застосовує правило скасування. `charged` = чи списано сесію |
| `cancellation_deadline(starts_at) → timestamptz` | Дедлайн безкоштовного скасування (див. бізнес-правило вище) |
| `reverse_attendance(p_enrollment_id)` | → `(success, error_message)`. Повертає сесії, status=cancelled, sessions_used=0 |
| `cancel_class_and_restore_sessions(p_class_id)` | → `(success, restored_count, error_message)`. attended→повернути sessions_used; noshow→duration/60; enrolled→скасувати без повернення; is_cancelled=true |
| `restore_class(p_class_id)` | → `(success, restored_count, error_message)`. Зворотне до cancel. Перед викликом перевір `check_class_conflicts` |
| `generate_week(p_start_date, p_weeks=1)` | → `(classes_created, enrollments_created)`. Ідемпотентна (UNIQUE `uq_classes_series_date`). Прокидує series_clients в enrollments |
| `calc_trainer_salary_v2(p_trainer_id, p_start, p_end)` | Рядок на enrollment (attended+noshow). Ставка на дату заняття. Для `/settings/salary/calculations` |
| `check_class_conflicts(p_starts_at, p_duration_min, p_hall_id, p_trainer_id, p_exclude_id)` | Перетин по залу/тренеру |
| `check_client_conflict(p_client_id, p_class_id)` | Чи клієнт уже на паралельному занятті |
| `auto_close_classes()` | pg_cron кожні 5 хв. Закриває `enrolled` для занять 5хв–24год тому через `mark_attendance`. Без балансу → лишає `enrolled` для ручного розбору |

> ⚠️ **`create_sale` і `update_sale` мають по 2 перевантаження в БД** — старе (без `p_cash_holder`) і нове (з ним). Код передає `p_cash_holder`, тож резолвиться нова версія. Старе перевантаження варто видалити міграцією, щоб уникнути неоднозначності PostgREST. (Див. техборг.)

---

## Карта коду — де що шукати (без grep по всьому проекту)

Централізовані осі. Нові місця беруть звідси, **не** оголошуй локальні копії:

- **Supabase-клієнт** → `lib/supabase.ts` (синглтон `export const supabase`, browser). Server Components → `lib/supabase-server.ts`.
- **Усі запити читання** → `lib/queries/*.ts`. Компоненти/хуки **не** пишуть `.from()` напряму. Мутації (INSERT/UPDATE/RPC) — у модалках/хуках.
- **Довідники** (tickets/trainers/halls/trainingTypes) → `contexts/RefsContext.tsx` через `useRefs()`. Не тягнути props зі сторінок. Має `refetch*` для оновлення після мутацій у налаштуваннях.
- **Лейбли+класи бейджів** (статуси enrollment, методи оплати, короткі типи) → `lib/badges.ts`. `enrollmentStatusClass`/`paymentClass` повертають готовий `'badge badge-cash'` → у `className` напряму. CSS бейджів — у `globals.css`. Лейбли статусів — дієслова (Записалась/Відвідала/Не прийшла/Скасувала/Черга). `personal_card` = «Картка».
- **Повні людські назви типів занять** → `label` з БД (RefsContext / `listTrainingTypeLabels`), НЕ хардкод. Короткі ярлики для звітів → `ticketTypeShortLabel` у badges.ts.
- **Гроші (формат)** → `formatMoney(n)` у `lib/formatters.ts` («1 000 ₴»). Знак ± і «—» для 0 — на місці виклику.
- **Дати display** → `lib/formatters.ts`: `formatDate` (ДД.ММ.РРРР), `formatDateShort` (ДД.ММ), `formatDateYY`. Дата → РРРР-ММ-ДД для `<input type=date>` → `toYMD`/`isoToYMD` у `lib/dateUtils.ts`. Не писати `getFullYear()+padStart` локально.
- **⚠️ Дні тижня — ДВІ конвенції** в `lib/dateUtils.ts`: `DOW_LABELS_SHORT/FULL` (0=Нд, індексувати значенням `day_of_week` з БД) vs `WEEKDAYS_SHORT/FULL` (0=Пн, для заголовків сітки). JS `Date` → Monday-based через `dowMondayIndex(date)`. Не плутати.
- **Місяці** → `MONTHS_UK_SHORT/FULL` у `lib/dateUtils.ts`.
- **Метрики розкладу** (capacity/waitlist/fill) → `lib/scheduleMetrics.ts` (`getActiveCount`, `getWaitlistCount`, `isFull`, `isAlmost`, `fillPct`; для шаблонів — `*ClientCount*`). Не дублювати формули.
- **Ефективний баланс сесій** (скільки буде з урахуванням заняття, для відображення в рядку enrollment) → `effectiveSessionBalance(raw, status, sessionsUsed, hours)` у `lib/scheduleMetrics.ts`. `enrolled` → `raw − cost` («як буде»); вже-списані/waitlist/cancelled → `raw`. Вживається в ClassDetailModal і ClassDetailClient.
- **Validation-повідомлення** → `lib/validation-messages.ts` (`VM.required.*`/`VM.invalid.*`). Усі zod/RHF беруть звідси.
- **Empty-state тексти** → `lib/messages.ts` (`MSG.empty.*`).
- **Кольори типів занять** → `lib/typeColor.ts`.
- **isMobile** → `hooks/useIsMobile.ts` (matchMedia, breakpoint 640px). Не дублювати `window.innerWidth`.
- **Realtime** → `lib/useRealtime.ts` (debounce 300ms, JWT обов'язковий для RLS-таблиць).
- **Типи домену** → `types/index.ts`. Авто-ген типи БД → `types/database.types.ts`.

Ще НЕ централізовано (чекає на друге місце перед виносом): `TX_LABELS` (типи balance-транзакцій, у ClientModal).

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
| `/sales` | Продажі + кнопка «+ Витрата/Дохід» (studio_expenses). Фільтр дат |
| `/clients`, `/clients/[id]` | База клієнтів; профіль (депозит, залишки занять, покупки, записи) |
| `/schedule`, `/schedule/[classId]` | Розклад день/тиждень; деталі заняття. Навігація назад ≤30 днів |
| `/schedule/templates` | Шаблони тижня (HallWeekGrid), постійники, «виставити тиждень» |
| `/journal` | Минулі заняття (`starts_at < today`), фільтри, пагінація → ClassDetailModal |
| `/accounting` | Звірка з банком: feed sales+expenses+payments, картки підсумків, чекбокси |
| `/settings/salary/rates`, `/settings/salary/calculations` | Ставки тренерів; нарахування зп (період → заняття, готівка на руках, виплати) |
| `/settings/{tickets,trainers,halls,training-types}` | Довідники: активні + архів |
| `/settings`, `/tickets`, `/trainers`, `/halls`, `/training-types`, `/accounting/trainers*` | Редиректи |

---

## Поточний техборг (відоме, не виправлене)

- **`enrollClient` (rental) нетранзакційний**: enrollment + окремий `create_sale` без перевірки результату → можливий запис без списання. Перенести в один RPC. *(Фаза 2, заплановано.)*
- **БД-радники**: дубльовані RLS-політики (clients/sales/tickets/trainers/halls), `function_search_path_mutable` на RPC, непроіндексовані FK + невикористані індекси. Прибрати міграцією. *(Фаза 5, заплановано.)*
- **`as any` в queries** (~38) — join-результати без типу. Типізувати через `QueryData`. *(Фаза 4, заплановано.)*
- **Дубль перевантажень** `create_sale`/`update_sale` у БД — видалити старе.
- **`app/error.tsx`** має `0.5px` border (має бути `1px`) і лише `console.error` без зовнішнього логування.
