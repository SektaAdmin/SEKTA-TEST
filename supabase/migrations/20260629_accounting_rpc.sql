-- /accounting: переносимо обчислення балансу та пагінацію feed у Postgres.
-- Раніше клієнт тягнув ВСЮ історію sales+studio_expenses+trainer_payments і
-- рахував суми + сортував у JS → гальмувало при >1000 рядках. Тепер:
--   * accounting_balance — повна сума надходжень/витрат за весь час (SUM в БД);
--   * accounting_feed_page — пагінований хронологічний feed (UNION ALL),
--     повертає лише (kind, id) поточної сторінки + total_count; повні рядки
--     (з embed clients/trainers) дотягує шар запитів через .in('id', ...).
-- Гроші — integer ₴ (інв. #6); trainer_payments.paid_amount (numeric) → round.
-- SECURITY DEFINER + search_path (інв. #10). RLS на цих таблицях: owner/admin —
-- ці RPC викликає лише /accounting (owner/admin), тож DEFINER коректно оминає RLS.

-- Дзеркало клієнтської логіки доходу з продажу:
--   ticket_id IS NOT NULL -> price_paid ; інакше greatest(0, amount_given).
create or replace function public.accounting_balance(
  p_method text,
  p_holder uuid default null
)
returns table(income integer, outcome integer, balance integer)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with sale_income as (
    select coalesce(sum(
      case when s.ticket_id is not null then s.price_paid
           else greatest(0, s.amount_given) end), 0)::int as v
    from sales s
    where s.payment_method = p_method
      and (p_holder is null or s.cash_holder = p_holder)
  ),
  exp_in as (
    select coalesce(sum(case when e.direction = 'income' then e.amount else 0 end), 0)::int as v
    from studio_expenses e
    where e.payment_method = p_method
      and (p_holder is null or e.cash_holder = p_holder)
  ),
  exp_out as (
    select coalesce(sum(case when e.direction = 'expense' then e.amount else 0 end), 0)::int as v
    from studio_expenses e
    where e.payment_method = p_method
      and (p_holder is null or e.cash_holder = p_holder)
  ),
  pay_out as (
    select coalesce(round(sum(tp.paid_amount)), 0)::int as v
    from trainer_payments tp
    where tp.payment_method = p_method
      and (p_holder is null or tp.cash_holder = p_holder)
  )
  select
    (sale_income.v + exp_in.v) as income,
    (exp_out.v + pay_out.v)    as outcome,
    (sale_income.v + exp_in.v) - (exp_out.v + pay_out.v) as balance
  from sale_income, exp_in, exp_out, pay_out;
$$;

revoke all on function public.accounting_balance(text, uuid) from public, anon;
grant execute on function public.accounting_balance(text, uuid) to authenticated;

-- Пагінований feed: повертає лише ідентифікатори поточної сторінки в правильному
-- хронологічному порядку (created_at для всіх трьох типів — як сортує UI) +
-- загальну кількість для «Показати ще». Дати — опційні межі по created_at
-- (Kyiv-доба → UTC-timestamptz передає шар запитів через kyivDayUtcBounds).
create or replace function public.accounting_feed_page(
  p_method     text,
  p_holder     uuid    default null,
  p_from       timestamptz default null,
  p_to         timestamptz default null,
  p_limit      integer default 50,
  p_offset     integer default 0
)
returns table(kind text, id uuid, total_count bigint)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with feed as (
    select 'sale'::text as kind, s.id, s.created_at as sort_ts
    from sales s
    where s.payment_method = p_method
      and (p_holder is null or s.cash_holder = p_holder)
      and (p_from is null or s.created_at >= p_from)
      and (p_to   is null or s.created_at <= p_to)
    union all
    select 'expense', e.id, e.created_at
    from studio_expenses e
    where e.payment_method = p_method
      and (p_holder is null or e.cash_holder = p_holder)
      and (p_from is null or e.created_at >= p_from)
      and (p_to   is null or e.created_at <= p_to)
    union all
    select 'payment', tp.id, tp.created_at
    from trainer_payments tp
    where tp.payment_method = p_method
      and (p_holder is null or tp.cash_holder = p_holder)
      and (p_from is null or tp.created_at >= p_from)
      and (p_to   is null or tp.created_at <= p_to)
  )
  select kind, id, count(*) over () as total_count
  from feed
  order by sort_ts desc
  limit p_limit offset p_offset;
$$;

revoke all on function public.accounting_feed_page(text, uuid, timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.accounting_feed_page(text, uuid, timestamptz, timestamptz, integer, integer) to authenticated;
