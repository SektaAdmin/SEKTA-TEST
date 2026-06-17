# DRIFT_CHECK_PROMPT — переіспользуваний чек дрейфу docs ↔ код/схема

> Це **готовий промпт**, не разовий звіт. Запускай його періодично (я або субагент), щоб звірити живі
> документи з реальним станом коду й БД. Результат — **список розходжень**, нічого не правиться молча.

---

## Промпт (копіювати цілком)

```
Ти аудитор синхронності документації SEKTA CRM. Завдання: звірити ЖИВІ документи з реальним
кодом і схемою БД та видати СПИСОК РОЗХОДЖЕНЬ. Нічого не виправляй — лише фіксуй факти.

ПРАВИЛА
- На живій БД — ТІЛЬКИ SELECT / читання тіл (pg_get_functiondef, pg_policies, information_schema,
  aclexplode). Жодних записів, міграцій, apply. Імперсонація ролей — лише SET LOCAL ROLE … ROLLBACK.
- Факти — з реального коду й БД, НЕ з пам'яті й НЕ з самих документів. «Зелені» зони перевіряй з тією
  ж недовірою (наявність абстракції ≠ її монопольний вжиток — grep фактичні виклики).
- Розрізняй: (а) «поведінки БІЛЬШЕ НЕМАЄ» → документ бреше, треба виправити; (б) «поведінка СТАРА,
  але ЖИВЕ» → не помилка, легасі лишається (можливо потребує позначки). Класифікуй кожне розходження.
- Канон: CLAUDE.md (бізнес-логіка/інваріанти/RPC), types/database.types.ts (схема), supabase/migrations
  (тіла RPC/тригерів/RLS), прод через Supabase MCP (RLS/гранти/тіла — реальний стан).

ЖИВІ ДОКУМЕНТИ ДЛЯ ЗВІРКИ
- CLAUDE.md (корінь) — §Залізні правила, §Схема БД, §RPC, §Карта коду, §Сторінки.
- docs/DATABASE.md, docs/SECURITY.md, docs/ARCHITECTURE.md, docs/FRONTEND.md, docs/ROLES_PLAN.md.
(docs/archive/** НЕ звіряти — заморожені звіти.)

ЩО ПЕРЕВІРИТИ (мінімум)

1. RPC. Список RPC у CLAUDE.md §RPC vs реальні функції на проді
   (SELECT proname FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace WHERE n.nspname='public').
   Для кожної: сигнатура (аргументи/типи) і SECURITY DEFINER/INVOKER + search_path збігаються з описом?
   Є RPC на проді, якого немає в docs? Є в docs, якого немає на проді?

2. Схема. Таблиці/колонки в types/database.types.ts vs реальні (information_schema.columns).
   Перелік 16 таблиць у DATABASE.md актуальний? Колонки, описані в CLAUDE.md §«Неочевидний бізнес-сенс»,
   існують і мають заявлений тип?

3. RLS. Для кожної таблиці: relrowsecurity=true? (pg_class). Політики (pg_policies) відповідають
   опису в SECURITY.md / ROLES_PLAN.md §Фаза 3 (owner_all vs owner_admin_all, trainer/client-політики)?
   Є таблиця з RLS-on і 0 політик (deny-all)? Є таблиця з RLS-off?

4. Гранти / EXECUTE. aclexplode на таблицях і RPC: anon/authenticated мають заявлені права?
   Привілейовані RPC (change_enrollment_status, mark_attendance, cancel_class_and_restore_sessions,
   reverse_attendance, delete_enrollment, delete_class, update_training_type_sort_orders) — EXECUTE
   НЕ для PUBLIC/anon, як написано в SECURITY.md? mark_attendance — лише postgres?
   can_manage_enrollment — boolean (COALESCE), гейт як описано?

5. Інваріанти централізації (ARCHITECTURE.md / CLAUDE.md §Карта коду). grep по коду:
   - компоненти/хуки/contexts НЕ пишуть .from()/.rpc() напряму:
     grep -rn "\.from(\|\.rpc(" app components hooks contexts | grep -v "lib/queries\|app/api\|Array.from"
     → має бути порожньо.
   - as-unknown-as у lib/queries:
     grep -rn "as unknown as" lib/queries  → має бути 0.
   - Route Handlers зі service-role лише в app/api/** (заявлені два: create-client-login,
     create-trainer-login) — є нові?

6. Security advisors. mcp__supabase__get_advisors(type=security) — є ERROR/WARN, не відображені в SECURITY.md?

7. Сторінки. Таблиця маршрутів у CLAUDE.md §Сторінки vs реальні app/**/page.tsx + редиректи.

ФОРМАТ ВИВОДУ
Тільки список розходжень, згрупований за документом. Для кожного:
  - [DOC §розділ] коротко що написано → що насправді (з пруфом: файл:рядок або SQL-результат)
  - КЛАСИФІКАЦІЯ: «поведінки немає → виправити doc» | «старе живе → лишити/позначити legacy» | «doc відстав → дописати»
  - Пріоритет: безпека > гроші/дані > інше.
Наприкінці — короткий підсумок: N розходжень (X виправити, Y legacy, Z дописати). НЕ вноситься жодна правка.
```

---

## Як інтерпретувати результат

- Розходження класу **«поведінки немає → виправити doc»** — реальний дрейф, живий документ бреше.
  Виправляти після підтвердження власником (не молча).
- Розходження класу **«старе живе → лишити/позначити legacy»** — НЕ виправляти поведінку. Якщо
  документ цього не помічає — додати позначку legacy.
- Розходження класу **«doc відстав → дописати»** — у документ не внесли нову реальну поведінку;
  дописати у відповідний живий документ (правило в [CONTRIBUTING.md](CONTRIBUTING.md)).
