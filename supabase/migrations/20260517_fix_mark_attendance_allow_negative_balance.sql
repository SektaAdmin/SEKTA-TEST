-- Fix: mark_attendance now allows negative sessions_balance.
-- Previously blocked attendance when balance = 0. Now always deducts,
-- allowing balance to go negative (debt tracking).
CREATE OR REPLACE FUNCTION public.mark_attendance(p_enrollment_id uuid, p_sessions_used integer DEFAULT 1)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_enrollment  public.enrollments%ROWTYPE;
  v_class       public.classes%ROWTYPE;
BEGIN
  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

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

  -- Upsert sessions balance (allow negative)
  INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
  VALUES (v_enrollment.client_id, v_class.ticket_type, -p_sessions_used)
  ON CONFLICT (client_id, ticket_type)
  DO UPDATE SET sessions_balance = client_session_balances.sessions_balance - p_sessions_used;

  UPDATE public.enrollments
  SET status = 'attended',
      sessions_used = p_sessions_used,
      updated_at = now()
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM;
END;
$function$
