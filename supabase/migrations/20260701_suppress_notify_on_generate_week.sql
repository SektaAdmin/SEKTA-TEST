-- Гасить лавину Telegram-нотифікацій при виставленні розкладу з шаблонів.
--
-- generate_week() bulk-вставляє enrollments для кожного постійника кожного
-- заняття тижня → тригер log_enrollment_event → emit_enrollment_event →
-- notify=true + миттєвий dispatch на КОЖЕН рядок. Для тижня на 5+ занять з
-- постійниками власник заняття отримував десятки повідомлень за секунди.
--
-- Рішення: generate_week ставить транзакційний прапорець
-- app.suppress_enroll_notify='on'; emit_enrollment_event його читає і форсує
-- notify=false. Подія ВСЕ ОДНО пишеться в enrollment_events (лог /audit
-- лишається повним) — гаситься лише Telegram-доставка.

-- 1) generate_week: виставити прапорець на час транзакції RPC.
CREATE OR REPLACE FUNCTION public.generate_week(p_start_date date, p_weeks integer DEFAULT 1)
 RETURNS TABLE(classes_created integer, enrollments_created integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_series record;
  v_week_offset int;
  v_week_start date;
  v_class_date date;
  v_class_id uuid;
  v_classes_created int := 0;
  v_enrollments_created int := 0;
  v_count int;
BEGIN
  -- Масова генерація: тригер enrollment_events логує події, але НЕ шле Telegram.
  perform set_config('app.suppress_enroll_notify', 'on', true);

  FOR v_week_offset IN 0..(p_weeks - 1) LOOP
    v_week_start := p_start_date + (v_week_offset * 7);

    FOR v_series IN SELECT * FROM class_series WHERE type = 'template' LOOP
      v_class_id := NULL;

      v_class_date := v_week_start + ((v_series.day_of_week - EXTRACT(DOW FROM v_week_start)::int + 7) % 7);

      INSERT INTO classes (series_id, trainer_id, hall_id, ticket_type, title, starts_at, duration_min, capacity, notes)
      VALUES (
        v_series.id,
        v_series.trainer_id,
        v_series.hall_id,
        v_series.ticket_type,
        v_series.title,
        (v_class_date::text || ' ' || v_series.time_of_day::text)::timestamp AT TIME ZONE 'Europe/Kyiv',
        v_series.duration_min,
        v_series.capacity,
        v_series.notes
      )
      ON CONFLICT (series_id, (date(starts_at AT TIME ZONE 'Europe/Kyiv'::text))) WHERE series_id IS NOT NULL DO NOTHING
      RETURNING id INTO v_class_id;

      IF v_class_id IS NOT NULL THEN
        v_classes_created := v_classes_created + 1;

        INSERT INTO enrollments (class_id, client_id, status, sessions_used, hours_attended)
        SELECT v_class_id, sc.client_id, 'enrolled', 0, sc.hours_attended
        FROM series_clients sc
        WHERE sc.series_id = v_series.id
        ON CONFLICT (class_id, client_id) DO NOTHING;

        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_enrollments_created := v_enrollments_created + v_count;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_classes_created, v_enrollments_created;
END;
$function$;

-- 2) emit_enrollment_event: поважати прапорець → notify=false (подія лог-иться).
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

  -- Масова генерація тижня з шаблонів (generate_week) глушить доставку, щоб
  -- не лити десятки повідомлень власнику. Подія все одно лог-иться (/audit).
  if current_setting('app.suppress_enroll_notify', true) = 'on' then
    v_notify := false;
  end if;

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

  -- Миттєва відправка: не чекаємо тіку pg_cron (лаг ≤60с). pg_net-запит
  -- транзакційний → відкотиться разом з RPC, фантомних нотифікацій нема.
  -- Крон лишається фолбеком: фаза 2 (підтвердження delivered) + ретраї.
  if v_notify then
    begin
      perform public.dispatch_telegram_notifications();
    exception when others then
      raise warning 'instant dispatch failed (cron fallback): %', sqlerrm;
    end;
  end if;
exception when others then
  raise warning 'emit_enrollment_event failed: %', sqlerrm;
end;
$function$;
