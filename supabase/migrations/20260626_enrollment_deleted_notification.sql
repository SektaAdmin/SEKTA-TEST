-- Уведомление тренеру + лог /audit про УДАЛЕНИЕ записи (delete_enrollment).
-- Тригер log_enrollment_event ловит только INSERT/UPDATE OF status, а delete_enrollment
-- делает DELETE — событие не логировалось. Выносим логику актора+notify+insert в общий
-- helper emit_enrollment_event и вызываем его из delete_enrollment (тип события 'deleted').

-- ── 1. Общий emitter события ────────────────────────────────────────────
create or replace function public.emit_enrollment_event(
  p_event_type    text,
  p_enrollment_id uuid,
  p_class_id      uuid,
  p_client_id     uuid,
  p_old_status    text,
  p_new_status    text
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_is_cron       boolean;
  v_actor_role    text;
  v_actor_user    uuid;
  v_actor_trainer uuid;
  v_actor_client  uuid;
  v_owner         uuid;
  v_is_self_owner boolean := false;
  v_notify        boolean := false;
  v_chat_id       bigint;
  v_message       text;
begin
  v_actor_user := auth.uid();
  v_is_cron := (
    nullif(current_setting('request.jwt.claims', true), '') is null
    and current_user not in ('anon', 'authenticated')
  );

  if v_is_cron or v_actor_user is null then
    v_actor_role := 'system';
  else
    v_actor_role := public.auth_role();
    if v_actor_role = 'trainer' then
      v_actor_trainer := public.current_trainer_id();
    elsif v_actor_role = 'client' then
      v_actor_client := public.current_client_id();
    end if;
  end if;

  select trainer_id into v_owner from public.classes where id = p_class_id;

  v_is_self_owner := (
    v_actor_role = 'trainer'
    and v_owner is not null
    and v_actor_trainer is not null
    and v_actor_trainer = v_owner
  );

  v_notify := (
    v_actor_role <> 'system'
    and not v_is_self_owner
    and v_owner is not null
    and p_event_type in ('enrolled', 'cancelled', 'waitlisted', 'deleted')
  );

  if v_notify then
    select telegram_chat_id into v_chat_id from public.trainers where id = v_owner;
    v_message := public.render_enrollment_event_message(
      p_event_type, p_class_id, p_client_id, v_actor_role
    );
  end if;

  insert into public.enrollment_events (
    event_type, enrollment_id, class_id, client_id, owner_trainer_id,
    old_status, new_status, actor_role, actor_user_id, actor_trainer_id,
    actor_client_id, is_self_owner, notify, telegram_chat_id, message_text
  ) values (
    p_event_type, p_enrollment_id, p_class_id, p_client_id, v_owner,
    p_old_status, p_new_status, v_actor_role, v_actor_user, v_actor_trainer,
    v_actor_client, v_is_self_owner, v_notify, v_chat_id, v_message
  );
exception when others then
  raise warning 'emit_enrollment_event failed: %', sqlerrm;
end;
$$;

revoke all on function public.emit_enrollment_event(text, uuid, uuid, uuid, text, text) from public, anon, authenticated;

-- ── 2. Тригер переписан на helper (поведение без изменений) ─────────────
create or replace function public.log_enrollment_event()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_old_status text;
  v_event_type text;
begin
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return null;
    end if;
    v_old_status := old.status;
  end if;

  v_event_type := case new.status
    when 'enrolled'  then 'enrolled'
    when 'waitlist'  then 'waitlisted'
    when 'cancelled' then 'cancelled'
    when 'attended'  then 'attended'
    when 'noshow'    then 'noshow'
    else 'status_changed'
  end;

  perform public.emit_enrollment_event(
    v_event_type, new.id, new.class_id, new.client_id, v_old_status, new.status
  );

  return null;
exception when others then
  raise warning 'log_enrollment_event failed: %', sqlerrm;
  return null;
end;
$$;

-- ── 3. Renderer: ветка 'deleted' ───────────────────────────────────────
create or replace function public.render_enrollment_event_message(
  p_event_type text, p_class_id uuid, p_client_id uuid, p_actor_role text
) returns text
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_client text;
  v_type   text;
  v_hall   text;
  v_starts timestamptz;
  v_when   text;
  v_actor  text;
begin
  select nullif(trim(coalesce(cl.first_name, '') || ' ' || coalesce(cl.last_name, '')), '')
    into v_client
  from public.clients cl
  where cl.id = p_client_id;

  select c.starts_at,
         coalesce(tt.label, c.ticket_type),
         h.name
    into v_starts, v_type, v_hall
  from public.classes c
  left join public.training_types tt on tt.code = c.ticket_type
  left join public.halls h on h.id = c.hall_id
  where c.id = p_class_id;

  v_when := to_char(v_starts at time zone 'Europe/Kyiv', 'DD.MM HH24:MI');

  v_actor := case p_actor_role
    when 'owner'   then 'адміністратор'
    when 'admin'   then 'адміністратор'
    when 'client'  then 'клієнт'
    when 'trainer' then 'тренер'
    else p_actor_role
  end;

  return case p_event_type
    when 'enrolled' then
      '🟢 Новий запис: ' || coalesce(v_client, 'клієнт')
      || ' на «' || v_type || '» ' || v_when
      || coalesce(', ' || v_hall, '')
      || '. Хто: ' || v_actor || '.'
    when 'cancelled' then
      '🔴 Скасування: ' || coalesce(v_client, 'клієнт')
      || ' — «' || v_type || '» ' || v_when
      || '. Хто: ' || v_actor || '.'
    when 'deleted' then
      '🗑 Видалено запис: ' || coalesce(v_client, 'клієнт')
      || ' — «' || v_type || '» ' || v_when
      || '. Хто: ' || v_actor || '.'
    when 'waitlisted' then
      '🟡 У чергу: ' || coalesce(v_client, 'клієнт')
      || ' (зал повний) — «' || v_type || '» ' || v_when || '.'
    else
      'Зміна запису: ' || coalesce(v_client, 'клієнт')
      || ' — «' || v_type || '» ' || v_when || '.'
  end;
end;
$$;

-- ── 4. delete_enrollment: emit 'deleted' ПЕРЕД удалением строки ─────────
create or replace function public.delete_enrollment(p_enrollment_id uuid)
returns table(success boolean, error_message text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
DECLARE
  v_enrollment public.enrollments%ROWTYPE;
  v_class      public.classes%ROWTYPE;
BEGIN
  IF NOT public.can_manage_class_enrollment(p_enrollment_id) THEN
    RETURN QUERY SELECT false, 'Доступно лише персоналу або тренеру цього заняття'::text; RETURN;
  END IF;

  SELECT * INTO v_enrollment FROM public.enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Запис не знайдено'::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;

  IF v_enrollment.sessions_used > 0 THEN
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_enrollment.client_id, v_class.ticket_type, v_enrollment.sessions_used)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  -- Лог + аутбокс ПЕРЕД DELETE (enrollment_id ще валідний; FK ON DELETE SET NULL
  -- занулить його після видалення, як для cancelled-подій по видалених класах).
  PERFORM public.emit_enrollment_event(
    'deleted', v_enrollment.id, v_enrollment.class_id, v_enrollment.client_id,
    v_enrollment.status, NULL
  );

  DELETE FROM public.enrollments WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM;
END;
$$;
