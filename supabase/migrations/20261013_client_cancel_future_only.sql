-- #3 (MEDIUM): client_cancel не перевіряв ні статус, ні чи заняття в минулому → клієнт міг
-- перевести власний минулий attended/noshow у cancelled (cancellation_source='self'), спотворюючи
-- історію відвідувань і вхідні дані ЗП тренера (calc_trainer_salary_v2 рахує attended).
-- Фікс: клієнт через кабінет скасовує ЛИШЕ майбутній активний запис (enrolled/waitlist, заняття
-- ще не почалось). Персонал/тренер (change_enrollment_status напряму) — без змін.
-- CREATE OR REPLACE: сигнатура та сама → EXECUTE-гранти збережено.

CREATE OR REPLACE FUNCTION public.client_cancel(p_enrollment_id uuid)
  RETURNS TABLE(success boolean, charged boolean, error_message text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id uuid;
  v_owner_id  uuid;
  v_status    text;
  v_starts    timestamptz;
  v_res       record;
BEGIN
  IF auth_role() <> 'client' THEN
    RETURN QUERY SELECT false, false, 'Доступно лише клієнту'::text; RETURN;
  END IF;

  v_client_id := current_client_id();
  IF v_client_id IS NULL THEN
    RETURN QUERY SELECT false, false, 'Кабінет не привʼязано до клієнта'::text; RETURN;
  END IF;

  SELECT e.client_id, e.status, c.starts_at
    INTO v_owner_id, v_status, v_starts
  FROM public.enrollments e
  JOIN public.classes c ON c.id = e.class_id
  WHERE e.id = p_enrollment_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 'Запис не знайдено'::text; RETURN;
  END IF;
  IF v_owner_id <> v_client_id THEN
    RETURN QUERY SELECT false, false, 'Це не ваш запис'::text; RETURN;
  END IF;

  -- Клієнт скасовує лише МАЙБУТНЄ активне. Минулі/закриті (attended/noshow/cancelled) та
  -- заняття, що вже почались, — недоступні (історію не переписуємо).
  IF v_status NOT IN ('enrolled', 'waitlist') OR v_starts <= now() THEN
    RETURN QUERY SELECT false, false, 'Скасувати можна лише майбутній активний запис'::text; RETURN;
  END IF;

  PERFORM set_config('app.trusted_call', 'on', true);

  SELECT * INTO v_res
  FROM public.change_enrollment_status(p_enrollment_id, 'cancelled', false, null);

  -- Проставляємо source після change_enrollment_status (який ставить staff_manual за замовчуванням)
  UPDATE public.enrollments
  SET cancellation_source = 'self'
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT v_res.success, v_res.charged, v_res.error_message;
END;
$function$;
