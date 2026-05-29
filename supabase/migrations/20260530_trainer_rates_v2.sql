-- trainer_rates: додати hall_id, studio_rate, valid_from, valid_to
-- Перейменувати rate → trainer_rate
ALTER TABLE trainer_rates
  RENAME COLUMN rate TO trainer_rate;

ALTER TABLE trainer_rates
  ADD COLUMN hall_id     uuid REFERENCES halls(id) ON DELETE SET NULL,
  ADD COLUMN studio_rate numeric NOT NULL DEFAULT 0 CHECK (studio_rate >= 0),
  ADD COLUMN valid_from  date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN valid_to    date;

-- trainer_payments: додати payment_type
ALTER TABLE trainer_payments
  ADD COLUMN payment_type text NOT NULL DEFAULT 'final'
    CHECK (payment_type IN ('advance', 'final'));

-- Новий RPC: деталізований розрахунок зарплати тренера
-- Рахує enrollments (attended + noshow) для занять тренера за період
-- Для кожного enrollment бере ставку що діяла на дату заняття
-- Пріоритет ставки: індивідуальна+зал > індивідуальна > глобальна+зал > глобальна
CREATE OR REPLACE FUNCTION calc_trainer_salary_v2(
  p_trainer_id uuid,
  p_start      timestamptz,
  p_end        timestamptz
) RETURNS TABLE (
  class_id          uuid,
  starts_at         timestamptz,
  ticket_type       text,
  hall_name         text,
  duration_min      integer,
  client_id         uuid,
  client_name       text,
  enrollment_status text,
  trainer_amount    numeric,
  studio_amount     numeric
)
LANGUAGE sql STABLE AS $$
  SELECT
    c.id,
    c.starts_at,
    c.ticket_type,
    h.name,
    c.duration_min,
    cl.id,
    TRIM(COALESCE(cl.first_name || ' ' || cl.last_name, cl.first_name, cl.last_name, '—')),
    e.status,
    COALESCE((
      SELECT tr.trainer_rate * (c.duration_min::numeric / 60)
      FROM trainer_rates tr
      WHERE tr.ticket_type = c.ticket_type
        AND (tr.trainer_id = p_trainer_id OR tr.trainer_id IS NULL)
        AND (tr.hall_id = c.hall_id OR tr.hall_id IS NULL)
        AND tr.valid_from <= c.starts_at::date
        AND (tr.valid_to IS NULL OR tr.valid_to >= c.starts_at::date)
      ORDER BY
        (tr.trainer_id IS NOT NULL) DESC,
        (tr.hall_id IS NOT NULL) DESC
      LIMIT 1
    ), 0),
    COALESCE((
      SELECT tr.studio_rate * (c.duration_min::numeric / 60)
      FROM trainer_rates tr
      WHERE tr.ticket_type = c.ticket_type
        AND (tr.trainer_id = p_trainer_id OR tr.trainer_id IS NULL)
        AND (tr.hall_id = c.hall_id OR tr.hall_id IS NULL)
        AND tr.valid_from <= c.starts_at::date
        AND (tr.valid_to IS NULL OR tr.valid_to >= c.starts_at::date)
      ORDER BY
        (tr.trainer_id IS NOT NULL) DESC,
        (tr.hall_id IS NOT NULL) DESC
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

GRANT EXECUTE ON FUNCTION calc_trainer_salary_v2(uuid, timestamptz, timestamptz) TO anon, authenticated;
