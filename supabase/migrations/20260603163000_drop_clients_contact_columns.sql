-- Фаза 2, фінал: дропнути контактні колонки з clients (код мігровано на client_contacts/view).
-- clients_negative_balance тягнув clients.phone напряму → спершу пересоздаємо її без phone
-- (фронт із цієї view phone не читає — лише id/імʼя/balance), потім дроп.

-- security_invoker=true: view має наслідувати RLS викликача (Фаза 3 обмежить clients по ролях).
drop view if exists clients_negative_balance;
create view clients_negative_balance
with (security_invoker = true)
as
select id, first_name, last_name, balance, credit_limit, balance_updated_at
from clients
where balance < 0
order by balance;
grant select on clients_negative_balance to anon, authenticated;

alter table clients
  drop column if exists phone,
  drop column if exists instagram_username,
  drop column if exists telegram_username;
