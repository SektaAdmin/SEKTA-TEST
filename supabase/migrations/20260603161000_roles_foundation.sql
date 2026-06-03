-- Фаза 1 (ROLES_PLAN.md): фундамент ролей у БД. Поведінка НЕ змінюється —
-- політики ще USING(true). Це лише підготовка ґрунту під Фази 2–4.

-- 1. Хелпер: роль із JWT (app_metadata.role). Єдине джерело правди для всіх майбутніх політик.
--    Дефолт 'client' — найменш привілейований: незнайома/відсутня роль = клієнт.
create or replace function auth_role() returns text
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
    'client'
  );
$$;

-- 2. Зв'язок логіна з доменом (nullable — наявні картки без логіна продовжують жити).
alter table clients  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table trainers add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists uq_clients_user_id  on clients(user_id)  where user_id is not null;
create unique index if not exists uq_trainers_user_id on trainers(user_id) where user_id is not null;

-- 3. Проставити роль наявним користувачам.
--    sekta-admin-owner@proton.me — реальний власник; e2e@sekta.test — Playwright-бот.
--    Обидва owner (узгоджено): смоук-тести мають бачити весь функціонал після введення RLS.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"owner"}'::jsonb
where email in ('sekta-admin-owner@proton.me', 'e2e@sekta.test');
