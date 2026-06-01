-- Фаза 5: Fix DB advisors — search_path + RLS cleanup + indexes

-- === 1. Fix RPC search_path ===
-- Додати SET search_path для RPC без нього (безпека від ескалації)

DROP FUNCTION IF EXISTS public.restore_class(uuid);
DROP FUNCTION IF EXISTS public.auto_close_classes();
DROP FUNCTION IF EXISTS public.update_client_balance(uuid, numeric, varchar, text, uuid, text);

CREATE OR REPLACE FUNCTION public.restore_class(p_class_id uuid)
RETURNS TABLE(success boolean, restored_count integer, error_message text)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_class RECORD;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_class FROM classes WHERE id = p_class_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Заняття не знайдено'::text;
    RETURN;
  END IF;

  UPDATE classes SET is_cancelled = false WHERE id = p_class_id;

  -- Restore attendance-marked enrollments with their sessions
  UPDATE enrollments
  SET status = 'attended', sessions_used =
      CASE
        WHEN duration_min >= 120 THEN array_length(hours_attended, 1)
        ELSE 1
      END
  WHERE class_id = p_class_id AND status = 'cancelled' AND sessions_used > 0
  RETURNING 1 INTO v_count;

  UPDATE enrollments
  SET status = 'cancelled', sessions_used = 0
  WHERE class_id = p_class_id AND status = 'cancelled' AND sessions_used = 0;

  RETURN QUERY SELECT true, v_count, NULL::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_close_classes()
RETURNS TABLE(closed_count integer)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count integer := 0;
  v_enrollment RECORD;
BEGIN
  FOR v_enrollment IN
    SELECT e.id, e.client_id, e.ticket_type, c.duration_min
    FROM enrollments e
    JOIN classes c ON e.class_id = c.id
    WHERE c.starts_at > now() - interval '24 hours'
      AND c.starts_at < now() - interval '5 minutes'
      AND e.status = 'enrolled'
  LOOP
    PERFORM mark_attendance(v_enrollment.id,
      CASE WHEN v_enrollment.duration_min >= 120 THEN 1 ELSE 1 END);
    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_client_balance(
  p_client_id uuid,
  p_amount numeric,
  p_transaction_type varchar,
  p_description text,
  p_related_sale_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(success boolean, new_balance integer, transaction_id uuid, error_message text)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_client RECORD;
  v_transaction_id uuid;
BEGIN
  SELECT * INTO v_client FROM clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, NULL::uuid, 'Клієнта не знайдено'::text;
    RETURN;
  END IF;

  IF v_client.balance + p_amount < -v_client.credit_limit THEN
    RETURN QUERY SELECT false, v_client.balance, NULL::uuid,
      'Перевищено ліміт кредиту'::text;
    RETURN;
  END IF;

  UPDATE clients SET balance = balance + p_amount WHERE id = p_client_id;

  INSERT INTO balance_transactions (
    client_id, amount, transaction_type, description, related_sale_id, reason, created_at
  ) VALUES (
    p_client_id, p_amount, p_transaction_type, p_description, p_related_sale_id, p_reason, now()
  ) RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT true, v_client.balance + p_amount, v_transaction_id, NULL::text;
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, v_client.balance, NULL::uuid, SQLERRM;
END;
$function$;

-- === 2. Drop duplicate RLS policies ===
-- Таблиці мають дублі "authenticated_all" + "tableName: authenticated users can X"
-- Залишити лише "authenticated_all" (універсальна, покриває все)

-- clients
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.clients;
DROP POLICY IF EXISTS "clients: anon can read" ON public.clients;
DROP POLICY IF EXISTS "clients: authenticated users can read" ON public.clients;
DROP POLICY IF EXISTS "clients: authenticated users can insert" ON public.clients;
DROP POLICY IF EXISTS "clients: authenticated users can update" ON public.clients;
DROP POLICY IF EXISTS "clients: authenticated users can delete" ON public.clients;

-- halls
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.halls;
DROP POLICY IF EXISTS "authenticated_all" ON public.halls;

-- sales
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.sales;
DROP POLICY IF EXISTS "sales: authenticated users can read" ON public.sales;
DROP POLICY IF EXISTS "sales: authenticated users can insert" ON public.sales;
DROP POLICY IF EXISTS "sales: authenticated users can update" ON public.sales;
DROP POLICY IF EXISTS "sales: authenticated users can delete" ON public.sales;

-- tickets
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.tickets;
DROP POLICY IF EXISTS "tickets: authenticated users can read" ON public.tickets;
DROP POLICY IF EXISTS "tickets: authenticated users can insert" ON public.tickets;
DROP POLICY IF EXISTS "tickets: authenticated users can update" ON public.tickets;
DROP POLICY IF EXISTS "tickets: authenticated users can delete" ON public.tickets;

-- trainers
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.trainers;
DROP POLICY IF EXISTS "trainers: anon can read" ON public.trainers;
DROP POLICY IF EXISTS "trainers: authenticated users can read" ON public.trainers;
DROP POLICY IF EXISTS "trainers: authenticated users can insert" ON public.trainers;
DROP POLICY IF EXISTS "trainers: authenticated users can update" ON public.trainers;
DROP POLICY IF EXISTS "trainers: authenticated users can delete" ON public.trainers;

-- === 3. Add missing FK indexes ===
CREATE INDEX IF NOT EXISTS idx_class_series_hall_id ON public.class_series(hall_id);
CREATE INDEX IF NOT EXISTS idx_class_series_trainer_id ON public.class_series(trainer_id);
CREATE INDEX IF NOT EXISTS idx_series_clients_client_id ON public.series_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_studio_expenses_trainer_id ON public.studio_expenses(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_payments_trainer_id ON public.trainer_payments(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_rates_trainer_id ON public.trainer_rates(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_rates_hall_id ON public.trainer_rates(hall_id);

-- === 4. Drop unused indexes ===
DROP INDEX IF EXISTS public.idx_sales_price_paid;
DROP INDEX IF EXISTS public.idx_tickets_type;
DROP INDEX IF EXISTS public.idx_sales_client_created;
DROP INDEX IF EXISTS public.idx_sales_ticket_id;
DROP INDEX IF EXISTS public.idx_sales_trainer_id;
DROP INDEX IF EXISTS public.idx_classes_trainer_id;
DROP INDEX IF EXISTS public.idx_classes_hall_id;
DROP INDEX IF EXISTS public.idx_balance_transactions_type;
DROP INDEX IF EXISTS public.idx_sales_cash_holder;
DROP INDEX IF EXISTS public.idx_trainer_payments_cash_holder;
