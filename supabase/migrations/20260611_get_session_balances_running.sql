-- Наростаючий (кумулятивний) залишок сесій ПІСЛЯ кожного майбутнього запису клієнта.
-- Замінює клієнтський цикл у ClientVisits: рахує по ВСІХ майбутніх записах (не по
-- видимому slice), повертає на кожен enrollment.id — щоб пагінація на клієнті не
-- ламала кумулятив (запис N залежить від усіх ранніх того ж типу).
--
-- Семантика (дзеркало старого клієнтського циклу + get_session_balance_after):
--   * стартовий баланс типу = client_session_balances.sessions_balance (записи ще
--     не списані — enrolled/waitlist; списання в auto_close);
--   * у хронології (starts_at) по кожному типу кумулятивно віднімаємо вартість;
--   * is_cancelled-заняття НЕ списують (balance_after = поточний залишок типу);
--   * cost = COALESCE(array_length(hours_attended,1), 1) (годинний чекбокс адміна);
--   * включаємо status IN ('enrolled','waitlist') (як listMyUpcomingEnrollments).
-- Інв.#2: лише ЧИТАННЯ (баланси не чіпаємо).
CREATE OR REPLACE FUNCTION public.get_session_balances_running(
  p_client_id uuid,
  p_from timestamptz
)
RETURNS TABLE(enrollment_id uuid, balance_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Доступ: owner/admin/trainer бачать будь-кого; client — лише себе.
  IF auth_role() = 'client' AND p_client_id != current_client_id() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  WITH upcoming AS (
    SELECT
      e.id            AS enrollment_id,
      c.ticket_type,
      c.starts_at,
      c.is_cancelled,
      CASE
        WHEN c.is_cancelled THEN 0
        ELSE COALESCE(array_length(e.hours_attended, 1), 1)
      END AS cost
    FROM enrollments e
    JOIN classes c ON c.id = e.class_id
    WHERE e.client_id = p_client_id
      AND e.status IN ('enrolled', 'waitlist')
      AND c.starts_at >= p_from
  ),
  start_balance AS (
    SELECT ticket_type, COALESCE(sessions_balance, 0) AS raw
    FROM client_session_balances
    WHERE client_id = p_client_id
  ),
  running AS (
    SELECT
      u.enrollment_id,
      u.ticket_type,
      u.is_cancelled,
      -- кумулятивна сума вартостей у хронології в межах типу (включно з поточним)
      SUM(u.cost) OVER (
        PARTITION BY u.ticket_type
        ORDER BY u.starts_at, u.enrollment_id
        ROWS UNBOUNDED PRECEDING
      ) AS used_cumulative
    FROM upcoming u
  )
  SELECT
    r.enrollment_id,
    (COALESCE(sb.raw, 0) - r.used_cumulative)::int AS balance_after
  FROM running r
  LEFT JOIN start_balance sb ON sb.ticket_type = r.ticket_type;
END;
$$;

-- DEFINER оминає RLS → доступ лише залогіненим (owner/admin/trainer/client),
-- не anon. Гейт усередині звужує client до себе.
REVOKE ALL ON FUNCTION public.get_session_balances_running(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_balances_running(uuid, timestamptz) TO authenticated;
