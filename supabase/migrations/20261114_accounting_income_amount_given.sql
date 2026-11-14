-- Каса = реально отримані гроші.
-- Було: продаж абонемента → price_paid (ціна), без тікета → greatest(0, amount_given).
-- Це розходилось із реальною касою при змішаній оплаті: переплата в депозит
-- (amount_given > price_paid) не потрапляла в рахунок, часткова оплата з депозиту
-- (amount_given < price_paid) завищувала рахунок на суму з депозиту.
-- Стало: будь-який продаж → greatest(0, amount_given) (живі гроші; payment_method
-- 'deposit' має amount_given = 0 і в рахунки не потрапляє за фільтром методу).
-- Сигнатури не змінюються → CREATE OR REPLACE зберігає гранти.

CREATE OR REPLACE FUNCTION public._accounting_balance_raw(p_method text, p_holder uuid DEFAULT NULL::uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(income integer, outcome integer, balance integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with sale_income as (
    select coalesce(sum(greatest(0, s.amount_given)), 0)::int as v
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
      (SELECT coalesce(sum(greatest(0, s.amount_given)), 0)
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
