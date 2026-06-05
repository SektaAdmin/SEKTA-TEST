-- Захист привілейованих enrollment-RPC від прямого виклику клієнтом/тренером/анонімом.
--
-- Проблема (аудит кабінету 2026-06-05): change_enrollment_status / mark_attendance /
-- cancel_class_and_restore_sessions / reverse_attendance — SECURITY DEFINER, EXECUTE
-- видано PUBLIC (anon+authenticated), БЕЗ перевірки ролі всередині. Залогінений client
-- міг дёрнути їх через /rest/v1/rpc у обхід UI та RLS (DEFINER оминає RLS):
-- відмінити пізнє заняття без штрафу (p_force_no_charge=true), реверснути списану
-- сесію назад на баланс (p_new_status='enrolled'), загнати session-balance у мінус.
--
-- Рішення: гейт can_manage_enrollment() на початку всіх 4 RPC.
--   true якщо: owner/admin (staff-UI, роль authenticated)
--           АБО app.trusted_call='on' (довірений внутрішній виклик — client_cancel)
--           АБО немає JWT І current_user∉{anon,authenticated} (cron під роллю postgres).
-- Підводні камені, враховані тут:
--   1. COALESCE(...,false): інакше false OR NULL OR false = NULL, а `IF NOT NULL`
--      не виконує гілку → гейт обходиться.
--   2. current_user NOT IN ('anon','authenticated'): anon через PostgREST теж не має
--      JWT claims, як і cron — розрізняємо їх за роллю БД.
--   3. REVOKE FROM PUBLIC (не лише anon): EXECUTE був виданий PUBLIC (=X в ACL).

-- ── 1. Гейт ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_enrollment()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    public.auth_role() IN ('owner','admin')
    OR current_setting('app.trusted_call', true) = 'on'
    OR (
      nullif(current_setting('request.jwt.claims', true), '') IS NULL
      AND current_user NOT IN ('anon', 'authenticated')
    ),
    false
  );
$$;

-- ── 2. Права: лише authenticated (staff викликає з браузера; гейт відсіче не-staff) ──
--     mark_attendance — лише cron (postgres), з PostgREST недоступна.
REVOKE EXECUTE ON FUNCTION public.change_enrollment_status(uuid,text,boolean,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_attendance(uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_class_and_restore_sessions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_attendance(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.change_enrollment_status(uuid,text,boolean,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_class_and_restore_sessions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_attendance(uuid) TO authenticated;
-- mark_attendance: GRANT нікому з PostgREST (лишається postgres для cron).

-- ── 3. Гейт у тілі кожної RPC (+ ДОДАНО SET search_path там, де не було — інв. #10) ──

CREATE OR REPLACE FUNCTION public.mark_attendance(p_enrollment_id uuid, p_sessions_used integer DEFAULT 1)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_enrollment  public.enrollments%ROWTYPE;
  v_class       public.classes%ROWTYPE;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  SELECT * INTO v_enrollment FROM public.enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Запис не знайдено'::text; RETURN;
  END IF;
  IF v_enrollment.status = 'attended' THEN
    RETURN QUERY SELECT false, 'Відвідування вже зафіксовано'::text; RETURN;
  END IF;
  IF v_enrollment.status = 'cancelled' THEN
    RETURN QUERY SELECT false, 'Запис скасовано'::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;
  IF v_class.is_cancelled THEN
    RETURN QUERY SELECT false, 'Заняття скасовано'::text; RETURN;
  END IF;

  INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
  VALUES (v_enrollment.client_id, v_class.ticket_type, -p_sessions_used)
  ON CONFLICT (client_id, ticket_type)
  DO UPDATE SET sessions_balance = client_session_balances.sessions_balance - p_sessions_used;

  UPDATE public.enrollments
  SET status = 'attended', sessions_used = p_sessions_used, updated_at = now()
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_enrollment_status(p_enrollment_id uuid, p_new_status text, p_force_no_charge boolean DEFAULT false, p_sessions_used integer DEFAULT NULL::integer)
 RETURNS TABLE(success boolean, charged boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_enrollment public.enrollments%ROWTYPE;
  v_class      public.classes%ROWTYPE;
  v_charge     integer := 0;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, false, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  IF p_new_status NOT IN ('enrolled', 'attended', 'noshow', 'cancelled', 'waitlist') THEN
    RETURN QUERY SELECT false, false, 'Невідомий статус'::text; RETURN;
  END IF;

  SELECT * INTO v_enrollment FROM public.enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 'Запис не знайдено'::text; RETURN;
  END IF;
  IF v_enrollment.status = p_new_status THEN
    RETURN QUERY SELECT true, (v_enrollment.sessions_used > 0), NULL::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;

  v_charge := COALESCE(
    p_sessions_used,
    NULLIF(v_enrollment.sessions_used, 0),
    array_length(v_enrollment.hours_attended, 1),
    1
  );

  IF p_new_status = 'attended' THEN
    IF v_class.is_cancelled THEN
      RETURN QUERY SELECT false, false, 'Заняття скасовано'::text; RETURN;
    END IF;
  ELSIF p_new_status = 'noshow' THEN
    IF p_force_no_charge THEN v_charge := 0; END IF;
  ELSIF p_new_status = 'cancelled' THEN
    IF p_force_no_charge OR now() <= public.cancellation_deadline(v_class.starts_at) THEN
      v_charge := 0;
    END IF;
  ELSE
    v_charge := 0;
  END IF;

  IF v_enrollment.sessions_used > 0 THEN
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_enrollment.client_id, v_class.ticket_type, v_enrollment.sessions_used)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  IF v_charge > 0 THEN
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_enrollment.client_id, v_class.ticket_type, -v_charge)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance - v_charge;
  END IF;

  UPDATE public.enrollments
  SET status = p_new_status, sessions_used = v_charge, updated_at = now()
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, (v_charge > 0), NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, false, SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_class_and_restore_sessions(p_class_id uuid)
 RETURNS TABLE(success boolean, restored_count integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, 0, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.enrollments
  WHERE class_id = p_class_id AND status = 'attended';

  INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
  SELECT e.client_id, c.ticket_type, e.sessions_used
  FROM public.enrollments e
  JOIN public.classes c ON c.id = e.class_id
  WHERE e.class_id = p_class_id AND e.status = 'attended'
  ON CONFLICT (client_id, ticket_type)
  DO UPDATE SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;

  UPDATE public.enrollments
  SET cancelled_from_status = status, status = 'cancelled', sessions_used = 0
  WHERE class_id = p_class_id AND status IN ('attended', 'noshow', 'enrolled');

  UPDATE public.classes SET is_cancelled = true WHERE id = p_class_id;

  RETURN QUERY SELECT true, v_count, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_attendance(p_enrollment_id uuid)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_enrollment public.enrollments%ROWTYPE;
  v_class      public.classes%ROWTYPE;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  SELECT * INTO v_enrollment FROM public.enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Запис не знайдено'::text; RETURN;
  END IF;
  IF v_enrollment.status <> 'attended' THEN
    RETURN QUERY SELECT false, 'Відвідування не зафіксовано'::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;

  INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
  VALUES (v_enrollment.client_id, v_class.ticket_type, v_enrollment.sessions_used)
  ON CONFLICT (client_id, ticket_type)
  DO UPDATE SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;

  UPDATE public.enrollments
  SET status = 'cancelled', sessions_used = 0
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM;
END;
$function$;

-- ── 4. client_cancel: позначити виклик як довірений перед делегуванням ─────────
CREATE OR REPLACE FUNCTION public.client_cancel(p_enrollment_id uuid)
 RETURNS TABLE(success boolean, charged boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Клієнт уже перевірений як власник; p_force_no_charge=false зашито → штраф чесний.
  perform set_config('app.trusted_call', 'on', true);  -- local: скидається в кінці транзакції

  select * into v_res
  from public.change_enrollment_status(p_enrollment_id, 'cancelled', false, null);

  return query select v_res.success, v_res.charged, v_res.error_message;
end;
$function$;
