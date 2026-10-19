-- Фікси «Запланованого» за аудитом db-guard (2026-10-19).
-- H1: реанімація cancelled/noshow запису обнуляла sessions_used без повернення сесії
--     (пізня відміна → повторний запис → подвійне списання). Тепер реанімація —
--     через change_enrollment_status('enrolled'), який сам повертає sessions_used.
-- M2: trusted_call обходив гейт «тренер цього заняття» → тренер серії міг змінювати
--     заняття своєї серії, перепризначені іншому тренеру. Тепер такі заняття пропускаємо.
-- M1: тренер через upsert_series_client_period міг створювати безстрокових постійників /
--     звужувати постійних. Тепер тренеру — лише тимчасовий період і лише не для постійних.
-- M3: звуження періоду відміняло БУДЬ-ЯКІ записи поза періодом (і ручні разові). Тепер
--     відміняються лише дати, які входили в попередній період.
-- L1: trusted_call відновлюється до попереднього значення, а не 'off'.
-- L2: масові дії не шлють Telegram (лог у enrollment_events лишається), як generate_week.
-- L3: upsert бере той самий advisory-lock пари (серія, клієнт), що create_planned_change.

CREATE OR REPLACE FUNCTION public._planned_apply_class(
  p_class_id uuid, p_client_id uuid, p_action text, p_hours integer[], p_dry_run boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class   classes%ROWTYPE;
  v_enr     enrollments%ROWTYPE;
  v_result  text;
  v_status  text;
  v_cost    integer;
  v_balance integer;
  v_active  integer;
  v_wait    integer;
  v_res     record;
  v_prev    text;
BEGIN
  SELECT * INTO v_class FROM classes WHERE id = p_class_id;
  SELECT * INTO v_enr FROM enrollments WHERE class_id = p_class_id AND client_id = p_client_id;

  -- M2: заняття серії, перепризначене іншому тренеру, — не наше.
  IF auth_role() = 'trainer' AND v_class.trainer_id IS DISTINCT FROM current_trainer_id() THEN
    RETURN jsonb_build_object('class_id', v_class.id, 'starts_at', v_class.starts_at, 'result', 'not_own');
  END IF;

  IF v_class.is_cancelled THEN
    RETURN jsonb_build_object('class_id', v_class.id, 'starts_at', v_class.starts_at,
      'result', CASE WHEN p_action = 'skip' THEN 'not_enrolled' ELSE 'class_cancelled' END);
  END IF;

  v_prev := current_setting('app.trusted_call', true);

  IF p_action = 'skip' THEN
    IF v_enr.id IS NULL OR v_enr.status NOT IN ('enrolled', 'waitlist') THEN
      v_result := 'not_enrolled';
    ELSIF now() > cancellation_deadline(v_class.starts_at) THEN
      v_result := 'after_deadline';
    ELSE
      v_result := 'cancelled';
      IF NOT p_dry_run THEN
        PERFORM set_config('app.trusted_call', 'on', true);
        SELECT * INTO v_res FROM change_enrollment_status(v_enr.id, 'cancelled');
        PERFORM set_config('app.trusted_call', coalesce(v_prev, ''), true);
        IF NOT v_res.success THEN
          RAISE EXCEPTION 'planned skip failed: %', v_res.error_message;
        END IF;
        -- Маркер джерела (не грошове поле): attendance_overview не рахує це пропуском.
        UPDATE enrollments SET cancellation_source = 'planned' WHERE id = v_enr.id;
      END IF;
    END IF;
    RETURN jsonb_build_object('class_id', v_class.id, 'starts_at', v_class.starts_at, 'result', v_result);
  END IF;

  -- enroll
  IF v_enr.id IS NOT NULL AND v_enr.status IN ('enrolled', 'attended', 'waitlist') THEN
    RETURN jsonb_build_object('class_id', v_class.id, 'starts_at', v_class.starts_at,
      'result', 'already', 'status', v_enr.status);
  END IF;

  v_cost := coalesce(array_length(p_hours, 1), 1);
  SELECT sessions_balance INTO v_balance FROM client_session_balances
  WHERE client_id = p_client_id AND ticket_type = v_class.ticket_type;

  IF p_dry_run THEN
    SELECT count(*) FILTER (WHERE status IN ('enrolled', 'attended'))
      INTO v_active
    FROM enrollments WHERE class_id = p_class_id;
    -- Дзеркало тригера check_class_capacity (лише місткість).
    v_status := CASE WHEN v_class.capacity IS NOT NULL AND v_active >= v_class.capacity
                     THEN 'waitlist' ELSE 'enrolled' END;
  ELSIF v_enr.id IS NOT NULL THEN
    -- H1: реанімація cancelled/noshow — через RPC, щоб повернути списане (sessions_used).
    PERFORM set_config('app.trusted_call', 'on', true);
    SELECT * INTO v_res FROM change_enrollment_status(v_enr.id, 'enrolled');
    PERFORM set_config('app.trusted_call', coalesce(v_prev, ''), true);
    IF NOT v_res.success THEN
      RAISE EXCEPTION 'planned enroll failed: %', v_res.error_message;
    END IF;
    -- Немонетарні поля нової заявки (sessions_used уже 0 від RPC).
    UPDATE enrollments
    SET hours_attended = p_hours, cancellation_source = NULL, cancelled_from_status = NULL, staff_note = NULL
    WHERE id = v_enr.id
    RETURNING status INTO v_status;
  ELSE
    INSERT INTO enrollments (class_id, client_id, status, sessions_used, hours_attended)
    VALUES (p_class_id, p_client_id, 'enrolled', 0, p_hours)
    RETURNING status INTO v_status;  -- тригер місткості може поставити waitlist
  END IF;

  RETURN jsonb_build_object(
    'class_id', v_class.id, 'starts_at', v_class.starts_at,
    'result', coalesce(v_status, 'already'),
    'no_sessions', coalesce(v_balance, 0) < v_cost,
    'client_conflict', EXISTS (SELECT 1 FROM check_client_conflict(p_client_id, p_class_id)));
END;
$$;
REVOKE ALL ON FUNCTION public._planned_apply_class(uuid, uuid, text, integer[], boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_planned_change(
  p_series_id uuid, p_client_id uuid, p_action text, p_date_from date, p_date_to date,
  p_note text DEFAULT NULL)
RETURNS TABLE(success boolean, id uuid, applied jsonb, error_message text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_err     text;
  v_id      uuid;
  v_hours   integer[];
  v_applied jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_series_id::text || p_client_id::text, 0));
  -- Масова дія: події логуються, але без Telegram (як generate_week).
  PERFORM set_config('app.suppress_enroll_notify', 'on', true);

  v_err := _planned_validate(p_series_id, p_client_id, p_action, p_date_from, p_date_to);
  IF v_err IS NOT NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, '[]'::jsonb, v_err; RETURN;
  END IF;

  SELECT CASE WHEN cs.duration_min >= 120 THEN ARRAY[1, 2] END INTO v_hours
  FROM class_series cs WHERE cs.id = p_series_id;
  IF p_action = 'skip' THEN v_hours := NULL; END IF;

  INSERT INTO planned_enrollment_changes
    (series_id, client_id, action, date_from, date_to, hours_attended, note, created_by_role)
  VALUES (p_series_id, p_client_id, p_action, p_date_from, p_date_to, v_hours,
          nullif(btrim(p_note), ''), auth_role())
  RETURNING planned_enrollment_changes.id INTO v_id;

  v_applied := _planned_apply_range(p_series_id, p_client_id, p_action, p_date_from, p_date_to, v_hours, false);
  RETURN QUERY SELECT true, v_id, v_applied, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_planned_change failed: %', SQLERRM;
  RETURN QUERY SELECT false, NULL::uuid, '[]'::jsonb, 'Не вдалося зберегти зміну'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.create_planned_change(uuid, uuid, text, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_planned_change(uuid, uuid, text, date, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_series_client_period(
  p_series_id uuid, p_client_id uuid, p_valid_from date, p_valid_to date)
RETURNS TABLE(success boolean, applied jsonb, error_message text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_series   class_series%ROWTYPE;
  v_old      series_clients%ROWTYPE;
  v_hours    integer[];
  v_items    jsonb := '[]'::jsonb;
  v_c        record;
  v_in       boolean;
  v_was_in   boolean;
  v_paused   boolean;
BEGIN
  IF NOT can_manage_series(p_series_id) THEN
    RETURN QUERY SELECT false, '[]'::jsonb, 'Недостатньо прав для цієї групи'::text; RETURN;
  END IF;
  IF p_valid_from IS NOT NULL AND p_valid_to IS NOT NULL AND p_valid_to < p_valid_from THEN
    RETURN QUERY SELECT false, '[]'::jsonb, 'Кінець періоду раніше за початок'::text; RETURN;
  END IF;
  SELECT * INTO v_series FROM class_series WHERE id = p_series_id;
  IF NOT FOUND OR v_series.type <> 'template' THEN
    RETURN QUERY SELECT false, '[]'::jsonb, 'Шаблон не знайдено'::text; RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_series_id::text || p_client_id::text, 0));
  PERFORM set_config('app.suppress_enroll_notify', 'on', true);

  SELECT * INTO v_old FROM series_clients WHERE series_id = p_series_id AND client_id = p_client_id;

  -- M1: тренер — лише тимчасовий період і не для безстрокових постійників.
  IF auth_role() = 'trainer' THEN
    IF p_valid_to IS NULL THEN
      RETURN QUERY SELECT false, '[]'::jsonb, 'Вкажіть кінець періоду'::text; RETURN;
    END IF;
    IF v_old.id IS NOT NULL AND v_old.valid_from IS NULL AND v_old.valid_to IS NULL THEN
      RETURN QUERY SELECT false, '[]'::jsonb, 'Постійника змінює адміністратор'::text; RETURN;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM planned_enrollment_changes pc
             WHERE pc.series_id = p_series_id AND pc.client_id = p_client_id
               AND pc.action = 'enroll' AND pc.is_active
               AND pc.date_to   >= coalesce(p_valid_from, '-infinity'::date)
               AND pc.date_from <= coalesce(p_valid_to, 'infinity'::date)) THEN
    RETURN QUERY SELECT false, '[]'::jsonb, 'Клієнт уже записаний наперед у цю групу — скасуйте той запис'::text; RETURN;
  END IF;

  v_hours := CASE WHEN v_series.duration_min >= 120 THEN ARRAY[1, 2] END;

  INSERT INTO series_clients (series_id, client_id, hours_attended, valid_from, valid_to)
  VALUES (p_series_id, p_client_id, v_hours, p_valid_from, p_valid_to)
  ON CONFLICT (series_id, client_id) DO UPDATE
    SET valid_from = EXCLUDED.valid_from, valid_to = EXCLUDED.valid_to;

  SELECT sc.hours_attended INTO v_hours FROM series_clients sc
  WHERE sc.series_id = p_series_id AND sc.client_id = p_client_id;

  FOR v_c IN
    SELECT c.id, (c.starts_at AT TIME ZONE 'Europe/Kyiv')::date AS d
    FROM classes c
    WHERE c.series_id = p_series_id AND c.starts_at > now()
    ORDER BY c.starts_at
  LOOP
    v_in := (p_valid_from IS NULL OR v_c.d >= p_valid_from) AND (p_valid_to IS NULL OR v_c.d <= p_valid_to);
    v_was_in := v_old.id IS NOT NULL
      AND (v_old.valid_from IS NULL OR v_c.d >= v_old.valid_from)
      AND (v_old.valid_to   IS NULL OR v_c.d <= v_old.valid_to);
    v_paused := EXISTS (SELECT 1 FROM planned_enrollment_changes pc
                        WHERE pc.series_id = p_series_id AND pc.client_id = p_client_id
                          AND pc.action = 'skip' AND pc.is_active
                          AND v_c.d BETWEEN pc.date_from AND pc.date_to);
    IF v_in AND NOT v_paused THEN
      v_items := v_items || _planned_apply_class(v_c.id, p_client_id, 'enroll', v_hours, false);
    ELSIF NOT v_in AND v_was_in THEN
      -- M3: лише дати, що раніше входили в період постійника.
      v_items := v_items || _planned_apply_class(v_c.id, p_client_id, 'skip', NULL, false);
    END IF;
  END LOOP;

  RETURN QUERY SELECT true, v_items, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'upsert_series_client_period failed: %', SQLERRM;
  RETURN QUERY SELECT false, '[]'::jsonb, 'Не вдалося зберегти період'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_series_client_period(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_series_client_period(uuid, uuid, date, date) TO authenticated;
