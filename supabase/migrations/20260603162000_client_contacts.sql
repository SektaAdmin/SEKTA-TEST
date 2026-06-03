-- Фаза 2 (ROLES_PLAN.md): винести контакти клієнта в окрему таблицю, щоб приховати їх
-- від тренера ПО-СПРАВЖНЬОМУ (рішення A1). Колонки phone/instagram_username/telegram_username
-- у clients поки НЕ дропаємо — спершу мігрується код, дроп окремим комітом.

-- 1. Таблиця контактів (1:1 з clients).
create table if not exists client_contacts (
  client_id uuid primary key references clients(id) on delete cascade,
  phone text,
  instagram_username text,
  telegram_username text
);

-- 2. Перенести наявні дані.
insert into client_contacts (client_id, phone, instagram_username, telegram_username)
select id, phone, instagram_username, telegram_username from clients
on conflict (client_id) do nothing;

-- 3. RLS: контакти бачать лише owner/admin. Тренер/клієнт доступу не мають
--    (клієнт свої контакти бачитиме через clients-профіль у Фазі 3/4 окремо — поки лише адмін).
alter table client_contacts enable row level security;
create policy owner_admin_all on client_contacts
  for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
grant select, insert, update, delete on client_contacts to anon, authenticated;

-- 4. Індекс для пошуку по телефону.
create index if not exists idx_client_contacts_phone on client_contacts(phone);

-- 5. View для пошуку: плоска картина clients + контакти, як було до виносу.
--    security_invoker=true → view наслідує RLS викликача: тренер через view телефон НЕ дістане
--    (RLS на client_contacts відсіче contacts-частину). Без цього view обійшов би RLS.
create or replace view clients_with_contacts
with (security_invoker = true)
as
select
  c.id, c.first_name, c.last_name, c.balance, c.credit_limit,
  c.balance_updated_at, c.created_at, c.updated_at, c.user_id,
  cc.phone, cc.instagram_username, cc.telegram_username
from clients c
left join client_contacts cc on cc.client_id = c.id;

grant select on clients_with_contacts to anon, authenticated;
