-- Відкладені зміни запису («Заплановане»).
-- Намір наперед для тижнів, які ще не відкриті generate_week:
--   • пауза постійника в конкретній групі (planned_enrollment_changes.action='skip');
--   • разовий / періодичний запис у слот шаблону (action='enroll');
--   • тимчасовий постійник (series_clients.valid_from/valid_to);
--   • тимчасовий шаблон, напр. індив на місяць (class_series.valid_from/valid_to).
-- Для вже відкритих дат намір застосовується одразу (_planned_apply_class).
-- Баланс сесій не чіпаємо напряму: відміна — лише через change_enrollment_status (інв. #2/#3),
-- запис — INSERT enrolled/sessions_used=0 (списання як завжди через auto_close).

-- ── 1. Періоди дії ─────────────────────────────────────────────────────────
ALTER TABLE public.series_clients
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to   date;
ALTER TABLE public.series_clients
  ADD CONSTRAINT series_clients_valid_range
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from);

ALTER TABLE public.class_series
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to   date;
ALTER TABLE public.class_series
  ADD CONSTRAINT class_series_valid_range
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from);

-- ── 2. Таблиця планових змін ───────────────────────────────────────────────
CREATE TABLE public.planned_enrollment_changes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id       uuid NOT NULL REFERENCES public.class_series(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  action          text NOT NULL CHECK (action IN ('skip', 'enroll')),
  date_from       date NOT NULL,
  date_to         date NOT NULL,
  hours_attended  integer[],
  note            text,
  created_by      uuid DEFAULT auth.uid(),
  created_by_role text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  is_active       boolean NOT NULL DEFAULT true,
  CONSTRAINT planned_enrollment_changes_range CHECK (date_to >= date_from)
);
CREATE INDEX planned_enrollment_changes_series_idx
  ON public.planned_enrollment_changes (series_id, is_active, date_from, date_to);
CREATE INDEX planned_enrollment_changes_client_idx
  ON public.planned_enrollment_changes (client_id);

ALTER TABLE public.planned_enrollment_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_admin_select ON public.planned_enrollment_changes
  FOR SELECT TO authenticated
  USING (auth_role() IN ('owner', 'admin'));
CREATE POLICY trainer_select_own ON public.planned_enrollment_changes
  FOR SELECT TO authenticated
  USING (auth_role() = 'trainer'
         AND series_id IN (SELECT cs.id FROM public.class_series cs WHERE cs.trainer_id = current_trainer_id()));
-- Запис — лише через RPC (SECURITY DEFINER).
REVOKE ALL ON public.planned_enrollment_changes FROM anon, authenticated;
GRANT SELECT ON public.planned_enrollment_changes TO authenticated;

-- ── 3. Нове джерело відміни ────────────────────────────────────────────────
ALTER TABLE public.enrollments DROP CONSTRAINT enrollments_cancellation_source_check;
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_cancellation_source_check
  CHECK (cancellation_source = ANY (ARRAY['self', 'staff_manual', 'class_cancelled', 'auto_close', 'planned']));

-- ── 4. Гейт «може керувати серією» ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_series(p_series_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    auth_role() IN ('owner', 'admin')
    OR (auth_role() = 'trainer'
        AND EXISTS (SELECT 1 FROM class_series cs
                    WHERE cs.id = p_series_id AND cs.trainer_id = current_trainer_id())),
    false
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_series(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_series(uuid) TO authenticated;

-- ── 5. Склад заняття серії на дату (єдине джерело для generate_week і примарних слотів) ──
CREATE OR REPLACE FUNCTION public.series_roster(p_series_id uuid, p_date date)
RETURNS TABLE(client_id uuid, first_name text, last_name text, hours_attended integer[],
              source text, paused boolean, valid_to date, pause_to date, change_id uuid)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT sc.client_id, cl.first_name, cl.last_name, sc.hours_attended,
         CASE WHEN sc.valid_from IS NULL AND sc.valid_to IS NULL THEN 'regular' ELSE 'temp_regular' END,
         (p.id IS NOT NULL), sc.valid_to, p.date_to, p.id
  FROM series_clients sc
  JOIN clients cl ON cl.id = sc.client_id
  LEFT JOIN LATERAL (
    SELECT pc.id, pc.date_to FROM planned_enrollment_changes pc
    WHERE pc.series_id = sc.series_id AND pc.client_id = sc.client_id
      AND pc.action = 'skip' AND pc.is_active
      AND p_date BETWEEN pc.date_from AND pc.date_to
    LIMIT 1
  ) p ON true
  WHERE sc.series_id = p_series_id
    AND (sc.valid_from IS NULL OR sc.valid_from <= p_date)
    AND (sc.valid_to   IS NULL OR sc.valid_to   >= p_date)
  UNION ALL
  SELECT pc.client_id, cl.first_name, cl.last_name, pc.hours_attended,
         'planned', false, NULL::date, pc.date_to, pc.id
  FROM planned_enrollment_changes pc
  JOIN clients cl ON cl.id = pc.client_id
  WHERE pc.series_id = p_series_id AND pc.action = 'enroll' AND pc.is_active
    AND p_date BETWEEN pc.date_from AND pc.date_to
    AND NOT EXISTS (
      SELECT 1 FROM series_clients sc
      WHERE sc.series_id = pc.series_id AND sc.client_id = pc.client_id
        AND (sc.valid_from IS NULL OR sc.valid_from <= p_date)
        AND (sc.valid_to   IS NULL OR sc.valid_to   >= p_date)
    );
$$;
REVOKE ALL ON FUNCTION public.series_roster(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.series_roster(uuid, date) TO authenticated;

-- ── 6. Примарні слоти: заняття шаблонів, яких ще нема (тиждень не відкрито) ──
CREATE OR REPLACE FUNCTION public.projected_template_slots(p_from date, p_to date)
RETURNS TABLE(series_id uuid, class_date date, starts_at timestamptz, duration_min integer,
              hall_id uuid, trainer_id uuid, ticket_type text, title text, capacity integer,
              roster_count integer, paused_count integer)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH days AS (
    SELECT d::date AS d
    FROM generate_series(p_from, least(p_to, p_from + 62), interval '1 day') d
  ),
  slots AS (
    SELECT cs.*, dd.d,
           ((dd.d::text || ' ' || cs.time_of_day::text)::timestamp AT TIME ZONE 'Europe/Kyiv') AS st
    FROM class_series cs
    JOIN days dd ON EXTRACT(DOW FROM dd.d)::int = cs.day_of_week
    WHERE cs.type = 'template'
      AND (cs.valid_from IS NULL OR cs.valid_from <= dd.d)
      AND (cs.valid_to   IS NULL OR cs.valid_to   >= dd.d)
  )
  SELECT s.id, s.d, s.st, s.duration_min, s.hall_id, s.trainer_id, s.ticket_type, s.title, s.capacity,
         r.active::int, r.paused::int
  FROM slots s
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE NOT x.paused) AS active,
           count(*) FILTER (WHERE x.paused)     AS paused
    FROM series_roster(s.id, s.d) x
  ) r
  WHERE s.st > now()
    AND NOT EXISTS (
      SELECT 1 FROM classes c
      WHERE c.series_id = s.id
        AND date(c.starts_at AT TIME ZONE 'Europe/Kyiv') = s.d
    );
$$;
REVOKE ALL ON FUNCTION public.projected_template_slots(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.projected_template_slots(date, date) TO authenticated;

-- Перетин нового заняття з примарним слотом шаблону (зал/тренер).
-- Окремо від check_class_conflicts: generate_week кличе той, і власні примарні слоти
-- там дали б хибний конфлікт сам із собою.
CREATE OR REPLACE FUNCTION public.check_template_slot_conflicts(
  p_starts_at timestamptz, p_duration_min integer,
  p_hall_id uuid DEFAULT NULL, p_trainer_id uuid DEFAULT NULL)
RETURNS TABLE(conflict_type text, series_id uuid, starts_at timestamptz, title text, ticket_type text)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN p.hall_id = p_hall_id AND p_hall_id IS NOT NULL THEN 'hall' ELSE 'trainer' END,
         p.series_id, p.starts_at, p.title, p.ticket_type
  FROM projected_template_slots(
         (p_starts_at AT TIME ZONE 'Europe/Kyiv')::date,
         (p_starts_at AT TIME ZONE 'Europe/Kyiv')::date) p
  WHERE p.starts_at < p_starts_at + make_interval(mins => p_duration_min)
    AND p.starts_at + make_interval(mins => p.duration_min) > p_starts_at
    AND ((p_hall_id IS NOT NULL AND p.hall_id = p_hall_id)
         OR (p_trainer_id IS NOT NULL AND p.trainer_id = p_trainer_id))
  LIMIT 5;
$$;
REVOKE ALL ON FUNCTION public.check_template_slot_conflicts(timestamptz, integer, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_template_slot_conflicts(timestamptz, integer, uuid, uuid) TO authenticated;

-- ── 7. Застосування наміру до одного вже створеного заняття ────────────────
-- result: cancelled | after_deadline | not_enrolled | enrolled | waitlist | already | class_cancelled
-- + no_sessions (лише для enroll), client_conflict.
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
BEGIN
  SELECT * INTO v_class FROM classes WHERE id = p_class_id;
  SELECT * INTO v_enr FROM enrollments WHERE class_id = p_class_id AND client_id = p_client_id;

  IF v_class.is_cancelled THEN
    RETURN jsonb_build_object('class_id', v_class.id, 'starts_at', v_class.starts_at,
      'result', CASE WHEN p_action = 'skip' THEN 'not_enrolled' ELSE 'class_cancelled' END);
  END IF;

  IF p_action = 'skip' THEN
    IF v_enr.id IS NULL OR v_enr.status NOT IN ('enrolled', 'waitlist') THEN
      v_result := 'not_enrolled';
    ELSIF now() > cancellation_deadline(v_class.starts_at) THEN
      -- Після дедлайну рішення за адміном (відміна зі списанням / залишити).
      v_result := 'after_deadline';
    ELSE
      v_result := 'cancelled';
      IF NOT p_dry_run THEN
        PERFORM set_config('app.trusted_call', 'on', true);
        SELECT * INTO v_res FROM change_enrollment_status(v_enr.id, 'cancelled');
        PERFORM set_config('app.trusted_call', 'off', true);
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
    SELECT count(*) FILTER (WHERE status IN ('enrolled', 'attended')),
           count(*) FILTER (WHERE status = 'waitlist')
      INTO v_active, v_wait
    FROM enrollments WHERE class_id = p_class_id;
    v_status := CASE WHEN v_wait > 0 OR (v_class.capacity IS NOT NULL AND v_active >= v_class.capacity)
                     THEN 'waitlist' ELSE 'enrolled' END;
  ELSE
    INSERT INTO enrollments (class_id, client_id, status, sessions_used, hours_attended)
    VALUES (p_class_id, p_client_id, 'enrolled', 0, p_hours)
    ON CONFLICT (class_id, client_id) DO UPDATE
      SET status                = 'enrolled',
          hours_attended        = EXCLUDED.hours_attended,
          sessions_used         = 0,
          sale_id               = NULL,
          cancelled_at          = NULL,
          cancellation_source   = NULL,
          cancelled_from_status = NULL,
          staff_note            = NULL,
          updated_at            = now()
      WHERE enrollments.status IN ('cancelled', 'noshow')
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

-- Застосування до діапазону: відкриті (створені) майбутні заняття серії → по заняттю;
-- невідкриті дати → 'pending' (спрацює в generate_week).
CREATE OR REPLACE FUNCTION public._planned_apply_range(
  p_series_id uuid, p_client_id uuid, p_action text,
  p_from date, p_to date, p_hours integer[], p_dry_run boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_items jsonb := '[]'::jsonb;
  v_c     record;
  v_slot  record;
BEGIN
  FOR v_c IN
    SELECT c.id, c.starts_at FROM classes c
    WHERE c.series_id = p_series_id
      AND c.starts_at > now()
      AND (c.starts_at AT TIME ZONE 'Europe/Kyiv')::date BETWEEN p_from AND p_to
    ORDER BY c.starts_at
  LOOP
    v_items := v_items || _planned_apply_class(v_c.id, p_client_id, p_action, p_hours, p_dry_run);
  END LOOP;

  -- Дати серії без заняття (лише ця серія — без перебору всіх шаблонів).
  FOR v_slot IN
    SELECT x.starts_at FROM (
      SELECT ((d::date::text || ' ' || cs.time_of_day::text)::timestamp AT TIME ZONE 'Europe/Kyiv') AS starts_at,
             d::date AS d
      FROM class_series cs
      CROSS JOIN generate_series(greatest(p_from, (now() AT TIME ZONE 'Europe/Kyiv')::date), p_to, interval '1 day') d
      WHERE cs.id = p_series_id
        AND EXTRACT(DOW FROM d)::int = cs.day_of_week
        AND (cs.valid_from IS NULL OR cs.valid_from <= d::date)
        AND (cs.valid_to   IS NULL OR cs.valid_to   >= d::date)
    ) x
    WHERE x.starts_at > now()
      AND NOT EXISTS (SELECT 1 FROM classes c
                      WHERE c.series_id = p_series_id
                        AND date(c.starts_at AT TIME ZONE 'Europe/Kyiv') = x.d)
    ORDER BY x.starts_at
  LOOP
    v_items := v_items || jsonb_build_object('class_id', NULL, 'starts_at', v_slot.starts_at, 'result', 'pending');
  END LOOP;

  RETURN v_items;
END;
$$;
REVOKE ALL ON FUNCTION public._planned_apply_range(uuid, uuid, text, date, date, integer[], boolean) FROM PUBLIC, anon, authenticated;

-- ── 8. Публічні RPC ────────────────────────────────────────────────────────
-- Спільна валідація для create/preview → текст помилки або NULL.
CREATE OR REPLACE FUNCTION public._planned_validate(
  p_series_id uuid, p_client_id uuid, p_action text, p_date_from date, p_date_to date)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_series class_series%ROWTYPE;
  v_today  date := (now() AT TIME ZONE 'Europe/Kyiv')::date;
BEGIN
  IF NOT can_manage_series(p_series_id) THEN RETURN 'Недостатньо прав для цієї групи'; END IF;
  IF p_action NOT IN ('skip', 'enroll') THEN RETURN 'Невідома дія'; END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL THEN RETURN 'Вкажіть період'; END IF;
  IF p_date_to < p_date_from THEN RETURN 'Кінець періоду раніше за початок'; END IF;
  IF p_date_from < v_today THEN RETURN 'Період не може починатися в минулому'; END IF;
  IF p_date_to > p_date_from + 366 THEN RETURN 'Період довший за рік'; END IF;

  SELECT * INTO v_series FROM class_series WHERE id = p_series_id;
  IF NOT FOUND OR v_series.type <> 'template' THEN RETURN 'Шаблон не знайдено'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN RETURN 'Клієнта не знайдено'; END IF;

  IF p_action = 'skip' AND NOT EXISTS (
    SELECT 1 FROM series_clients sc WHERE sc.series_id = p_series_id AND sc.client_id = p_client_id
  ) THEN
    RETURN 'Клієнт не є постійником цієї групи';
  END IF;

  IF p_action = 'enroll' AND EXISTS (
    SELECT 1 FROM series_clients sc
    WHERE sc.series_id = p_series_id AND sc.client_id = p_client_id
      AND sc.valid_from IS NULL AND sc.valid_to IS NULL
  ) THEN
    RETURN 'Клієнт уже постійник цієї групи';
  END IF;

  IF EXISTS (
    SELECT 1 FROM planned_enrollment_changes pc
    WHERE pc.series_id = p_series_id AND pc.client_id = p_client_id AND pc.is_active
      AND pc.date_from <= p_date_to AND pc.date_to >= p_date_from
  ) THEN
    RETURN 'На ці дати вже є запланована зміна';
  END IF;

  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._planned_validate(uuid, uuid, text, date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.preview_planned_change(
  p_series_id uuid, p_client_id uuid, p_action text, p_date_from date, p_date_to date)
RETURNS TABLE(success boolean, items jsonb, error_message text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_err   text;
  v_hours integer[];
BEGIN
  v_err := _planned_validate(p_series_id, p_client_id, p_action, p_date_from, p_date_to);
  IF v_err IS NOT NULL THEN
    RETURN QUERY SELECT false, '[]'::jsonb, v_err; RETURN;
  END IF;
  SELECT CASE WHEN cs.duration_min >= 120 THEN ARRAY[1, 2] END INTO v_hours
  FROM class_series cs WHERE cs.id = p_series_id;
  RETURN QUERY SELECT true,
    _planned_apply_range(p_series_id, p_client_id, p_action, p_date_from, p_date_to, v_hours, true),
    NULL::text;
END;
$$;
REVOKE ALL ON FUNCTION public.preview_planned_change(uuid, uuid, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_planned_change(uuid, uuid, text, date, date) TO authenticated;

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
  -- Серіалізуємо пару (серія, клієнт): перевірка перетину + INSERT без гонки.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_series_id::text || p_client_id::text, 0));

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

-- Скасування наміру. Уже застосоване до відкритих занять НЕ відкочується.
CREATE OR REPLACE FUNCTION public.cancel_planned_change(p_id uuid)
RETURNS TABLE(success boolean, error_message text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_series uuid;
BEGIN
  SELECT series_id INTO v_series FROM planned_enrollment_changes WHERE id = p_id AND is_active;
  IF v_series IS NULL THEN
    RETURN QUERY SELECT false, 'Зміну не знайдено'::text; RETURN;
  END IF;
  IF NOT can_manage_series(v_series) THEN
    RETURN QUERY SELECT false, 'Недостатньо прав для цієї групи'::text; RETURN;
  END IF;
  UPDATE planned_enrollment_changes SET is_active = false WHERE id = p_id;
  RETURN QUERY SELECT true, NULL::text;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_planned_change(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_planned_change(uuid) TO authenticated;

-- Тимчасовий постійник: додати / змінити період (NULL/NULL = безстроково).
-- Відкриті майбутні заняття вирівнюються: у періоді → записати, поза ним → відмінити (до дедлайну).
CREATE OR REPLACE FUNCTION public.upsert_series_client_period(
  p_series_id uuid, p_client_id uuid, p_valid_from date, p_valid_to date)
RETURNS TABLE(success boolean, applied jsonb, error_message text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_series  class_series%ROWTYPE;
  v_hours   integer[];
  v_items   jsonb := '[]'::jsonb;
  v_c       record;
  v_in      boolean;
  v_paused  boolean;
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
    v_paused := EXISTS (SELECT 1 FROM planned_enrollment_changes pc
                        WHERE pc.series_id = p_series_id AND pc.client_id = p_client_id
                          AND pc.action = 'skip' AND pc.is_active
                          AND v_c.d BETWEEN pc.date_from AND pc.date_to);
    IF v_in AND NOT v_paused THEN
      v_items := v_items || _planned_apply_class(v_c.id, p_client_id, 'enroll', v_hours, false);
    ELSIF NOT v_in THEN
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

-- ── 9. Реєстр «Заплановане» ────────────────────────────────────────────────
-- Об'єднує 4 види намірів. Статус рахується наживо:
--   done (період минув) · attention (у відкритому занятті намір не виконаний) ·
--   active (частина дат уже відкрита) · pending (ще жодна дата не відкрита).
CREATE OR REPLACE FUNCTION public.planned_register(
  p_trainer_id uuid DEFAULT NULL, p_client_id uuid DEFAULT NULL, p_include_done boolean DEFAULT false)
RETURNS TABLE(kind text, id uuid, series_id uuid, series_title text, ticket_type text,
              trainer_id uuid, trainer_name text, client_id uuid, client_name text,
              date_from date, date_to date, note text, created_by_role text, created_at timestamptz,
              status text, issues_count integer, opened_count integer)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_role    text := auth_role();
  v_trainer uuid := p_trainer_id;
  v_today   date := (now() AT TIME ZONE 'Europe/Kyiv')::date;
BEGIN
  IF v_role = 'trainer' THEN
    v_trainer := current_trainer_id();
    IF v_trainer IS NULL THEN RAISE EXCEPTION 'trainer profile not found' USING ERRCODE = '42501'; END IF;
  ELSIF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH items AS (
    SELECT pc.action AS kind, pc.id, pc.series_id, pc.client_id,
           pc.date_from, pc.date_to, pc.note, pc.created_by_role, pc.created_at
    FROM planned_enrollment_changes pc
    WHERE pc.is_active
    UNION ALL
    SELECT 'temp_regular', sc.id, sc.series_id, sc.client_id,
           coalesce(sc.valid_from, (sc.created_at AT TIME ZONE 'Europe/Kyiv')::date), sc.valid_to,
           NULL, NULL, sc.created_at
    FROM series_clients sc
    WHERE sc.valid_to IS NOT NULL OR sc.valid_from IS NOT NULL
    UNION ALL
    SELECT 'temp_template', cs.id, cs.id, NULL,
           coalesce(cs.valid_from, (cs.created_at AT TIME ZONE 'Europe/Kyiv')::date), cs.valid_to,
           NULL, NULL, cs.created_at
    FROM class_series cs
    WHERE cs.type = 'template' AND (cs.valid_to IS NOT NULL OR cs.valid_from IS NOT NULL)
  ),
  scoped AS (
    SELECT i.*, cs.title, cs.day_of_week, cs.time_of_day, cs.ticket_type, cs.trainer_id
    FROM items i
    JOIN class_series cs ON cs.id = i.series_id
    WHERE (v_trainer IS NULL OR cs.trainer_id = v_trainer)
      AND (p_client_id IS NULL OR i.client_id = p_client_id)
      AND (p_include_done OR i.date_to IS NULL OR i.date_to >= v_today)
  ),
  stats AS (
    SELECT s.id, s.kind,
      count(c.id)::int AS opened,
      count(c.id) FILTER (
        WHERE c.starts_at > now() AND NOT c.is_cancelled AND (
          (s.kind = 'skip' AND e.status IN ('enrolled', 'waitlist'))
          OR (s.kind IN ('enroll', 'temp_regular') AND (e.id IS NULL OR e.status = 'waitlist')
              AND NOT EXISTS (SELECT 1 FROM planned_enrollment_changes px
                              WHERE px.series_id = s.series_id AND px.client_id = s.client_id
                                AND px.action = 'skip' AND px.is_active
                                AND (c.starts_at AT TIME ZONE 'Europe/Kyiv')::date BETWEEN px.date_from AND px.date_to))
        ))::int AS issues
    FROM scoped s
    LEFT JOIN classes c
      ON c.series_id = s.series_id
     AND (c.starts_at AT TIME ZONE 'Europe/Kyiv')::date BETWEEN s.date_from AND coalesce(s.date_to, 'infinity'::date)
    LEFT JOIN enrollments e ON e.class_id = c.id AND e.client_id = s.client_id
    GROUP BY s.id, s.kind
  )
  SELECT s.kind, s.id, s.series_id,
         concat_ws(' ', nullif(s.title, ''),
           (ARRAY['Нд','Пн','Вт','Ср','Чт','Пт','Сб'])[s.day_of_week + 1],
           to_char(s.time_of_day, 'HH24:MI')),
         s.ticket_type, s.trainer_id, t.name,
         s.client_id, nullif(concat_ws(' ', cl.first_name, cl.last_name), ''),
         s.date_from, s.date_to, s.note, s.created_by_role, s.created_at,
         CASE
           WHEN s.date_to IS NOT NULL AND s.date_to < v_today THEN 'done'
           WHEN st.issues > 0 THEN 'attention'
           WHEN st.opened > 0 THEN 'active'
           ELSE 'pending'
         END,
         st.issues, st.opened
  FROM scoped s
  JOIN stats st ON st.id = s.id AND st.kind = s.kind
  LEFT JOIN trainers t ON t.id = s.trainer_id
  LEFT JOIN clients cl ON cl.id = s.client_id
  ORDER BY s.date_from, s.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.planned_register(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planned_register(uuid, uuid, boolean) TO authenticated;

-- ── 10. generate_week v4: склад із series_roster + періоди шаблонів + warnings ──
DROP FUNCTION public.generate_week(date, integer);
CREATE FUNCTION public.generate_week(p_start_date date, p_weeks integer DEFAULT 1)
RETURNS TABLE(classes_created integer, enrollments_created integer, conflicts jsonb, warnings jsonb)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_series record;
  v_week_offset int;
  v_week_start date;
  v_class_date date;
  v_starts_at timestamptz;
  v_class_id uuid;
  v_target_id uuid;
  v_existing_id uuid;
  v_existing_cancelled boolean;
  v_conflict record;
  v_classes_created int := 0;
  v_enrollments_created int := 0;
  v_conflicts jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_w jsonb;
  v_count int;
BEGIN
  -- Масова генерація: тригер enrollment_events логує події, але НЕ шле Telegram.
  perform set_config('app.suppress_enroll_notify', 'on', true);

  FOR v_week_offset IN 0..(p_weeks - 1) LOOP
    v_week_start := p_start_date + (v_week_offset * 7);

    FOR v_series IN SELECT * FROM class_series WHERE type = 'template' LOOP
      v_class_date := v_week_start + ((v_series.day_of_week - EXTRACT(DOW FROM v_week_start)::int + 7) % 7);

      -- Тимчасовий шаблон поза своїм періодом — пропуск.
      CONTINUE WHEN (v_series.valid_from IS NOT NULL AND v_class_date < v_series.valid_from)
                 OR (v_series.valid_to   IS NOT NULL AND v_class_date > v_series.valid_to);

      v_starts_at := (v_class_date::text || ' ' || v_series.time_of_day::text)::timestamp AT TIME ZONE 'Europe/Kyiv';
      v_target_id := NULL;

      -- Заняття цієї серії на цю дату вже існує (повторний запуск)?
      SELECT c.id, c.is_cancelled INTO v_existing_id, v_existing_cancelled
      FROM classes c
      WHERE c.series_id = v_series.id
        AND date(c.starts_at AT TIME ZONE 'Europe/Kyiv') = v_class_date
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        IF NOT v_existing_cancelled THEN
          v_target_id := v_existing_id;  -- досозапис нового складу в живе заняття
        ELSE
          -- Скасоване заняття: разові записи наперед не виконаються.
          SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'client_name', concat_ws(' ', r.first_name, r.last_name),
                   'series_title', v_series.title, 'ticket_type', v_series.ticket_type, 'class_date', v_class_date,
                   'time_of_day', left(v_series.time_of_day::text, 5), 'reason', 'class_missing')), '[]'::jsonb)
            INTO v_w
          FROM series_roster(v_series.id, v_class_date) r
          WHERE r.source = 'planned';
          v_warnings := v_warnings || v_w;
        END IF;
      ELSE
        -- Перетин по залу/тренеру з існуючим заняттям → пропустити слот, у звіт.
        SELECT * INTO v_conflict
        FROM check_class_conflicts(v_starts_at, v_series.duration_min, v_series.hall_id, v_series.trainer_id, NULL)
        LIMIT 1;

        IF FOUND THEN
          v_conflicts := v_conflicts || jsonb_build_object(
            'series_title', v_series.title,
            'ticket_type', v_series.ticket_type,
            'class_date', v_class_date,
            'time_of_day', left(v_series.time_of_day::text, 5),
            'hall_name', (SELECT h.name FROM halls h WHERE h.id = v_series.hall_id),
            'conflict_type', v_conflict.conflict_type,
            'conflict_with_title', coalesce(v_conflict.title, v_conflict.ticket_type),
            'conflict_with_starts_at', v_conflict.starts_at
          );
          SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'client_name', concat_ws(' ', r.first_name, r.last_name),
                   'series_title', v_series.title, 'ticket_type', v_series.ticket_type, 'class_date', v_class_date,
                   'time_of_day', left(v_series.time_of_day::text, 5), 'reason', 'class_missing')), '[]'::jsonb)
            INTO v_w
          FROM series_roster(v_series.id, v_class_date) r
          WHERE r.source = 'planned';
          v_warnings := v_warnings || v_w;
          CONTINUE;
        END IF;

        v_class_id := NULL;
        INSERT INTO classes (series_id, trainer_id, hall_id, ticket_type, title, starts_at, duration_min, capacity, notes)
        VALUES (
          v_series.id, v_series.trainer_id, v_series.hall_id, v_series.ticket_type, v_series.title,
          v_starts_at, v_series.duration_min, v_series.capacity, v_series.notes
        )
        ON CONFLICT (series_id, (date(starts_at AT TIME ZONE 'Europe/Kyiv'::text))) WHERE series_id IS NOT NULL DO NOTHING
        RETURNING id INTO v_class_id;

        IF v_class_id IS NOT NULL THEN
          v_classes_created := v_classes_created + 1;
          v_target_id := v_class_id;
        END IF;
      END IF;

      IF v_target_id IS NOT NULL THEN
        -- Склад: постійники в межах періоду − паузи + записи наперед.
        -- DO NOTHING: вручну скасовані записи не реанімуємо.
        WITH roster AS (
          SELECT * FROM series_roster(v_series.id, v_class_date) WHERE NOT paused
        ),
        ins AS (
          INSERT INTO enrollments (class_id, client_id, status, sessions_used, hours_attended)
          SELECT v_target_id, r.client_id, 'enrolled', 0, r.hours_attended
          FROM roster r
          ON CONFLICT (class_id, client_id) DO NOTHING
          RETURNING client_id, status, hours_attended
        )
        SELECT count(*)::int,
               coalesce(jsonb_agg(jsonb_build_object(
                 'client_name', concat_ws(' ', r.first_name, r.last_name),
                 'series_title', v_series.title, 'ticket_type', v_series.ticket_type, 'class_date', v_class_date,
                 'time_of_day', left(v_series.time_of_day::text, 5),
                 'reason', CASE WHEN i.status = 'waitlist' THEN 'waitlist' ELSE 'no_sessions' END))
                 FILTER (WHERE i.status = 'waitlist'
                            OR (r.source IN ('planned', 'temp_regular')
                                AND coalesce(b.sessions_balance, 0) < coalesce(array_length(i.hours_attended, 1), 1))),
                 '[]'::jsonb)
          INTO v_count, v_w
        FROM ins i
        JOIN roster r ON r.client_id = i.client_id
        LEFT JOIN client_session_balances b
          ON b.client_id = i.client_id AND b.ticket_type = v_series.ticket_type;

        v_enrollments_created := v_enrollments_created + v_count;
        v_warnings := v_warnings || v_w;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_classes_created, v_enrollments_created, v_conflicts, v_warnings;
END;
$function$;
REVOKE ALL ON FUNCTION public.generate_week(date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_week(date, integer) TO authenticated;

-- ── 11. attendance_overview: планова пауза ≠ пропуск; минулі тимчасові постійники ≠ постійники ──
CREATE OR REPLACE FUNCTION public.attendance_overview(p_trainer_id uuid DEFAULT NULL::uuid, p_period_days integer DEFAULT 60)
 RETURNS TABLE(client_id uuid, first_name text, last_name text, balance integer, last_visit_at timestamp with time zone, days_since integer, visits_period integer, visits_prev_period integer, next_enrollment_at timestamp with time zone, is_regular boolean, regular_series text[], planned_regular integer, missed_regular integer, sessions_left integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_role text := auth_role();
  v_trainer uuid := p_trainer_id;
  v_days integer := greatest(coalesce(p_period_days, 60), 1);
BEGIN
  IF v_role = 'trainer' THEN
    v_trainer := current_trainer_id();
    IF v_trainer IS NULL THEN
      RAISE EXCEPTION 'trainer profile not found' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scope_series AS (
    SELECT cs.id,
           concat_ws(' ', nullif(cs.title, ''),
             (ARRAY['Нд','Пн','Вт','Ср','Чт','Пт','Сб'])[cs.day_of_week + 1],
             to_char(cs.time_of_day, 'HH24:MI')) AS title
    FROM class_series cs
    WHERE v_trainer IS NULL OR cs.trainer_id = v_trainer
  ),
  -- Заняття тренера + заняття його серій (якщо підміняв колега — постійники серії
  -- лишаються «його»). Оренди залів — не тренування, не рахуємо.
  scope_classes AS (
    SELECT c.id, c.starts_at, c.series_id
    FROM classes c
    WHERE NOT c.is_cancelled
      AND c.ticket_type NOT LIKE '%rental'
      AND (v_trainer IS NULL OR c.trainer_id = v_trainer
           OR c.series_id IN (SELECT ss.id FROM scope_series ss))
  ),
  regulars AS (
    SELECT sc.client_id,
           array_agg(DISTINCT ss.title) FILTER (WHERE ss.title <> '') AS series_titles
    FROM series_clients sc
    JOIN scope_series ss ON ss.id = sc.series_id
    WHERE sc.valid_to IS NULL OR sc.valid_to >= (now() AT TIME ZONE 'Europe/Kyiv')::date
    GROUP BY sc.client_id
  ),
  past AS (
    SELECT e.client_id, e.status, e.cancellation_source, k.starts_at, k.series_id
    FROM enrollments e
    JOIN scope_classes k ON k.id = e.class_id
    WHERE k.starts_at < now()
  ),
  candidates AS (
    SELECT r.client_id FROM regulars r
    UNION
    SELECT p.client_id FROM past p
    WHERE p.status = 'attended' AND p.starts_at >= now() - interval '180 days'
  ),
  visits AS (
    SELECT p.client_id,
           max(p.starts_at) AS last_visit_at,
           count(*) FILTER (WHERE p.starts_at >= now() - make_interval(days => v_days))::int AS v_period,
           count(*) FILTER (WHERE p.starts_at <  now() - make_interval(days => v_days)
                              AND p.starts_at >= now() - make_interval(days => v_days * 2))::int AS v_prev
    FROM past p
    WHERE p.status = 'attended'
    GROUP BY p.client_id
  ),
  regular_marks AS (
    SELECT p.client_id,
           count(*) FILTER (WHERE coalesce(p.cancellation_source, '') <> 'planned')::int AS planned,
           count(*) FILTER (
             WHERE p.status = 'noshow'
                OR (p.status = 'cancelled' AND coalesce(p.cancellation_source, '') NOT IN ('class_cancelled', 'planned'))
           )::int AS missed
    FROM past p
    JOIN series_clients sc ON sc.series_id = p.series_id AND sc.client_id = p.client_id
    WHERE p.starts_at >= now() - make_interval(days => v_days)
      AND p.starts_at >= sc.created_at  -- разові візити до того, як став постійником, не рахуємо
      AND p.status IN ('attended', 'noshow', 'cancelled')
    GROUP BY p.client_id
  ),
  upcoming AS (
    SELECT e.client_id, min(k.starts_at) AS next_at
    FROM enrollments e
    JOIN scope_classes k ON k.id = e.class_id
    WHERE k.starts_at >= now() AND e.status IN ('enrolled', 'waitlist')
    GROUP BY e.client_id
  ),
  sessions AS (
    SELECT b.client_id, sum(greatest(b.sessions_balance, 0))::int AS left_total
    FROM client_session_balances b
    GROUP BY b.client_id
  )
  SELECT
    cl.id,
    cl.first_name,
    cl.last_name,
    cl.balance,
    v.last_visit_at,
    CASE WHEN v.last_visit_at IS NULL THEN NULL
         ELSE ((now() AT TIME ZONE 'Europe/Kyiv')::date
               - (v.last_visit_at AT TIME ZONE 'Europe/Kyiv')::date)::int
    END,
    coalesce(v.v_period, 0),
    coalesce(v.v_prev, 0),
    u.next_at,
    (r.client_id IS NOT NULL),
    coalesce(r.series_titles, ARRAY[]::text[]),
    coalesce(m.planned, 0),
    coalesce(m.missed, 0),
    coalesce(s.left_total, 0)
  FROM candidates c
  JOIN clients cl ON cl.id = c.client_id
  LEFT JOIN visits v ON v.client_id = c.client_id
  LEFT JOIN regulars r ON r.client_id = c.client_id
  LEFT JOIN regular_marks m ON m.client_id = c.client_id
  LEFT JOIN upcoming u ON u.client_id = c.client_id
  LEFT JOIN sessions s ON s.client_id = c.client_id;
END;
$function$;
