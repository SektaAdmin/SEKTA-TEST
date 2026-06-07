-- delete_enrollment: фізичне видалення помилкового запису з реверсом сесій.
-- Свідомий виняток з інваріанта «м'які видалення» (#7): «випадкового» запису
-- не повинно існувати в історії взагалі. Гейт can_manage_enrollment() — лише staff.
-- Якщо sessions_used > 0 (вже списано) — повертаємо сесії в client_session_balances
-- тим самим ON CONFLICT-паттерном, що й реверс у change_enrollment_status,
-- ПЕРЕД видаленням рядка.
CREATE OR REPLACE FUNCTION public.delete_enrollment(p_enrollment_id uuid)
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

  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Запис не знайдено'::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;

  -- Повернути списані сесії перед видаленням.
  IF v_enrollment.sessions_used > 0 THEN
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_enrollment.client_id, v_class.ticket_type, v_enrollment.sessions_used)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  DELETE FROM public.enrollments WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM;
END;
$function$;

-- EXECUTE лише authenticated (staff-UI) + postgres. НЕ PUBLIC/anon.
REVOKE ALL ON FUNCTION public.delete_enrollment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_enrollment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_enrollment(uuid) TO postgres;
