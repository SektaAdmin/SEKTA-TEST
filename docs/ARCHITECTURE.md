# ARCHITECTURE — навігаційний указівник

Канон архітектури — кореневий `CLAUDE.md` (стек, карта коду, інваріанти, scaffold). Тут — вхідні точки. Зміна паттерну/осі → оновлюй `CLAUDE.md` у тому ж коміті (див. [CONTRIBUTING.md](CONTRIBUTING.md)).

## Стек
Next.js 14.2.3 App Router · React 18 · TS strict · Supabase PostgreSQL+Auth(JWT) · Tailwind 4+shadcn (CSS Modules співіснують) · react-hook-form+zod · sonner · date-fns. UI **тільки українською**.

## Підсистеми
- БД/RPC/інваріанти даних → [DATABASE.md](DATABASE.md)
- Ролі/RLS/гранти/RPC-гейти → [SECURITY.md](SECURITY.md)
- Frontend (модалки/CSS/layout/mobile) → [FRONTEND.md](FRONTEND.md)
- Скаффолд нового → [templates/](templates/)
- Зміни вперед → [CHANGELOG.md](CHANGELOG.md)
- [archive/](archive/) — заморожені звіти, read-only, НЕ редагувати.

---

## Карта коду — централізовані осі (нові місця беруть звідси, локальні копії НЕ оголошувати)

### Клієнти / запити
- **Supabase-клієнт** → `lib/supabase.ts` (синглтон `supabase`, browser, `createBrowserClient<Database>`). SSR → `lib/supabase-server.ts` (`createServerClient<Database>`). Generic `<Database>` обов'язковий, інакше весь шар → `any`.
- **Усі запити (читання+мутації)** → `lib/queries/*.ts`. Компоненти/хуки/сторінки НЕ пишуть `.from()`/`.rpc()`. Інваріант: `grep -rn "\.from(\|\.rpc(" app components hooks contexts | grep -v "lib/queries\|app/api\|Array.from"` = порожньо.
  - Кожна query-функція: 1-й арг `supabase: Db` (`Db=SupabaseClient<Database>` у `lib/queries/_db.ts`; там же `Row/Insert/Update<'table'>`). **НЕ** голий `SupabaseClient` (=`<any>`, стирає типи). Повертає `{…, error: string|null}`.
  - Компонент тримає лише UI-оркестрацію (toast/setError/формат).
  - Файли: `accounting.ts` feed звірки; `classes.ts` conflict-check/week-gen/series CRUD/class insert-update-delete/`listPastClasses`; `clients.ts` combobox+`getClientBalance`; `dashboard.ts` cash за день.
  - Кабінети: `client-cabinet.ts` (RPC `clientEnroll`/`clientCancel`), `client-cabinet-data.ts` (`getMyClient`/`getMyContacts`/`listMySessionBalances`/`listMyUpcomingEnrollments`/`listMyPastEnrollments`/`listMyRunningBalances`/`listBookableClasses`/`getClassAvailability`/`listMyPurchases`/`getMyEnrollmentDetail`/`getBaseTicketPrice`), `trainer-cabinet.ts` (`getMyTrainer`/`listMyUpcomingClasses`).
  - Статика студії (назва/адреса/Telegram/Instagram/Maps+координати) → `lib/studio.ts` (`STUDIO`).
  - Онбординг логіну: `client-login.ts` (`createClientLogin`), `trainer-login.ts` (`createTrainerLogin`) — `fetch` до Route Handler, не RPC.
- **RPC-розпаковка** → `callRpc()` у `lib/rpc.ts`. Усі success/error_message-RPC через нього (НЕ `data?.[0]?.success` руками). Data-RPC (calc_trainer_salary*, check_*) — без нього.

### ⚠️ Route Handlers зі service-role — лише `app/api/**` (єдиний виняток з «усе в lib/queries»)
Створення `auth.users` потребує `SUPABASE_SERVICE_ROLE_KEY` (`createClient<Database>(url, serviceKey)` + `auth.admin.createUser`) — не світити в браузер. Два:
- `app/api/admin/create-client-login/route.ts` — гейт `isStaff` через `getRole()`, телефон з `client_contacts`, `normalize_phone_ua()`, перевірка `clients.user_id IS NULL` (UNIQUE `clients_user_id_key`) + номер вільний, створює auth-юзера `role='client'`, привʼязує `clients.user_id`. Identifier = телефон E.164 `+380…`.
- `app/api/admin/create-trainer-login/route.ts` — те саме, `role='trainer'`, таблиця `trainers` (контакти `phone`/`email` у ній), ідентифікатор телефон→інакше email. UNIQUE `trainers_user_id_key`/`_phone_key`/`_email_key`. Frontend `createTrainerLogin()`, кнопка «Створити кабінет» у `TrainerModal` (edit).
- Логін+пароль (адмін шле в директ), далі OTP по SMS. middleware відсікає не-staff на `/api/**`.
- **Скидання пароля = той самий endpoint.** Якщо `user_id` заповнений → генерує новий пароль (`auth.admin.updateUserById`), повертає `{login, password, reset:true}` (старий пароль не показати — Supabase хешує). Кнопка «Скинути пароль» у картці клієнта (`resetMode`) і `TrainerModal`. `create*Login()` повертає прапорець `reset`.

### ⚠️ Типи запитів — виводити зі схеми
- Row-типи через `QueryData<typeof query>`, НЕ руками. Патерн: `const X_SELECT='…' as const` → `function xQuery(s:Db){return s.from('t').select(X_SELECT)}` → `export type XRow = QueryData<ReturnType<typeof xQuery>>[number]`. `as unknown as RowType` у queries = **заборонено** (було 31, тепер 0).
- Винятки-приведення лише: (а) union-звуження доменом (`payment_method`/`direction`/`enrollment_status` — БД `text`, форма/CHECK звужує) через `Omit<…,'f'> & {f:Union}` + `as` (НЕ `as unknown as`); (б) `cash_holder!` після `.not('cash_holder','is',null)`.
- **⚠️ `select` — СТАТИЧНИЙ літерал `as const`, без template `${}`.** QueryData парсить embed лише зі статичного рядка; `trainers!${TRAINER_FK.sales}(name)` → тип `string` → row=`GenericStringError`. Тому FK вшито рядком-літералом + guard `const _x: typeof TRAINER_FK.sales = 'sales_trainer_id_fkey'`.
- **⚠️ Embed `trainers(...)` на `sales`/`studio_expenses`/`trainer_payments`** — ДВА FK (`trainer_id`+`cash_holder`), голий `trainers(name)` → рантайм «more than one relationship». FK вшито літералом: `sales_trainer_id_fkey`/`studio_expenses_trainer_id_fkey`/`trainer_payments_trainer_id_fkey` (`lib/queries/_fk.ts`, guard). Решта (classes/enrollments/trainer_rates/class_series) — 1 FK, голий `trainers(name)` ок.

### Хуки даних (НЕ писати руками useState+useEffect+fetch)
- **список (фільтри/пагінація)** → `useListQuery(fetcher, deps, {realtime?, refetchOnVisible?})` у `hooks/useListQuery.ts` → `{data, total, loading, error, refetch}`. `fetcher` замикає deps, повертає `{data, count?, error}`. Гасить застарілі (AbortController), realtime, refetch при поверненні вкладки. Приклади: `useSales`, `useSeriesTemplates`, `/journal`, `/clients`, дашборд-списки.
- **одне значення/об'єкт** → `useAsync(fetcher, deps, {realtime?})` у `hooks/useAsync.ts` → `{data:T|null, loading, error, refetch}`. Для агрегатів-карток (`MoneyCardsBlock`, `AlertCardsBlock`).
- **довідкова сутність з toggle** → `useRefEntity` (нижче).
- Винятки (свій fetch): мульти-список+оптимістичні мутації (`/accounting`), складні мульти-джерельні (`/schedule`, `/clients/[id]`, salary). `useRealtime([])` = no-op.

### Довідники / лейбли
- **Довідкові сутності** (halls/trainers/tickets/training_types) → фабрика `refEntityQueries(table, columns, {orderBy})` у `lib/queries/_refEntity.ts` (list/listActive/toggle/insert); хук `useRefEntity(table, listFn, toggleFn)` у `hooks/useRefEntity.ts` → `{data, loading, fetchError, toggling, toggle, refetch}`. Іменовані (`useHalls`) — тонкі обгортки (перейменовують `data`).
- **Довідники в контексті** → `contexts/RefsContext.tsx` через `useRefs()`. НЕ тягнути props. Має `refetch*`.
- **Бейджі/лейбли** → `lib/badges.ts`. `enrollmentStatusClass`/`paymentClass` → `'badge badge-cash'` у className. Лейбли **безособові, єдиний тон** (Заброньовано/Відвідано/Не відвідано/Скасовано/У резерві). `personal_card`=«Картка». `transactionTypeLabel(type)` (purchase/deposit_topup/admin_adjustment + історичні).
- **Зведений бейдж запису** → `enrollmentBadge({status, cancellation_source, sessions_used}, 'admin'|'client') → {label, tone}`. Текст єдиний; різниця лише в ДЖЕРЕЛІ cancelled: admin суфікс «·студія/адмін/клієнт/авто» (`cancelSourceSuffix`), client без. «Пізно» (`sessions_used>0`) → «Скасовано (пізно)». `tone`→клас: `enrollmentBadgeClass(tone)` (admin) / `VISIT_TONE_CLASS` (кабінет). НЕ зливати з `cancellation.ts` (факт vs прогноз).
- **Назви типів занять** → `label` з БД (RefsContext / `listTrainingTypeLabels`), НЕ хардкод. Короткі → `ticketTypeShortLabel`. Абревіатури-значки (G/I/ID/IT/H/SH/P/S) для mobile overview → `ticketTypeAbbr` (fallback 1-ша літера).
- **Кольори типів** → `lib/typeColor.ts`.

### Дашборд / KPI
- **KPI-картка** → `StatCard` (`components/ui/StatCard.tsx`). `value` вже форматований (`formatMoney`), опц `hint`/`href`/`accent`/`loading` (скелет). НЕ плодити `.balanceBlock`/`.summary`.
- **Дашборд-запити** → `lib/queries/dashboard.ts`: `getMoneyTotalsForDate`, `listNegativeBalanceClients` (view `clients_negative_balance`), `listSessionDebtorsForDate` (агрегатно, 3 запити, без N+1: класи→enrollments `class_id IN`→баланси `client_id IN`), `listHallBusyIntervalsForDate`, `listAllCashBalances` (≈4 запити, НЕ N×). Логіка групування → `lib/dashboardReport.ts`. «Вільні місця» — з `listClassesForDate`/`listEnrolledCountsForDate`.
- **Квитанції** → `hooks/useReceipt.ts` + `components/ReceiptCard.tsx` (прихований div для html2canvas). Query `getClientSessionBalances`/`saveReceiptToSale` у `lib/queries/sales.ts`. Bucket `receipts` (public). ⚠️ хук кличе `supabase.storage.from('receipts')` напряму — легітимний виняток (Storage API, не DB).

### Ролі
- `lib/auth/role.ts` (edge-safe): `Role`, `roleFromUser(user)` (дефолт `client`), `homePathForRole`, `isStaff`. Server → `lib/auth/getRole.ts` (`getRole()`). Client → `hooks/useRole.ts`. Маршрути → `middleware.ts` (owner/admin→корінь; trainer→`/trainer`; client→`/client`). НЕ парсити `app_metadata.role` руками.
- **Вихід** → `signOutAndRedirect(router)` у `lib/auth/signOut.ts` (спільний для Sidebar/BottomNav/CabinetHeader/ClientHome). НЕ локальний `handleLogout`. Деталі → [SECURITY.md](SECURITY.md).

### Формати / утиліти
- **Гроші** → `formatMoney(n)` (`lib/formatters.ts`, «1 000 ₴»). Знак ± і «—» для 0 — на місці виклику.
- **Дати display** (`lib/formatters.ts`): `formatDate` (ДД.ММ.РРРР), `formatDateShort` (ДД.ММ), `formatDateYY`; `hhmm(Date)`, `fullWhen(startISO, durationMin)`, `pluralHours(n)`. Для `<input type=date>` → `toYMD`/`isoToYMD` (`lib/dateUtils.ts`). ⚠️ РРРР-ММ-ДД-рядок: display/parse split-based — `ymdToDisplay`/`parseYMD` (local-midnight), БЕЗ `new Date(ymd)` (TZ-ризик).
- **⚠️ Дні тижня — 2 конвенції** (`lib/dateUtils.ts`): `DOW_LABELS_SHORT/FULL` (0=Нд, індексувати `day_of_week` з БД) vs `WEEKDAYS_SHORT/FULL` (0=Пн, заголовки сітки). JS Date → Monday-based через `dowMondayIndex(date)`.
- **Місяці** → `MONTHS_UK_SHORT/FULL/CAP` (`lib/dateUtils.ts`).
- **Дедлайн відміни** → `cancellationDeadline(startISO)`/`isFreeCancellation(startISO, nowMs?)` у `lib/cancellation.ts` — клієнтська копія БД `cancellation_deadline`, прив'язана до **Europe/Kyiv** (`Intl`, не до пристрою). Мусить лишатися синхронною з БД.
- **Метрики розкладу** → `lib/scheduleMetrics.ts`: `getActiveCount`, `getWaitlistCount`, `isFull`, `isAlmost`, `fillPct`, `*ClientCount*` (шаблони), `goesToWaitlist(availability)` (дзеркало RPC `client_enroll`). **Ефективний баланс сесій** → `effectiveSessionBalance(raw, status, sessionsUsed, hours)`: `enrolled`→`raw−cost`, інакше `raw`. У ClassDetailModal/ClassDetailClient.
- **Validation** → `lib/validation-messages.ts` (`VM.required.*`/`VM.invalid.*`). Усі zod/RHF звідси.
- **Empty-state/toast** → `lib/messages.ts` (`MSG.empty.*`, `MSG.toast.*`). Одиничні доменні toast лишаються на місці (виносити з 2-м використанням).
- **isMobile** → `hooks/useIsMobile.ts` (matchMedia, 640px). НЕ `window.innerWidth`.
- **Realtime** → `lib/useRealtime.ts` (debounce 300ms, JWT обов'язковий для RLS).
- **Типи** → `types/index.ts`; авто-ген БД → `types/database.types.ts`.

Ще НЕ централізовано (чекає 2-го місця): —.
