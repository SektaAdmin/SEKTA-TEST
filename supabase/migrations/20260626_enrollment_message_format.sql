-- ── Новий формат повідомлення тренеру (багаторядковий) ──────────────────────
-- Замість однорядкового тексту — блок Клас/Дата/Час/Зал + жирне імʼя клієнта.
-- Роль актора українською: (Адмін)/(Клієнт)/(Тренер).
-- Жирне імʼя через <b>…</b> + parse_mode=HTML у dispatch_telegram_notifications.
-- (legacy Markdown не підтримує **; MarkdownV2 вимагає екранування — HTML простіший.)

create or replace function public.render_enrollment_event_message(
  p_event_type text,
  p_class_id   uuid,
  p_client_id  uuid,
  p_actor_role text
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_client   text;
  v_type     text;
  v_hall     text;
  v_starts   timestamptz;
  v_local    timestamptz;
  v_weekday  text;
  v_date     text;
  v_time     text;
  v_actor    text;
  v_header   text;
  v_body     text;
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

  v_body :=
       'Клас:  ' || coalesce(v_type, '—') || E'\n'
    || 'Дата:  ' || coalesce(v_weekday || ', ', '') || coalesce(v_date, '—') || E'\n'
    || 'Час:   ' || coalesce(v_time, '—') || E'\n'
    || 'Зал:   ' || coalesce(v_hall, '—');

  -- HTML parse_mode: екрануємо &<> у імені (інші поля — без спецсимволів)
  return v_header || ' (' || v_actor || ')' || E'\n\n'
    || v_body || E'\n\n'
    || 'Клієнт: <b>' || replace(replace(replace(
         coalesce(v_client, 'клієнт'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
    || '</b>';
end;
$$;

revoke all on function public.render_enrollment_event_message(text, uuid, uuid, text) from public;

-- ── parse_mode=Markdown у відправнику (щоб **імʼя** було жирним) ──────────────
create or replace function public.dispatch_telegram_notifications()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
  r       record;
  v_req   bigint;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'telegram_bot_token'
  limit 1;

  if v_token is null then
    raise warning 'dispatch_telegram_notifications: vault secret telegram_bot_token відсутній';
    return;
  end if;

  -- PHASE 1: CONFIRM
  for r in
    select ee.id, ee.request_id
    from public.enrollment_events ee
    where ee.notify
      and not ee.delivered
      and ee.request_id is not null
  loop
    declare
      v_status int;
      v_err    text;
      v_ok     boolean;
      v_found  boolean := false;
    begin
      select resp.status_code,
             resp.error_msg,
             (resp.content::jsonb ->> 'ok')::boolean
        into v_status, v_err, v_ok
      from net._http_response resp
      where resp.id = r.request_id;

      v_found := found;

      if not v_found then
        continue;
      end if;

      if v_status = 200 and coalesce(v_ok, false) then
        update public.enrollment_events
        set delivered    = true,
            delivered_at  = now(),
            last_error    = null
        where id = r.id;
      else
        update public.enrollment_events
        set request_id = null,
            last_error = coalesce(v_err, 'telegram ok=false / status ' || coalesce(v_status::text, 'null'))
        where id = r.id;
      end if;
    end;
  end loop;

  -- PHASE 2: SEND (timeout 15s — handshake до Telegram інколи ~5с)
  for r in
    select ee.id,
           coalesce(ee.telegram_chat_id, t.telegram_chat_id) as chat_id,
           ee.message_text
    from public.enrollment_events ee
    left join public.trainers t on t.id = ee.owner_trainer_id
    where ee.notify
      and not ee.delivered
      and ee.request_id is null
      and ee.message_text is not null
      and ee.delivery_attempts < 5
      and coalesce(ee.telegram_chat_id, t.telegram_chat_id) is not null
    order by ee.created_at
    limit 50
  loop
    v_req := net.http_post(
      url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body    := jsonb_build_object(
                   'chat_id', r.chat_id,
                   'text', r.message_text,
                   'parse_mode', 'HTML'
                 ),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 15000
    );

    update public.enrollment_events
    set request_id        = v_req,
        dispatched_at     = now(),
        delivery_attempts = delivery_attempts + 1
    where id = r.id;
  end loop;
end;
$$;
