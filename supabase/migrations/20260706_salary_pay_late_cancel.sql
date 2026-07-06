-- fix: calc_trainer_salary_v2 — пізня відміна оплачується тренеру.
--
-- Бізнес-інваріант (підтверджено власником 2026-07-06):
--   клієнту списали сесію → тренер отримує оплату. Це вже діяло для attended/noshow,
--   але cancelled із sessions_used > 0 («скасовано пізно, штраф») у розрахунок не
--   потрапляв узагалі — клієнту сесію списали, студія її взяла, тренеру не нараховано.
--   Рання відміна (sessions_used = 0) і скасування всього заняття
--   (cancel_class_and_restore_sessions обнуляє sessions_used) — не оплачуються, як і раніше.
--
-- Заодно: два ідентичні підзапити підбору ставки замінено одним LEFT JOIN LATERAL
-- (та сама пріоритетність: індивідуальна+зал > індивідуальна > глобальна+зал > глобальна;
-- ставка на дату заняття з архіву valid_from/valid_to). Поведінка ідентична.
--
-- Станом на 2026-07-06 на проді 0 рядків cancelled із sessions_used > 0 —
-- фікс превентивний, історичні нарахування не змінюються.

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
    -- ставка × фактично списані сесії; ставки нема на дату → 0 (див. COALESCE)
    COALESCE(tr.trainer_rate, 0) * e.sessions_used,
    COALESCE(tr.studio_rate, 0) * e.sessions_used
  FROM enrollments e
  JOIN classes c ON c.id = e.class_id
  LEFT JOIN halls h ON h.id = c.hall_id
  JOIN clients cl ON cl.id = e.client_id
  LEFT JOIN LATERAL (
    SELECT r.trainer_rate, r.studio_rate
    FROM trainer_rates r
    WHERE r.ticket_type = c.ticket_type
      AND (r.trainer_id = p_trainer_id OR r.trainer_id IS NULL)
      AND (r.hall_id = c.hall_id OR r.hall_id IS NULL)
      AND r.valid_from <= c.starts_at::date
      AND (r.valid_to IS NULL OR r.valid_to >= c.starts_at::date)
    ORDER BY (r.trainer_id IS NOT NULL) DESC, (r.hall_id IS NOT NULL) DESC
    LIMIT 1
  ) tr ON true
  WHERE c.trainer_id = p_trainer_id
    AND c.starts_at BETWEEN p_start AND p_end
    AND (
      e.status IN ('attended', 'noshow')
      OR (e.status = 'cancelled' AND e.sessions_used > 0)
    )
  ORDER BY c.starts_at, c.id, cl.last_name, cl.first_name;
$$;
