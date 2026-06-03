-- Фаза 4 (ROLES_PLAN.md): RPC для клієнтських дій. Логіка в БД (як гроші).
-- SECURITY DEFINER + власна перевірка «це мій client_id» через current_client_id()
-- (бо запис/відміна торкаються enrollments/balances, куди клієнтська RLS дає лише SELECT свого).

-- ── client_enroll ──────────────────────────────────────────────────────────
-- Клієнт записується на заняття. Гейт: роль=client, є оплачені заняття потрібного
-- типу (sessions_balance > 0), немає конфлікту в часі, немає дубля. НЕ в мінус.
-- Списання сесії НЕ робиться зараз — станеться при auto_close/mark_attendance,
-- коли заняття почнеться (як для адмінського запису наперед).
create or replace function client_enroll(p_class_id uuid)
returns table(success boolean, enrollment_id uuid, error_message text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_class     public.classes%rowtype;
  v_balance   integer;
  v_enroll_id uuid;
begin
  if auth_role() <> 'client' then
    return query select false, null::uuid, 'Доступно лише клієнту'::text; return;
  end if;

  v_client_id := current_client_id();
  if v_client_id is null then
    return query select false, null::uuid, 'Кабінет не привʼязано до клієнта'::text; return;
  end if;

  select * into v_class from public.classes where id = p_class_id;
  if not found then
    return query select false, null::uuid, 'Заняття не знайдено'::text; return;
  end if;
  if v_class.is_cancelled then
    return query select false, null::uuid, 'Заняття скасовано'::text; return;
  end if;
  if v_class.starts_at <= now() then
    return query select false, null::uuid, 'Заняття вже почалось'::text; return;
  end if;

  -- є оплачені заняття потрібного типу? (не пускаємо в мінус)
  select sessions_balance into v_balance
  from public.client_session_balances
  where client_id = v_client_id and ticket_type = v_class.ticket_type;

  if coalesce(v_balance, 0) <= 0 then
    return query select false, null::uuid, 'no_sessions'::text; return;
  end if;

  -- конфлікт у часі з іншим записом
  if exists (select 1 from public.check_client_conflict(v_client_id, p_class_id)) then
    return query select false, null::uuid, 'conflict'::text; return;
  end if;

  -- дубль (вже записаний на це заняття активно)
  if exists (
    select 1 from public.enrollments
    where class_id = p_class_id and client_id = v_client_id
      and status in ('enrolled', 'attended', 'waitlist')
  ) then
    return query select false, null::uuid, 'duplicate'::text; return;
  end if;

  -- INSERT. Тригер check_class_capacity сам переведе в waitlist при повному залі.
  insert into public.enrollments (class_id, client_id, status)
  values (p_class_id, v_client_id, 'enrolled')
  returning id into v_enroll_id;

  return query select true, v_enroll_id, null::text;

exception
  when others then
    return query select false, null::uuid, sqlerrm;
end;
$$;

-- ── client_cancel ──────────────────────────────────────────────────────────
-- Клієнт відміняє свій запис. Делегує в change_enrollment_status('cancelled') —
-- вся логіка дедлайну/списання/реверсу там. p_force_no_charge НЕдоступний.
-- charged = чи списано сесію (фронт попередив про це до підтвердження).
create or replace function client_cancel(p_enrollment_id uuid)
returns table(success boolean, charged boolean, error_message text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_owner_id  uuid;
  v_res       record;
begin
  if auth_role() <> 'client' then
    return query select false, false, 'Доступно лише клієнту'::text; return;
  end if;

  v_client_id := current_client_id();
  if v_client_id is null then
    return query select false, false, 'Кабінет не привʼязано до клієнта'::text; return;
  end if;

  select client_id into v_owner_id from public.enrollments where id = p_enrollment_id;
  if not found then
    return query select false, false, 'Запис не знайдено'::text; return;
  end if;
  if v_owner_id <> v_client_id then
    return query select false, false, 'Це не ваш запис'::text; return;
  end if;

  select * into v_res
  from public.change_enrollment_status(p_enrollment_id, 'cancelled', false, null);

  return query select v_res.success, v_res.charged, v_res.error_message;
end;
$$;

revoke all on function client_enroll(uuid) from public;
revoke all on function client_cancel(uuid) from public;
grant execute on function client_enroll(uuid) to authenticated;
grant execute on function client_cancel(uuid) to authenticated;
