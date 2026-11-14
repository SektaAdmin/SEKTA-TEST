-- Гроші з копійками: integer → numeric(12,2).
-- Причина: таблиця студії веде суми з копійками; ціле округлення кожного рядка
-- при перенесенні давало розходження рахунків на кілька гривень.
-- Інв. #5 тепер: гривні numeric(12,2), копійки дозволені, НЕ ділити на 100.
-- Змінені RETURNS/параметри → DROP+CREATE; гранти повторено як були
-- (postgres + authenticated; _accounting_balance_raw — лише postgres).

-- 1) Вʼюхи на clients.balance — прибрати перед зміною типу
DROP VIEW public.clients_with_contacts;
DROP VIEW public.clients_negative_balance;
DROP VIEW public.v_client_balance_summary;

-- 2) Колонки
ALTER TABLE public.sales
  ALTER COLUMN price_paid   TYPE numeric(12,2),
  ALTER COLUMN amount_given TYPE numeric(12,2),
  ALTER COLUMN ticket_price TYPE numeric(12,2);
ALTER TABLE public.studio_expenses ALTER COLUMN amount TYPE numeric(12,2);
ALTER TABLE public.clients ALTER COLUMN balance TYPE numeric(12,2);
ALTER TABLE public.balance_transactions
  ALTER COLUMN amount         TYPE numeric(12,2),
  ALTER COLUMN balance_before TYPE numeric(12,2),
  ALTER COLUMN balance_after  TYPE numeric(12,2);

-- 3) Вʼюхи назад (ті самі визначення/опції/гранти)
CREATE VIEW public.clients_with_contacts WITH (security_invoker = true) AS
 SELECT c.id, c.first_name, c.last_name, c.balance, c.credit_limit, c.balance_updated_at,
        c.created_at, c.updated_at, c.user_id, cc.phone, cc.instagram_username, cc.telegram_username
   FROM clients c LEFT JOIN client_contacts cc ON cc.client_id = c.id;
GRANT SELECT ON public.clients_with_contacts TO anon, authenticated;

CREATE VIEW public.clients_negative_balance WITH (security_invoker = true) AS
 SELECT id, first_name, last_name, balance, credit_limit, balance_updated_at
   FROM clients WHERE balance < 0 ORDER BY balance;
GRANT SELECT ON public.clients_negative_balance TO anon, authenticated;

CREATE VIEW public.v_client_balance_summary AS
 SELECT id, first_name, last_name, balance, credit_limit,
        credit_limit + balance AS available_credit,
        CASE WHEN balance > 0 THEN 'positive'::text WHEN balance = 0 THEN 'zero'::text ELSE 'debt'::text END AS balance_status,
        balance_updated_at
   FROM clients c;
REVOKE ALL ON public.v_client_balance_summary FROM anon, authenticated;

-- 4) RPC
DROP FUNCTION public.create_sale(uuid, uuid, uuid, uuid, integer, integer, text, text, timestamptz);
CREATE OR REPLACE FUNCTION public.create_sale(p_client_id uuid, p_ticket_id uuid DEFAULT NULL::uuid, p_trainer_id uuid DEFAULT NULL::uuid, p_cash_holder uuid DEFAULT NULL::uuid, p_price_paid numeric DEFAULT 0, p_amount_given numeric DEFAULT 0, p_payment_method text DEFAULT 'cash'::text, p_notes text DEFAULT ''::text, p_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(success boolean, sale_id uuid, error_message text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sale_id      uuid;
  v_ticket_name  text    := NULL;
  v_ticket_price numeric := 0;
  v_sessions     integer := 0;
  v_ticket_type  text    := NULL;
  v_amount       numeric;
  v_tx_type      varchar;
  v_description  text;
  v_bal_result   RECORD;
BEGIN
  IF p_ticket_id IS NOT NULL THEN
    SELECT name, price, sessions, ticket_type
      INTO v_ticket_name, v_ticket_price, v_sessions, v_ticket_type
      FROM tickets WHERE id = p_ticket_id;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, NULL::uuid, 'Абонемент не знайдено'::text;
      RETURN;
    END IF;
  END IF;

  INSERT INTO sales (
    client_id, ticket_id, trainer_id, cash_holder,
    ticket_name, ticket_price, sessions, ticket_type,
    price_paid, amount_given, payment_method, notes, created_at
  ) VALUES (
    p_client_id, p_ticket_id, p_trainer_id, p_cash_holder,
    v_ticket_name, v_ticket_price, v_sessions, v_ticket_type,
    p_price_paid, p_amount_given, p_payment_method, COALESCE(p_notes, ''),
    COALESCE(p_created_at, now())
  ) RETURNING id INTO v_sale_id;

  IF p_ticket_id IS NOT NULL AND v_sessions > 0 AND v_ticket_type IS NOT NULL THEN
    INSERT INTO client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (p_client_id, v_ticket_type, v_sessions)
    ON CONFLICT (client_id, ticket_type) DO UPDATE
      SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  IF p_ticket_id IS NULL THEN
    v_amount      := p_amount_given;
    v_tx_type     := 'deposit_topup';
    v_description := 'Поповнення депозиту';
  ELSE
    v_amount      := p_amount_given - p_price_paid;
    v_tx_type     := 'purchase';
    v_description := 'Покупка ' || COALESCE(v_ticket_name, '');
  END IF;

  IF v_amount <> 0 THEN
    SELECT * INTO v_bal_result
    FROM update_client_balance(p_client_id, v_amount, v_tx_type, v_description, v_sale_id, NULL);

    IF NOT v_bal_result.success THEN
      RAISE EXCEPTION '%', v_bal_result.error_message;
    END IF;
  END IF;

  RETURN QUERY SELECT true, v_sale_id, NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, NULL::uuid, SQLERRM;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_sale(uuid, uuid, uuid, uuid, numeric, numeric, text, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, uuid, uuid, uuid, numeric, numeric, text, text, timestamptz) TO authenticated;

DROP FUNCTION public.update_sale(uuid, uuid, uuid, uuid, uuid, text, integer, integer, text, integer, integer, text, text, timestamptz);
CREATE OR REPLACE FUNCTION public.update_sale(p_sale_id uuid, p_client_id uuid, p_ticket_id uuid, p_trainer_id uuid, p_cash_holder uuid DEFAULT NULL::uuid, p_ticket_name text DEFAULT NULL::text, p_ticket_price numeric DEFAULT 0, p_sessions integer DEFAULT 0, p_ticket_type text DEFAULT NULL::text, p_price_paid numeric DEFAULT 0, p_amount_given numeric DEFAULT 0, p_payment_method text DEFAULT 'cash'::text, p_notes text DEFAULT ''::text, p_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old_client_id    uuid;
  v_old_amount_given numeric;
  v_old_price_paid   numeric;
  v_old_sessions     integer;
  v_old_ticket_type  text;
  v_old_delta        numeric;
  v_new_delta        numeric;
  v_correction       numeric;
  v_ok               boolean;
  v_err              text;
BEGIN
  SELECT client_id, amount_given, price_paid, sessions, ticket_type
  INTO v_old_client_id, v_old_amount_given, v_old_price_paid, v_old_sessions, v_old_ticket_type
  FROM sales WHERE id = p_sale_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Продажу не знайдено'::text;
    RETURN;
  END IF;

  v_old_delta := v_old_amount_given - v_old_price_paid;
  v_new_delta := p_amount_given - p_price_paid;

  IF v_old_client_id = p_client_id THEN
    v_correction := v_new_delta - v_old_delta;
    IF v_correction <> 0 THEN
      SELECT t.success, t.error_message INTO v_ok, v_err
      FROM public.update_client_balance(
        p_client_id, v_correction, 'adjustment', 'Редагування продажи', p_sale_id, NULL
      ) t;
      IF NOT v_ok THEN RETURN QUERY SELECT false, v_err; RETURN; END IF;
    END IF;
  ELSE
    IF v_old_delta <> 0 THEN
      SELECT t.success, t.error_message INTO v_ok, v_err
      FROM public.update_client_balance(
        v_old_client_id, -v_old_delta, 'refund', 'Скасування продажи (зміна клієнта)', p_sale_id, NULL
      ) t;
      IF NOT v_ok THEN RETURN QUERY SELECT false, v_err; RETURN; END IF;
    END IF;
    IF v_new_delta <> 0 THEN
      SELECT t.success, t.error_message INTO v_ok, v_err
      FROM public.update_client_balance(
        p_client_id, v_new_delta, 'purchase', 'Передача продажи (зміна клієнта)', p_sale_id, NULL
      ) t;
      IF NOT v_ok THEN RETURN QUERY SELECT false, v_err; RETURN; END IF;
    END IF;
  END IF;

  -- Reverse old sessions
  IF COALESCE(v_old_sessions, 0) > 0 AND v_old_ticket_type IS NOT NULL THEN
    INSERT INTO client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_old_client_id, v_old_ticket_type, -v_old_sessions)
    ON CONFLICT (client_id, ticket_type) DO UPDATE
      SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  -- Apply new sessions
  IF COALESCE(p_sessions, 0) > 0 AND p_ticket_type IS NOT NULL THEN
    INSERT INTO client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (p_client_id, p_ticket_type, p_sessions)
    ON CONFLICT (client_id, ticket_type) DO UPDATE
      SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  UPDATE sales SET
    client_id      = p_client_id,
    ticket_id      = p_ticket_id,
    trainer_id     = p_trainer_id,
    cash_holder    = p_cash_holder,
    ticket_name    = p_ticket_name,
    ticket_price   = p_ticket_price,
    sessions       = p_sessions,
    ticket_type    = p_ticket_type,
    price_paid     = p_price_paid,
    amount_given   = p_amount_given,
    payment_method = p_payment_method,
    notes          = p_notes,
    created_at     = COALESCE(p_created_at, created_at)
  WHERE id = p_sale_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_sale(uuid, uuid, uuid, uuid, uuid, text, numeric, integer, text, numeric, numeric, text, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_sale(uuid, uuid, uuid, uuid, uuid, text, numeric, integer, text, numeric, numeric, text, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_sale(p_sale_id uuid)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id    uuid;
  v_amount_given numeric;
  v_price_paid   numeric;
  v_sessions     integer;
  v_ticket_type  text;
  v_delta        numeric;
  v_ok           boolean;
  v_err          text;
BEGIN
  SELECT client_id, amount_given, price_paid, sessions, ticket_type
  INTO v_client_id, v_amount_given, v_price_paid, v_sessions, v_ticket_type
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Продажу не знайдено'::text;
    RETURN;
  END IF;

  -- Повертаємо куплені сесії (знімаємо з балансу)
  IF COALESCE(v_sessions, 0) > 0 AND v_ticket_type IS NOT NULL THEN
    INSERT INTO client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_client_id, v_ticket_type, -v_sessions)
    ON CONFLICT (client_id, ticket_type) DO UPDATE
      SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  -- Повертаємо гроші (delta = amount_given - price_paid)
  v_delta := v_amount_given - v_price_paid;
  IF v_delta <> 0 THEN
    SELECT t.success, t.error_message
    INTO v_ok, v_err
    FROM public.update_client_balance(
      v_client_id, -v_delta,
      'admin_adjustment'::varchar,
      'Скасування продажи'::text,
      p_sale_id, NULL::text
    ) t;

    IF NOT v_ok THEN
      RETURN QUERY SELECT false, v_err;
      RETURN;
    END IF;
  END IF;

  DELETE FROM sales WHERE id = p_sale_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$function$;
REVOKE ALL ON FUNCTION public.delete_sale(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_sale(uuid) TO authenticated;

DROP FUNCTION public.update_client_balance(uuid, numeric, varchar, text, uuid, text);
CREATE OR REPLACE FUNCTION public.update_client_balance(p_client_id uuid, p_amount numeric, p_transaction_type character varying, p_description text, p_related_sale_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, new_balance numeric, transaction_id uuid, error_message text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client         RECORD;
  v_transaction_id uuid;
  v_amount         numeric := round(p_amount, 2);  -- гроші — гривні з копійками (інв. #5)
BEGIN
  SELECT * INTO v_client FROM clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::numeric, NULL::uuid, 'Клієнта не знайдено'::text;
    RETURN;
  END IF;

  IF v_client.balance + v_amount < -v_client.credit_limit THEN
    RETURN QUERY SELECT false, v_client.balance, NULL::uuid,
      'Перевищено ліміт кредиту'::text;
    RETURN;
  END IF;

  UPDATE clients SET balance = balance + v_amount WHERE id = p_client_id;

  INSERT INTO balance_transactions (
    client_id, amount, transaction_type, description, related_sale_id, reason,
    balance_before, balance_after, created_at
  ) VALUES (
    p_client_id, v_amount, p_transaction_type, p_description, p_related_sale_id, p_reason,
    v_client.balance, v_client.balance + v_amount, now()
  ) RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT true, v_client.balance + v_amount, v_transaction_id, NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, v_client.balance, NULL::uuid, SQLERRM;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_client_balance(uuid, numeric, varchar, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_client_balance(uuid, numeric, varchar, text, uuid, text) TO authenticated;

DROP FUNCTION public.accounting_balance(text, uuid, timestamptz, timestamptz);
DROP FUNCTION public.my_trainer_cash(date, date);
DROP FUNCTION public._accounting_balance_raw(text, uuid, timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public._accounting_balance_raw(p_method text, p_holder uuid DEFAULT NULL::uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(income numeric, outcome numeric, balance numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with sale_income as (
    select coalesce(sum(greatest(0, s.amount_given)), 0) as v
    from sales s
    where s.payment_method = p_method
      and (p_holder is null or s.cash_holder = p_holder)
      and (p_from is null or s.created_at >= p_from)
      and (p_to   is null or s.created_at <= p_to)
  ),
  exp_in as (
    select coalesce(sum(case when e.direction = 'income' then e.amount else 0 end), 0) as v
    from studio_expenses e
    where e.payment_method = p_method
      and (p_holder is null or e.cash_holder = p_holder)
      and (p_from is null or e.created_at >= p_from)
      and (p_to   is null or e.created_at <= p_to)
  ),
  exp_out as (
    select coalesce(sum(case when e.direction = 'expense' then e.amount else 0 end), 0) as v
    from studio_expenses e
    where e.payment_method = p_method
      and (p_holder is null or e.cash_holder = p_holder)
      and (p_from is null or e.created_at >= p_from)
      and (p_to   is null or e.created_at <= p_to)
  ),
  pay_out as (
    select coalesce(sum(tp.paid_amount), 0) as v
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
REVOKE ALL ON FUNCTION public._accounting_balance_raw(text, uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accounting_balance(p_method text, p_holder uuid DEFAULT NULL::uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(income numeric, outcome numeric, balance numeric)
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
REVOKE ALL ON FUNCTION public.accounting_balance(text, uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accounting_balance(text, uuid, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_trainer_cash(p_from date, p_to date)
 RETURNS TABLE(cash_period numeric, cash_total numeric)
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
    - (SELECT coalesce(sum(tp.paid_amount), 0)
         FROM trainer_payments tp
        WHERE tp.payment_method = 'cash' AND tp.cash_holder = v_trainer
          AND tp.payment_date BETWEEN p_from AND p_to)
    ),
    (SELECT b.balance FROM _accounting_balance_raw('cash', v_trainer) b);
END;
$function$;
REVOKE ALL ON FUNCTION public.my_trainer_cash(date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_trainer_cash(date, date) TO authenticated;

DROP FUNCTION public.attendance_overview(uuid, integer);
CREATE OR REPLACE FUNCTION public.attendance_overview(p_trainer_id uuid DEFAULT NULL::uuid, p_period_days integer DEFAULT 60)
 RETURNS TABLE(client_id uuid, first_name text, last_name text, balance numeric, last_visit_at timestamp with time zone, days_since integer, visits_period integer, visits_prev_period integer, next_enrollment_at timestamp with time zone, is_regular boolean, regular_series text[], planned_regular integer, missed_regular integer, sessions_left integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_role text := auth_role();
  v_trainer uuid := p_trainer_id;
  v_days integer := greatest(coalesce(p_period_days, 60), 1);
BEGIN
  IF v_role = 'trainer' THEN
    v_trainer := current_trainer_id();
    IF v_trainer IS NULL THEN
      RAISE EXCEPTION 'trainer profile not found' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scope_series AS (
    SELECT cs.id,
           concat_ws(' ', nullif(cs.title, ''),
             (ARRAY['Нд','Пн','Вт','Ср','Чт','Пт','Сб'])[cs.day_of_week + 1],
             to_char(cs.time_of_day, 'HH24:MI')) AS title
    FROM class_series cs
    WHERE v_trainer IS NULL OR cs.trainer_id = v_trainer
  ),
  scope_classes AS (
    SELECT c.id, c.starts_at, c.series_id
    FROM classes c
    WHERE NOT c.is_cancelled
      AND c.ticket_type NOT LIKE '%rental'
      AND (v_trainer IS NULL OR c.trainer_id = v_trainer
           OR c.series_id IN (SELECT ss.id FROM scope_series ss))
  ),
  regulars AS (
    SELECT sc.client_id,
           array_agg(DISTINCT ss.title) FILTER (WHERE ss.title <> '') AS series_titles
    FROM series_clients sc
    JOIN scope_series ss ON ss.id = sc.series_id
    WHERE sc.valid_to IS NULL OR sc.valid_to >= (now() AT TIME ZONE 'Europe/Kyiv')::date
    GROUP BY sc.client_id
  ),
  past AS (
    SELECT e.client_id, e.status, e.cancellation_source, k.starts_at, k.series_id
    FROM enrollments e
    JOIN scope_classes k ON k.id = e.class_id
    WHERE k.starts_at < now()
  ),
  candidates AS (
    SELECT r.client_id FROM regulars r
    UNION
    SELECT p.client_id FROM past p
    WHERE p.status = 'attended' AND p.starts_at >= now() - interval '180 days'
  ),
  visits AS (
    SELECT p.client_id,
           max(p.starts_at) AS last_visit_at,
           count(*) FILTER (WHERE p.starts_at >= now() - make_interval(days => v_days))::int AS v_period,
           count(*) FILTER (WHERE p.starts_at <  now() - make_interval(days => v_days)
                              AND p.starts_at >= now() - make_interval(days => v_days * 2))::int AS v_prev
    FROM past p
    WHERE p.status = 'attended'
    GROUP BY p.client_id
  ),
  regular_marks AS (
    SELECT p.client_id,
           count(*) FILTER (WHERE coalesce(p.cancellation_source, '') <> 'planned')::int AS planned,
           count(*) FILTER (
             WHERE p.status = 'noshow'
                OR (p.status = 'cancelled' AND coalesce(p.cancellation_source, '') NOT IN ('class_cancelled', 'planned'))
           )::int AS missed
    FROM past p
    JOIN series_clients sc ON sc.series_id = p.series_id AND sc.client_id = p.client_id
    WHERE p.starts_at >= now() - make_interval(days => v_days)
      AND p.starts_at >= sc.created_at
      AND p.status IN ('attended', 'noshow', 'cancelled')
    GROUP BY p.client_id
  ),
  upcoming AS (
    SELECT e.client_id, min(k.starts_at) AS next_at
    FROM enrollments e
    JOIN scope_classes k ON k.id = e.class_id
    WHERE k.starts_at >= now() AND e.status IN ('enrolled', 'waitlist')
    GROUP BY e.client_id
  ),
  sessions AS (
    SELECT b.client_id, sum(greatest(b.sessions_balance, 0))::int AS left_total
    FROM client_session_balances b
    GROUP BY b.client_id
  )
  SELECT
    cl.id,
    cl.first_name,
    cl.last_name,
    cl.balance,
    v.last_visit_at,
    CASE WHEN v.last_visit_at IS NULL THEN NULL
         ELSE ((now() AT TIME ZONE 'Europe/Kyiv')::date
               - (v.last_visit_at AT TIME ZONE 'Europe/Kyiv')::date)::int
    END,
    coalesce(v.v_period, 0),
    coalesce(v.v_prev, 0),
    u.next_at,
    (r.client_id IS NOT NULL),
    coalesce(r.series_titles, ARRAY[]::text[]),
    coalesce(m.planned, 0),
    coalesce(m.missed, 0),
    coalesce(s.left_total, 0)
  FROM candidates c
  JOIN clients cl ON cl.id = c.client_id
  LEFT JOIN visits v ON v.client_id = c.client_id
  LEFT JOIN regulars r ON r.client_id = c.client_id
  LEFT JOIN regular_marks m ON m.client_id = c.client_id
  LEFT JOIN upcoming u ON u.client_id = c.client_id
  LEFT JOIN sessions s ON s.client_id = c.client_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.attendance_overview(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attendance_overview(uuid, integer) TO authenticated;

