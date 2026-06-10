-- Явна позначка часу скасування запису.
-- Модель відміни (узгоджено): «що сталося» (рано/пізно) лишається похідним від
-- sessions_used (інв. #2 — фінансовий факт у балансі сесій, не в окремому статусі),
-- «хто» = cancellation_source (self/staff_manual/class_cancelled/auto_close),
-- «коли» = НОВЕ поле cancelled_at. Статус НЕ розділяємо на early/late (єдине
-- джерело правди зі sessions_used). Аддитивна міграція — нічого не ламає.

ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

COMMENT ON COLUMN public.enrollments.cancelled_at IS
  'Час переходу запису в cancelled. NULL поки не скасовано. «Рано/пізно» — похідне від sessions_used, не звідси.';

-- Бекфіл наявних скасувань: беремо updated_at (на момент скасування він і є часом).
UPDATE public.enrollments
SET cancelled_at = updated_at
WHERE status = 'cancelled' AND cancelled_at IS NULL;

-- ── change_enrollment_status: ставити cancelled_at при переході в cancelled,
--    скидати в NULL при виході з cancelled (реактивація) ──────────────────────
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
  v_source     text;
  v_cancelled_at timestamptz;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, false, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  IF p_new_status NOT IN ('enrolled', 'attended', 'noshow', 'cancelled', 'waitlist') THEN
    RETURN QUERY SELECT false, false, 'Невідомий статус'::text; RETURN;
  END IF;

  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

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

  -- cancellation_source/cancelled_at: ставимо при cancelled, скидаємо інакше.
  -- 'self' виставляє client_cancel після цього виклику (перезаписує source).
  IF p_new_status = 'cancelled' THEN
    v_source := 'staff_manual';
    v_cancelled_at := now();
  ELSE
    v_source := NULL;
    v_cancelled_at := NULL;
  END IF;

  UPDATE public.enrollments
  SET status              = p_new_status,
      sessions_used       = v_charge,
      cancellation_source = v_source,
      cancelled_at        = v_cancelled_at,
      updated_at          = now()
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, (v_charge > 0), NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, false, SQLERRM;
END;
$function$;

-- ── cancel_class_and_restore_sessions: проставити cancelled_at пакету ─────────
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
  WHERE class_id = p_class_id
    AND status IN ('attended', 'noshow')
    AND sessions_used > 0;

  INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
  SELECT e.client_id, c.ticket_type, e.sessions_used
  FROM public.enrollments e
  JOIN public.classes c ON c.id = e.class_id
  WHERE e.class_id = p_class_id
    AND e.status IN ('attended', 'noshow')
    AND e.sessions_used > 0
  ON CONFLICT (client_id, ticket_type)
  DO UPDATE SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;

  UPDATE public.enrollments
  SET cancelled_from_status   = status,
      status                  = 'cancelled',
      sessions_used           = 0,
      cancellation_source     = 'class_cancelled',
      cancelled_at            = now(),
      updated_at              = now()
  WHERE class_id = p_class_id
    AND status IN ('attended', 'noshow', 'enrolled');

  UPDATE public.classes SET is_cancelled = true WHERE id = p_class_id;

  RETURN QUERY SELECT true, v_count, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, SQLERRM;
END;
$function$;

-- ── reverse_attendance: attended→cancelled теж має позначати «коли/хто» ──────
-- (раніше ставив лише status/sessions_used — без source/cancelled_at/updated_at).
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
  SET status              = 'cancelled',
      sessions_used       = 0,
      cancellation_source = 'staff_manual',
      cancelled_at        = now(),
      updated_at          = now()
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM;
END;
$function$;
