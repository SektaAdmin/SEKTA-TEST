-- Додає рядок «(N місце/місця/місць)» у Telegram-нотифікацію тренеру.
-- Кількість вільних місць «після дії» + резерв (waitlist), укр. склонення.
-- render отримує 5-й параметр p_enrollment_id: для 'deleted' виключає видаляєму
-- строку з COUNT (delete_enrollment кличе emit ПЕРЕД DELETE → інакше +1 зайве).

CREATE OR REPLACE FUNCTION public.render_enrollment_event_message(p_event_type text, p_class_id uuid, p_client_id uuid, p_actor_role text, p_enrollment_id uuid DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_client    text;
  v_type      text;
  v_hall      text;
  v_starts    timestamptz;
  v_local     timestamptz;
  v_weekday   text;
  v_date      text;
  v_time      text;
  v_actor     text;
  v_header    text;
  v_body      text;
  -- місця
  v_exclude   uuid;
  v_capacity  integer;
  v_taken     integer;
  v_waitlist  integer;
  v_free      integer;
  v_n100      integer;
  v_n10       integer;
  v_word      text;
  v_places    text;
begin
  select nullif(trim(coalesce(cl.first_name, '') || ' ' || coalesce(cl.last_name, '')), '')
    into v_client
  from public.clients cl
  where cl.id = p_client_id;

  select c.starts_at,
         coalesce(tt.label, c.ticket_type),
         h.name,
         c.capacity
    into v_starts, v_type, v_hall, v_capacity
  from public.classes c
  left join public.training_types tt on tt.code = c.ticket_type
  left join public.halls h on h.id = c.hall_id
  where c.id = p_class_id;

  v_local := v_starts at time zone 'Europe/Kyiv';

  v_weekday := case extract(isodow from v_local)::int
    when 1 then 'Понеділок'
    when 2 then 'Вівторок'
    when 3 then 'Середа'
    when 4 then 'Четвер'
    when 5 then 'Пʼятниця'
    when 6 then 'Субота'
    when 7 then 'Неділя'
  end;

  v_date := to_char(v_local, 'DD.MM');
  v_time := to_char(v_local, 'HH24:MI');

  v_actor := case p_actor_role
    when 'owner'   then 'Адмін'
    when 'admin'   then 'Адмін'
    when 'client'  then 'Клієнт'
    when 'trainer' then 'Тренер'
    else p_actor_role
  end;

  v_header := case p_event_type
    when 'enrolled'   then '🟢 Новий запис'
    when 'cancelled'  then '🔴 Відміна запису'
    when 'deleted'    then '🗑 Видалено запис'
    when 'waitlisted' then '🟡 У чергу'
    else 'Зміна запису'
  end;

  -- Підрахунок місць «після дії».
  -- Тригер спрацьовує AFTER (рядок уже в новому статусі), АЛЕ для 'deleted'
  -- delete_enrollment кличе emit ПЕРЕД DELETE → рядок ще існує, тому виключаємо його.
  if p_event_type = 'deleted' then
    v_exclude := p_enrollment_id;
  end if;

  select
    count(*) filter (where status in ('enrolled', 'attended')),
    count(*) filter (where status = 'waitlist')
    into v_taken, v_waitlist
  from public.enrollments
  where class_id = p_class_id
    and (v_exclude is null or id <> v_exclude);

  if v_capacity is null then
    v_places := '∞ місць';
  else
    v_free := greatest(v_capacity - v_taken, 0);
    if v_free = 0 then
      v_places := '❌ місць';
    else
      -- укр. склонення «місце»
      v_n100 := v_free % 100;
      v_n10  := v_free % 10;
      if v_n10 = 1 and v_n100 <> 11 then
        v_word := 'місце';
      elsif v_n10 between 2 and 4 and v_n100 not between 12 and 14 then
        v_word := 'місця';
      else
        v_word := 'місць';
      end if;
      v_places := v_free::text || ' ' || v_word;
    end if;
  end if;

  if v_waitlist > 0 then
    v_places := v_places || ' · у резерві ' || v_waitlist::text;
  end if;

  v_body :=
       'Клас:  ' || coalesce(v_type, '—') || E'\n'
    || 'Дата:  ' || coalesce(v_weekday || ', ', '') || coalesce(v_date, '—') || E'\n'
    || 'Час:   ' || coalesce(v_time, '—') || E'\n'
    || 'Зал:   ' || coalesce(v_hall, '—');

  return v_header || ' (' || v_actor || ')' || E'\n\n'
    || v_body || E'\n\n'
    || 'Клієнт: <b>' || replace(replace(replace(
         coalesce(v_client, 'клієнт'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
    || '</b>' || E'\n\n'
    || '(' || v_places || ')';
end;
$function$;

-- emit_enrollment_event тепер передає p_enrollment_id у render (для коректного 'deleted').
CREATE OR REPLACE FUNCTION public.emit_enrollment_event(p_event_type text, p_enrollment_id uuid, p_class_id uuid, p_client_id uuid, p_old_status text, p_new_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      p_event_type, p_class_id, p_client_id, v_actor_role, p_enrollment_id
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
$function$;
