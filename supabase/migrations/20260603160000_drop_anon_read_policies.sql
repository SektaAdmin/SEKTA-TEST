-- Фаза 0 (ROLES_PLAN.md): закрити витічку — анонім (незалогінений) читав усю виручку і тарифи.
-- Дві політики на роль anon з USING(true) — спадок налагодження. Адмінка ходить як authenticated,
-- тож видалення її не зачіпає.

drop policy if exists "sales: anon can read" on sales;
drop policy if exists "tickets: anon can read" on tickets;
