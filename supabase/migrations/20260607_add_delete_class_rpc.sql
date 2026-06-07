-- delete_class: фізичне видалення помилково створеного заняття разом із записами.
-- На відміну від cancel_class_and_restore_sessions (м'яке, is_cancelled=true,
-- лишається в історії) — це для занять, яких не повинно існувати взагалі.
-- Свідомий виняток з інваріанта #7 (м'які видалення).
--
-- Перед DELETE повертаємо списані сесії по ВСІХ записах (CASCADE на
-- enrollments_class_id_fkey зніс би їх в обхід реверсу балансу). ticket_type
-- спільний для заняття, тож реверс агрегуємо по client_id.
-- Гейт can_manage_enrollment() — лише staff.
CREATE OR REPLACE FUNCTION public.delete_class(p_class_id uuid)
 RETURNS TABLE(success boolean, restored_count integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_class    public.classes%ROWTYPE;
  v_restored integer := 0;
  r          record;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, 0, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  SELECT * INTO v_class
  FROM public.classes
  WHERE id = p_class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Заняття не знайдено'::text; RETURN;
  END IF;

  -- Повернути списані сесії всім, у кого sessions_used > 0 (агрегат по клієнту).
  FOR r IN
    SELECT client_id, SUM(sessions_used) AS total
    FROM public.enrollments
    WHERE class_id = p_class_id AND sessions_used > 0
    GROUP BY client_id
  LOOP
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (r.client_id, v_class.ticket_type, r.total)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
    v_restored := v_restored + 1;
  END LOOP;

  -- CASCADE (enrollments_class_id_fkey ON DELETE CASCADE) знесе записи.
  DELETE FROM public.classes WHERE id = p_class_id;

  RETURN QUERY SELECT true, v_restored, NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0, SQLERRM;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_class(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_class(uuid) TO postgres;
