-- generate_week: пропуск конфліктних слотів + звіт + досозапис постійників.
--
-- Було: єдиний захист — унікальність «серія+дата». Заняття, що перетинаються
-- по часу з ручними/чужими заняттями (зал або тренер), створювались мовчки
-- поверх; при повторному запуску нові постійники шаблону не дозаписувались.
--
-- Стало:
--   1) слот, що перетинається по залу/тренеру (check_class_conflicts), НЕ
--      створюється — потрапляє у третю колонку результату `conflicts` (jsonb);
--   2) для вже існуючого заняття цієї ж серії на цю дату досоздаються
--      відсутні enrollments постійників (ON CONFLICT DO NOTHING — вручну
--      скасовані записи не реанімуються);
--   3) суттєве: тип повернення змінився → DROP + CREATE (не OR REPLACE),
--      гранти перевиставляються (EXECUTE лише authenticated).

DROP FUNCTION public.generate_week(date, integer);

CREATE FUNCTION public.generate_week(p_start_date date, p_weeks integer DEFAULT 1)
 RETURNS TABLE(classes_created integer, enrollments_created integer, conflicts jsonb)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_series record;
  v_week_offset int;
  v_week_start date;
  v_class_date date;
  v_starts_at timestamptz;
  v_class_id uuid;
  v_existing_id uuid;
  v_existing_cancelled boolean;
  v_conflict record;
  v_classes_created int := 0;
  v_enrollments_created int := 0;
  v_conflicts jsonb := '[]'::jsonb;
  v_count int;
BEGIN
  -- Масова генерація: тригер enrollment_events логує події, але НЕ шле Telegram.
  perform set_config('app.suppress_enroll_notify', 'on', true);

  FOR v_week_offset IN 0..(p_weeks - 1) LOOP
    v_week_start := p_start_date + (v_week_offset * 7);

    FOR v_series IN SELECT * FROM class_series WHERE type = 'template' LOOP
      v_class_date := v_week_start + ((v_series.day_of_week - EXTRACT(DOW FROM v_week_start)::int + 7) % 7);
      v_starts_at := (v_class_date::text || ' ' || v_series.time_of_day::text)::timestamp AT TIME ZONE 'Europe/Kyiv';

      -- Заняття цієї серії на цю дату вже існує (повторний запуск)?
      SELECT c.id, c.is_cancelled INTO v_existing_id, v_existing_cancelled
      FROM classes c
      WHERE c.series_id = v_series.id
        AND date(c.starts_at AT TIME ZONE 'Europe/Kyiv') = v_class_date
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        -- Досозапис нових постійників у живе заняття; скасоване не чіпаємо.
        IF NOT v_existing_cancelled THEN
          INSERT INTO enrollments (class_id, client_id, status, sessions_used, hours_attended)
          SELECT v_existing_id, sc.client_id, 'enrolled', 0, sc.hours_attended
          FROM series_clients sc
          WHERE sc.series_id = v_series.id
          ON CONFLICT (class_id, client_id) DO NOTHING;

          GET DIAGNOSTICS v_count = ROW_COUNT;
          v_enrollments_created := v_enrollments_created + v_count;
        END IF;
        CONTINUE;
      END IF;

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
        CONTINUE;
      END IF;

      v_class_id := NULL;

      INSERT INTO classes (series_id, trainer_id, hall_id, ticket_type, title, starts_at, duration_min, capacity, notes)
      VALUES (
        v_series.id,
        v_series.trainer_id,
        v_series.hall_id,
        v_series.ticket_type,
        v_series.title,
        v_starts_at,
        v_series.duration_min,
        v_series.capacity,
        v_series.notes
      )
      ON CONFLICT (series_id, (date(starts_at AT TIME ZONE 'Europe/Kyiv'::text))) WHERE series_id IS NOT NULL DO NOTHING
      RETURNING id INTO v_class_id;

      IF v_class_id IS NOT NULL THEN
        v_classes_created := v_classes_created + 1;

        INSERT INTO enrollments (class_id, client_id, status, sessions_used, hours_attended)
        SELECT v_class_id, sc.client_id, 'enrolled', 0, sc.hours_attended
        FROM series_clients sc
        WHERE sc.series_id = v_series.id
        ON CONFLICT (class_id, client_id) DO NOTHING;

        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_enrollments_created := v_enrollments_created + v_count;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_classes_created, v_enrollments_created, v_conflicts;
END;
$function$;

-- Гранти як до DROP: EXECUTE лише authenticated (адмін-дія за RLS викликача).
REVOKE ALL ON FUNCTION public.generate_week(date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_week(date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_week(date, integer) TO authenticated;
