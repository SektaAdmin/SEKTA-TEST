-- fix: calc_trainer_salary_v2 — платимо тренеру за фактично списані сесії (sessions_used),
-- а не за тривалість заняття (duration_min/60).
--
-- Бізнес-інваріант (узгоджено 2026-06-13):
--   attended: тренер отримує rate × sessions_used (фактичні сесії клієнта).
--             2-год заняття: якщо клієнт прийшов на обидві години → sessions_used=2 → 2 × rate.
--             Якщо лише на першу → sessions_used=1 → 1 × rate.
--   noshow:   sessions_used=1 (або 2 для 2-год з hours=[1,2]) — клієнту списали сесію
--             за правилом скасування, тренер отримує ту ж оплату.
--
-- Старий баг: rate × (duration_min/60) рахував тренеру 2 год на будь-якому 2-год занятті,
-- навіть якщо адмін записав клієнта без hours_attended → auto_close списував 1 сесію,
-- а тренеру нараховувалось 2 год. Розрив 7 год вже є на проді (2026-06-13).

CREATE OR REPLACE FUNCTION public.calc_trainer_salary_v2(
  p_trainer_id uuid,
  p_start      timestamp with time zone,
  p_end        timestamp with time zone
)
RETURNS TABLE(
  class_id         uuid,
  starts_at        timestamp with time zone,
  ticket_type      text,
  hall_name        text,
  duration_min     integer,
  client_id        uuid,
  client_name      text,
  enrollment_status text,
  trainer_amount   numeric,
  studio_amount    numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    c.id,
    c.starts_at,
    c.ticket_type,
    h.name,
    c.duration_min,
    cl.id,
    TRIM(COALESCE(cl.first_name || ' ' || cl.last_name, cl.first_name, cl.last_name, '—')),
    e.status,
    -- trainer_amount: ставка × фактично списані сесії (=години для цього клієнта)
    COALESCE((
      SELECT tr.trainer_rate * e.sessions_used
      FROM trainer_rates tr
      WHERE tr.ticket_type = c.ticket_type
        AND (tr.trainer_id = p_trainer_id OR tr.trainer_id IS NULL)
        AND (tr.hall_id = c.hall_id OR tr.hall_id IS NULL)
        AND tr.valid_from <= c.starts_at::date
        AND (tr.valid_to IS NULL OR tr.valid_to >= c.starts_at::date)
      ORDER BY (tr.trainer_id IS NOT NULL) DESC, (tr.hall_id IS NOT NULL) DESC
      LIMIT 1
    ), 0),
    -- studio_amount: те саме (студія отримала revenue рівно за sessions_used)
    COALESCE((
      SELECT tr.studio_rate * e.sessions_used
      FROM trainer_rates tr
      WHERE tr.ticket_type = c.ticket_type
        AND (tr.trainer_id = p_trainer_id OR tr.trainer_id IS NULL)
        AND (tr.hall_id = c.hall_id OR tr.hall_id IS NULL)
        AND tr.valid_from <= c.starts_at::date
        AND (tr.valid_to IS NULL OR tr.valid_to >= c.starts_at::date)
      ORDER BY (tr.trainer_id IS NOT NULL) DESC, (tr.hall_id IS NOT NULL) DESC
      LIMIT 1
    ), 0)
  FROM enrollments e
  JOIN classes c ON c.id = e.class_id
  LEFT JOIN halls h ON h.id = c.hall_id
  JOIN clients cl ON cl.id = e.client_id
  WHERE c.trainer_id = p_trainer_id
    AND c.starts_at BETWEEN p_start AND p_end
    AND e.status IN ('attended', 'noshow')
  ORDER BY c.starts_at, c.id, cl.last_name, cl.first_name;
$$;
