-- Fix #10: p_force_no_charge без аудит-сліду
-- Адмін обнуляє штраф (скасування після дедлайну без списання), але причина
-- ніде не фіксується → неможливо відновити хто/чому.
-- Рішення: нова колонка enrollments.staff_note + p_staff_note у change_enrollment_status.

ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS staff_note text;

-- Оновлюємо change_enrollment_status: приймає p_staff_note і записує в enrollments
CREATE OR REPLACE FUNCTION public.change_enrollment_status(
  p_enrollment_id uuid,
  p_new_status    text,
  p_force_no_charge boolean DEFAULT false,
  p_sessions_used   integer DEFAULT NULL,
  p_staff_note      text    DEFAULT NULL
)
RETURNS TABLE(success boolean, charged boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
      -- staff_note зберігається лише при force_no_charge (аудит-слід)
      staff_note          = CASE
                              WHEN p_force_no_charge AND p_staff_note IS NOT NULL THEN p_staff_note
                              WHEN p_force_no_charge AND p_staff_note IS NULL     THEN staff_note
                              ELSE NULL
                            END,
      updated_at          = now()
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, (v_charge > 0), NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, false, SQLERRM;
END;
$$;
