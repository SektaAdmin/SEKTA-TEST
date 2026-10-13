-- Екран «Моя зарплата» в кабінеті тренера (/trainer/salary) + закриття діри accounting_balance.
--
-- 1) accounting_balance був SECURITY DEFINER БЕЗ гейта ролі → будь-який authenticated
--    (і client) бачив касу студії. Тіло винесено в _accounting_balance_raw (без EXECUTE для
--    клієнтів API), сам accounting_balance — гейт owner/admin + делегування.
-- 2) calc_trainer_salary_v2 (INVOKER) — тренер міг передати чужий p_trainer_id. Гейт:
--    owner/admin — будь-кого, trainer — лише себе. Сигнатура та сама → гранти зберігаються.
-- 3) my_trainer_cash — готівка «на руках» поточного тренера (тренер не має RLS на sales /
--    studio_expenses): cash_total = та сама правда, що accounting_balance('cash', тренер);
--    cash_period — дзеркало getTrainerCashBalance (sales/expenses по created_at у Kyiv-добах,
--    виплати по payment_date).

-- ── 1. accounting_balance ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._accounting_balance_raw(
  p_method text,
  p_holder uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE(income integer, outcome integer, balance integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  with sale_income as (
    select coalesce(sum(
      case when s.ticket_id is not null then s.price_paid
           else greatest(0, s.amount_given) end), 0)::int as v
    from sales s
    where s.payment_method = p_method
      and (p_holder is null or s.cash_holder = p_holder)
      and (p_from is null or s.created_at >= p_from)
      and (p_to   is null or s.created_at <= p_to)
  ),
  exp_in as (
    select coalesce(sum(case when e.direction = 'income' then e.amount else 0 end), 0)::int as v
    from studio_expenses e
    where e.payment_method = p_method
      and (p_holder is null or e.cash_holder = p_holder)
      and (p_from is null or e.created_at >= p_from)
      and (p_to   is null or e.created_at <= p_to)
  ),
  exp_out as (
    select coalesce(sum(case when e.direction = 'expense' then e.amount else 0 end), 0)::int as v
    from studio_expenses e
    where e.payment_method = p_method
      and (p_holder is null or e.cash_holder = p_holder)
      and (p_from is null or e.created_at >= p_from)
      and (p_to   is null or e.created_at <= p_to)
  ),
  pay_out as (
    select coalesce(round(sum(tp.paid_amount)), 0)::int as v
    from trainer_payments tp
    where tp.payment_method = p_method
      and (p_holder is null or tp.cash_holder = p_holder)
      and (p_from is null or tp.created_at >= p_from)
      and (p_to   is null or tp.created_at <= p_to)
  )
  select
    (sale_income.v + exp_in.v) as income,
    (exp_out.v + pay_out.v)    as outcome,
    (sale_income.v + exp_in.v) - (exp_out.v + pay_out.v) as balance
  from sale_income, exp_in, exp_out, pay_out;
$function$;

REVOKE EXECUTE ON FUNCTION public._accounting_balance_raw(text, uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.accounting_balance(
  p_method text,
  p_holder uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE(income integer, outcome integer, balance integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth_role() IS DISTINCT FROM 'owner' AND auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM _accounting_balance_raw(p_method, p_holder, p_from, p_to);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.accounting_balance(text, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounting_balance(text, uuid, timestamptz, timestamptz) TO authenticated;

-- ── 2. calc_trainer_salary_v2: тренер — лише себе ────────────────────────────
CREATE OR REPLACE FUNCTION public.calc_trainer_salary_v2(p_trainer_id uuid, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(class_id uuid, starts_at timestamp with time zone, ticket_type text, hall_name text, duration_min integer, client_id uuid, client_name text, enrollment_status text, trainer_amount numeric, studio_amount numeric, rate_missing boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    c.id,
    c.starts_at,
    c.ticket_type,
    h.name,
    c.duration_min,
    cl.id,
    TRIM(COALESCE(cl.first_name || ' ' || cl.last_name, cl.first_name, cl.last_name, '—')),
    e.status,
    -- ставка × фактично списані сесії; ставки нема на дату → 0 + rate_missing
    COALESCE(tr.trainer_rate, 0) * e.sessions_used,
    COALESCE(tr.studio_rate, 0) * e.sessions_used,
    (tr.trainer_rate IS NULL)
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
    -- гейт: owner/admin — будь-якого тренера, trainer — лише себе
    AND (auth_role() IN ('owner', 'admin') OR p_trainer_id = current_trainer_id())
  ORDER BY c.starts_at, c.id, cl.last_name, cl.first_name;
$function$;

-- ── 3. my_trainer_cash ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_trainer_cash(p_from date, p_to date)
RETURNS TABLE(cash_period integer, cash_total integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_trainer uuid := current_trainer_id();
  v_from timestamptz := (p_from::timestamp AT TIME ZONE 'Europe/Kyiv');
  v_to   timestamptz := ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Kyiv');
BEGIN
  IF auth_role() IS DISTINCT FROM 'trainer' OR v_trainer IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (
      (SELECT coalesce(sum(CASE WHEN s.ticket_id IS NOT NULL THEN s.price_paid
                                ELSE greatest(0, s.amount_given) END), 0)
         FROM sales s
        WHERE s.payment_method = 'cash' AND s.cash_holder = v_trainer
          AND s.created_at >= v_from AND s.created_at < v_to)
    + (SELECT coalesce(sum(CASE e.direction WHEN 'income' THEN e.amount WHEN 'expense' THEN -e.amount ELSE 0 END), 0)
         FROM studio_expenses e
        WHERE e.payment_method = 'cash' AND e.cash_holder = v_trainer
          AND e.created_at >= v_from AND e.created_at < v_to)
    - (SELECT coalesce(round(sum(tp.paid_amount)), 0)
         FROM trainer_payments tp
        WHERE tp.payment_method = 'cash' AND tp.cash_holder = v_trainer
          AND tp.payment_date BETWEEN p_from AND p_to)
    )::int,
    (SELECT b.balance FROM _accounting_balance_raw('cash', v_trainer) b);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.my_trainer_cash(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_trainer_cash(date, date) TO authenticated;
