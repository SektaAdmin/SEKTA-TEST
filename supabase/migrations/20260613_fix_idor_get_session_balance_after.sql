-- Fix #1 IDOR: NULL-bypass in get_session_balance_after
-- Вектор: array_length(NULL,1) = NULL → NULL != 1 = NULL (falsy) → гейт пропускається
-- Атакер-клієнт міг передати NULL/'{}'→ отримати баланси всіх клієнтів (SECURITY DEFINER обходить RLS)
-- Також: PUBLIC EXECUTE → доступно навіть через anon-ключ без JWT

-- 1. REVOKE від PUBLIC (залишаємо тільки authenticated + postgres)
REVOKE EXECUTE ON FUNCTION public.get_session_balance_after(uuid[], text, timestamptz) FROM PUBLIC;

-- 2. Перезаписуємо функцію з NULL-safe гейтом
CREATE OR REPLACE FUNCTION public.get_session_balance_after(
  p_client_ids uuid[],
  p_ticket_type text,
  p_at timestamptz
)
RETURNS TABLE(client_id uuid, balance_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- NULL-safe гейт: cardinality(NULL)=0, не NULL (на відміну від array_length)
  IF auth_role() = 'client' THEN
    IF cardinality(p_client_ids) != 1
       OR p_client_ids[1] != current_client_id() THEN
      RAISE EXCEPTION 'access denied';
    END IF;
  END IF;

  RETURN QUERY
  WITH all_enrollments AS (
    SELECT
      e.client_id,
      e.sessions_used,
      e.hours_attended,
      e.status,
      c.starts_at
    FROM enrollments e
    JOIN classes c ON c.id = e.class_id
    WHERE e.client_id = ANY(p_client_ids)
      AND c.ticket_type = p_ticket_type
      AND e.status IN ('enrolled', 'attended', 'noshow', 'waitlist')
  ),
  raw_balances AS (
    SELECT
      csb.client_id,
      COALESCE(csb.sessions_balance, 0) AS raw
    FROM client_session_balances csb
    WHERE csb.client_id = ANY(p_client_ids)
      AND csb.ticket_type = p_ticket_type
  ),
  costs AS (
    SELECT
      ae.client_id,
      ae.starts_at,
      CASE
        WHEN ae.sessions_used > 0 THEN ae.sessions_used
        WHEN ae.hours_attended IS NOT NULL AND array_length(ae.hours_attended, 1) > 0
          THEN array_length(ae.hours_attended, 1)
        ELSE 1
      END AS cost,
      ae.sessions_used
    FROM all_enrollments ae
  ),
  per_client AS (
    SELECT
      c2.client_id,
      COALESCE(rb.raw, 0) + COALESCE(SUM(c2.sessions_used), 0) AS initial_balance,
      COALESCE(SUM(CASE WHEN c2.starts_at <= p_at THEN c2.cost ELSE 0 END), 0) AS used_up_to
    FROM costs c2
    LEFT JOIN raw_balances rb ON rb.client_id = c2.client_id
    GROUP BY c2.client_id, rb.raw
  )
  SELECT
    pc.client_id,
    (pc.initial_balance - pc.used_up_to)::int AS balance_after
  FROM per_client pc;
END;
$$;

-- 3. Явні гранти (без PUBLIC)
GRANT EXECUTE ON FUNCTION public.get_session_balance_after(uuid[], text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_balance_after(uuid[], text, timestamptz) TO postgres;
