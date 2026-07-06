-- fix #2 з ревью ЗП (2026-07-06): «закриття періоду» через звірку снапшот vs live.
--
-- Розрахунок ЗП live, а дані рухомі задом (postfactum attendance, restore/add
-- ставки заднім числом). Після фінальної виплати live-пересчёт може розійтися зі
-- снапшотом trainer_payments.calculated_amount — досі ніхто не детектив.
-- View повертає лише фінальні виплати з розходженням (за зразком
-- session_balance_reconcile); порожній = усе зійшлося.
--
-- Межі періоду — ЯК БУДУЄ UI при створенні виплати (calculations/page.tsx:
-- `${dateFrom}T00:00:00` / `${dateTo}T23:59:59` без TZ → сервер трактує як UTC),
-- інакше звірка «розійдеться» на заняттях біля півночі.
--
-- security_invoker: RLS trainer_payments owner-only → звірку бачить лише owner
-- (на відміну від session_balance_reconcile, який DEFINER by design).

CREATE VIEW public.salary_payment_reconcile
WITH (security_invoker = true) AS
SELECT
  tp.id AS payment_id,
  tp.trainer_id,
  t.name AS trainer_name,
  tp.period_start,
  tp.period_end,
  tp.calculated_amount,
  live.amount AS live_amount,
  live.amount - tp.calculated_amount AS drift
FROM public.trainer_payments tp
JOIN public.trainers t ON t.id = tp.trainer_id
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(trainer_amount), 0) AS amount
  FROM public.calc_trainer_salary_v2(
    tp.trainer_id,
    (tp.period_start::text || ' 00:00:00')::timestamptz,
    (tp.period_end::text   || ' 23:59:59')::timestamptz
  )
) live
WHERE tp.payment_type = 'final'
  AND live.amount <> tp.calculated_amount;

REVOKE ALL ON public.salary_payment_reconcile FROM PUBLIC, anon;
GRANT SELECT ON public.salary_payment_reconcile TO authenticated;
