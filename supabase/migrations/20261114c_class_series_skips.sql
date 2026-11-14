-- Разове видалення слоту шаблону на конкретну дату (виняток шаблону).
-- Примарний слот зникає з розкладу, місце вільне під власне заняття, і ні generate_week,
-- ні «Заплановане» не вставляють на цю дату заняття з шаблону.

-- ── 1. Таблиця винятків ─────────────────────────────────────────
CREATE TABLE public.class_series_skips (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id       uuid NOT NULL REFERENCES public.class_series(id) ON DELETE CASCADE,
  class_date      date NOT NULL,
  created_by      uuid DEFAULT auth.uid(),
  created_by_role text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  is_active       boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX class_series_skips_active_uq
  ON public.class_series_skips (series_id, class_date) WHERE is_active;

ALTER TABLE public.class_series_skips ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_admin_select ON public.class_series_skips
  FOR SELECT TO authenticated
  USING (auth_role() IN ('owner', 'admin'));
CREATE POLICY trainer_select_own ON public.class_series_skips
  FOR SELECT TO authenticated
  USING (auth_role() = 'trainer'
         AND series_id IN (SELECT cs.id FROM public.class_series cs WHERE cs.trainer_id = current_trainer_id()));
-- Запис — лише через RPC (SECURITY DEFINER).
REVOKE ALL ON public.class_series_skips FROM anon, authenticated;
GRANT SELECT ON public.class_series_skips TO authenticated;

-- Внутрішній предикат: чи прибрано слот серії на дату. DEFINER — щоб INVOKER-функції
-- (generate_week, projected_template_slots) бачили винятки незалежно від RLS.
CREATE OR REPLACE FUNCTION public._series_slot_skipped(p_series_id uuid, p_date date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM class_series_skips k
                 WHERE k.series_id = p_series_id AND k.class_date = p_date AND k.is_active);
$$;
REVOKE ALL ON FUNCTION public._series_slot_skipped(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._series_slot_skipped(uuid, date) TO authenticated;

-- ── 2. RPC: прибрати слот на дату ───────────────────────────────
CREATE OR REPLACE FUNCTION public.skip_template_slot(p_series_id uuid, p_date date)
RETURNS TABLE(success boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_series class_series%ROWTYPE;
BEGIN
  IF NOT can_manage_series(p_series_id) THEN
    RETURN QUERY SELECT false, 'Недостатньо прав для цієї групи'::text; RETURN;
  END IF;
  IF p_date IS NULL OR p_date < (now() AT TIME ZONE 'Europe/Kyiv')::date THEN
    RETURN QUERY SELECT false, 'Не можна прибрати слот у минулому'::text; RETURN;
  END IF;

  SELECT * INTO v_series FROM class_series WHERE id = p_series_id;
  IF NOT FOUND OR v_series.type <> 'template' THEN
    RETURN QUERY SELECT false, 'Шаблон не знайдено'::text; RETURN;
  END IF;
  IF EXTRACT(DOW FROM p_date)::int <> v_series.day_of_week THEN
    RETURN QUERY SELECT false, 'Цього дня слоту за шаблоном немає'::text; RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM classes c
             WHERE c.series_id = p_series_id
               AND date(c.starts_at AT TIME ZONE 'Europe/Kyiv') = p_date) THEN
    RETURN QUERY SELECT false, 'Заняття вже створено — скасуйте його в картці заняття'::text; RETURN;
  END IF;

  INSERT INTO class_series_skips (series_id, class_date, created_by_role)
  VALUES (p_series_id, p_date, auth_role())
  ON CONFLICT (series_id, class_date) WHERE is_active DO NOTHING;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;
REVOKE ALL ON FUNCTION public.skip_template_slot(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.skip_template_slot(uuid, date) TO authenticated;

-- ── 3. Примарні слоти: без прибраних ────────────────────────────
-- (check_template_slot_conflicts кличе цю функцію — прибраний слот більше не конфліктує)
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
    )
    AND NOT _series_slot_skipped(s.id, s.d);
$$;

-- ── 4. Застосування «Запланованого»: прибраний слот не є pending ─
CREATE OR REPLACE FUNCTION public._planned_apply_range(
  p_series_id uuid, p_client_id uuid, p_action text, p_from date, p_to date,
  p_hours integer[], p_dry_run boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
      AND NOT _series_slot_skipped(p_series_id, x.d)
    ORDER BY x.starts_at
  LOOP
    v_items := v_items || jsonb_build_object('class_id', NULL, 'starts_at', v_slot.starts_at, 'result', 'pending');
  END LOOP;

  RETURN v_items;
END;
$$;
REVOKE ALL ON FUNCTION public._planned_apply_range(uuid, uuid, text, date, date, integer[], boolean) FROM PUBLIC, anon, authenticated;

-- ── 5. generate_week: прибраний слот не створюється ─────────────
-- Записи наперед на прибраний слот → warning reason='slot_skipped'.
CREATE OR REPLACE FUNCTION public.generate_week(p_start_date date, p_weeks integer DEFAULT 1)
RETURNS TABLE(classes_created integer, enrollments_created integer, conflicts jsonb, warnings jsonb)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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
  perform set_config('app.suppress_enroll_notify', 'on', true);

  FOR v_week_offset IN 0..(p_weeks - 1) LOOP
    v_week_start := p_start_date + (v_week_offset * 7);

    FOR v_series IN SELECT * FROM class_series WHERE type = 'template' LOOP
      v_class_date := v_week_start + ((v_series.day_of_week - EXTRACT(DOW FROM v_week_start)::int + 7) % 7);

      CONTINUE WHEN (v_series.valid_from IS NOT NULL AND v_class_date < v_series.valid_from)
                 OR (v_series.valid_to   IS NOT NULL AND v_class_date > v_series.valid_to);

      IF _series_slot_skipped(v_series.id, v_class_date) THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'client_name', concat_ws(' ', r.first_name, r.last_name),
                 'series_title', v_series.title, 'ticket_type', v_series.ticket_type, 'class_date', v_class_date,
                 'time_of_day', left(v_series.time_of_day::text, 5), 'reason', 'slot_skipped')), '[]'::jsonb)
          INTO v_w
        FROM series_roster(v_series.id, v_class_date) r
        WHERE r.source = 'planned';
        v_warnings := v_warnings || v_w;
        CONTINUE;
      END IF;

      v_starts_at := (v_class_date::text || ' ' || v_series.time_of_day::text)::timestamp AT TIME ZONE 'Europe/Kyiv';
      v_target_id := NULL;

      SELECT c.id, c.is_cancelled INTO v_existing_id, v_existing_cancelled
      FROM classes c
      WHERE c.series_id = v_series.id
        AND date(c.starts_at AT TIME ZONE 'Europe/Kyiv') = v_class_date
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        IF NOT v_existing_cancelled THEN
          v_target_id := v_existing_id;
        ELSE
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
$$;
