-- Повертає сесії клієнту при скасуванні одного enrollment зі статусом attended
CREATE OR REPLACE FUNCTION public.reverse_attendance(p_enrollment_id uuid)
RETURNS TABLE(success boolean, error_message text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_enrollment public.enrollments%ROWTYPE;
  v_class      public.classes%ROWTYPE;
BEGIN
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
$$;

-- Скасовує заняття та повертає сесії всім клієнтам зі статусом attended
CREATE OR REPLACE FUNCTION public.cancel_class_and_restore_sessions(p_class_id uuid)
RETURNS TABLE(success boolean, restored_count int, error_message text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int;
BEGIN
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
  SET status = 'cancelled', sessions_used = 0
  WHERE class_id = p_class_id AND status = 'attended';

  UPDATE public.classes SET is_cancelled = true WHERE id = p_class_id;

  RETURN QUERY SELECT true, v_count, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_attendance(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cancel_class_and_restore_sessions(uuid) TO authenticated, anon;
