-- Фіксація дрейфу: на проді accounting_balance давно має p_from/p_to (межі по
-- created_at, Kyiv-доба → timestamptz передає getAccountingBalance через
-- kyivDayUtcBounds), а в repo лишилась 2-параметрова версія з 20260629_accounting_rpc.sql.
-- Цей файл — точний знімок прод-стану (pg_get_functiondef, 2026-07-07), логіка не змінюється.
-- CREATE OR REPLACE ідемпотентний; 2-параметрового overload на проді немає.

CREATE OR REPLACE FUNCTION public.accounting_balance(
  p_method text,
  p_holder uuid DEFAULT NULL,
  p_from   timestamptz DEFAULT NULL,
  p_to     timestamptz DEFAULT NULL
)
RETURNS TABLE(income integer, outcome integer, balance integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.accounting_balance(text, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounting_balance(text, uuid, timestamptz, timestamptz) TO authenticated;
