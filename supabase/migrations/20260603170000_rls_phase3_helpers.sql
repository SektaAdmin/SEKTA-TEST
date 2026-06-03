-- Фаза 3 (ROLES_PLAN.md): хелпери для RLS — мапінг auth.uid() -> доменний id.
-- SECURITY DEFINER, бо читають clients/trainers в обхід RLS (інакше рекурсія
-- з політиками на цих же таблицях). stable + search_path (інваріант #10).

create or replace function current_client_id() returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from clients where user_id = auth.uid() limit 1;
$$;

create or replace function current_trainer_id() returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from trainers where user_id = auth.uid() limit 1;
$$;

revoke all on function current_client_id() from public;
revoke all on function current_trainer_id() from public;
grant execute on function current_client_id() to authenticated;
grant execute on function current_trainer_id() to authenticated;
