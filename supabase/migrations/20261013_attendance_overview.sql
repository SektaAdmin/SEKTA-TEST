-- Екран «Відвідуваність» (/attendance для owner/admin, /trainer/attendance для тренера).
--
-- attendance_overview — read-only зріз по клієнтах: хто давно не ходить і хто з постійників
-- (series_clients) пропускає. Нічого не пише, баланси не чіпає.
--
-- Пропуск = лише ВІДМІЧЕНЕ: noshow (тренер/адмін) або cancelled (self/staff, у т.ч. пізня
-- зі списанням). auto_close ставить «attended» усім, кого не відмітили, — такі неявні
-- пропуски сюди не потрапляють by design.
--
-- Гейт: client → 42501; trainer — p_trainer_id примусово = current_trainer_id() (RLS
-- enrollments.trainer_select дає тренеру ВСІ записи, тож фільтр мусить бути тут);
-- owner/admin — NULL = вся студія або конкретний тренер.

CREATE OR REPLACE FUNCTION public.attendance_overview(
  p_trainer_id uuid DEFAULT NULL,
  p_period_days integer DEFAULT 60
)
RETURNS TABLE(
  client_id uuid,
  first_name text,
  last_name text,
  balance integer,
  last_visit_at timestamptz,
  days_since integer,
  visits_period integer,
  visits_prev_period integer,
  next_enrollment_at timestamptz,
  is_regular boolean,
  regular_series text[],
  planned_regular integer,
  missed_regular integer,
  sessions_left integer
)
LANGUAGE plpgsql
STABLE SECURITY INVOKER
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
           count(*)::int AS planned,
           count(*) FILTER (
             WHERE p.status = 'noshow'
                OR (p.status = 'cancelled' AND coalesce(p.cancellation_source, '') <> 'class_cancelled')
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

REVOKE EXECUTE ON FUNCTION public.attendance_overview(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attendance_overview(uuid, integer) TO authenticated;
