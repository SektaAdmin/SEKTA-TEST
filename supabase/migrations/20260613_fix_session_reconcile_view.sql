-- Fix #4: reconcile-детектор балансу сесій
-- VIEW що знаходить розбіжності між client_session_balances і
-- тим що реконструюється з sales + enrollments.
--
-- Очікуваний баланс = куплено (sales.sessions де ticket_id IS NOT NULL)
--                   − витрачено (enrollments.sessions_used)
-- drift > 0 = у балансі більше ніж мало б бути (подвійне повернення?)
-- drift < 0 = у балансі менше (незафіксоване списання?)

CREATE OR REPLACE VIEW public.session_balance_reconcile AS
WITH purchased AS (
  SELECT
    client_id,
    ticket_type,
    COALESCE(SUM(sessions), 0) AS total_purchased
  FROM public.sales
  WHERE ticket_id IS NOT NULL
    AND ticket_type IS NOT NULL
  GROUP BY client_id, ticket_type
),
spent AS (
  SELECT
    e.client_id,
    c.ticket_type,
    COALESCE(SUM(e.sessions_used), 0) AS total_spent
  FROM public.enrollments e
  JOIN public.classes c ON c.id = e.class_id
  WHERE e.sessions_used > 0
  GROUP BY e.client_id, c.ticket_type
),
expected AS (
  SELECT
    COALESCE(p.client_id, s.client_id) AS client_id,
    COALESCE(p.ticket_type, s.ticket_type) AS ticket_type,
    COALESCE(p.total_purchased, 0) - COALESCE(s.total_spent, 0) AS expected_balance
  FROM purchased p
  FULL OUTER JOIN spent s
    ON s.client_id = p.client_id AND s.ticket_type = p.ticket_type
)
SELECT
  e.client_id,
  cl.first_name || ' ' || cl.last_name AS client_name,
  e.ticket_type,
  e.expected_balance,
  COALESCE(csb.sessions_balance, 0) AS actual_balance,
  COALESCE(csb.sessions_balance, 0) - e.expected_balance AS drift
FROM expected e
LEFT JOIN public.client_session_balances csb
  ON csb.client_id = e.client_id AND csb.ticket_type = e.ticket_type
LEFT JOIN public.clients cl ON cl.id = e.client_id
WHERE COALESCE(csb.sessions_balance, 0) <> e.expected_balance;

ALTER VIEW public.session_balance_reconcile OWNER TO postgres;
REVOKE ALL ON public.session_balance_reconcile FROM PUBLIC, anon;
GRANT SELECT ON public.session_balance_reconcile TO authenticated;
