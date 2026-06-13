-- Fix: NULL-bypass у гейтах get_session_balances_running та get_session_balance_after
--
-- Вектор: для authenticated-юзера без рядка в clients (owner/admin/trainer/непривʼязаний client)
-- current_client_id() повертає NULL. Вираз `x != NULL` = NULL (не FALSE) — IF не спрацьовує,
-- гейт пропускається, SECURITY DEFINER повертає чужий баланс в обхід RLS.
--
-- Виправлення:
--   1. get_session_balances_running: `p_client_id != current_client_id()`
--      → явна NULL-перевірка + IS DISTINCT FROM
--   2. get_session_balance_after: внутрішній `p_client_ids[1] != current_client_id()`
--      → IS DISTINCT FROM (cardinality-перевірка вже NULL-safe, лишається)

-- ── 1. get_session_balances_running ──────────────────────────────────────────

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
  -- NULL-safe: якщо current_client_id() IS NULL (кабінет не привʼязано) — відмова.
  IF auth_role() = 'client' THEN
    IF current_client_id() IS NULL
       OR p_client_id IS DISTINCT FROM current_client_id() THEN
      RAISE EXCEPTION 'access denied';
    END IF;
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

-- ── 2. get_session_balance_after ─────────────────────────────────────────────

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
  -- NULL-safe гейт: cardinality(NULL)=0 (не NULL), тому перша умова вже відсіює NULL-масив.
  -- IS DISTINCT FROM замість != виправляє залишковий NULL-bypass коли current_client_id()=NULL.
  IF auth_role() = 'client' THEN
    IF current_client_id() IS NULL
       OR cardinality(p_client_ids) != 1
       OR p_client_ids[1] IS DISTINCT FROM current_client_id() THEN
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

-- EXECUTE-гранти лишаються без змін (authenticated + postgres, не PUBLIC).
-- Перевірка: поточний стан достатній, додаткових REVOKE/GRANT не потрібно.
