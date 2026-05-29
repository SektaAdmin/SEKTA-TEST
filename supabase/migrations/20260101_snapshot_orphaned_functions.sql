-- Snapshot of functions that existed in production but were not in version control.
-- These were created manually via Supabase Dashboard before migrations were enforced.
-- DO NOT re-apply if already present — all use CREATE OR REPLACE.

-- ─── update_client_balance ────────────────────────────────────────────────────
-- Core balance mutation. Never UPDATE clients.balance directly — always call this.

CREATE OR REPLACE FUNCTION public.update_client_balance(
  p_client_id uuid,
  p_amount numeric,
  p_transaction_type character varying,
  p_description text DEFAULT NULL,
  p_related_sale_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(success boolean, new_balance numeric, transaction_id uuid, error_message text)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_balance_before DECIMAL;
    v_balance_after DECIMAL;
    v_transaction_id UUID;
    v_credit_limit DECIMAL;
BEGIN
    IF p_client_id IS NULL OR p_amount IS NULL OR p_transaction_type IS NULL THEN
        RETURN QUERY SELECT false, 0::DECIMAL, NULL::UUID, 'Missing required parameters'::TEXT;
        RETURN;
    END IF;

    IF p_amount = 0 THEN
        RETURN QUERY SELECT false, 0::DECIMAL, NULL::UUID, 'Amount cannot be zero'::TEXT;
        RETURN;
    END IF;

    SELECT balance, credit_limit INTO v_balance_before, v_credit_limit
    FROM clients WHERE id = p_client_id FOR UPDATE;

    IF v_balance_before IS NULL THEN
        RETURN QUERY SELECT false, 0::DECIMAL, NULL::UUID, 'Client not found'::TEXT;
        RETURN;
    END IF;

    v_balance_after := v_balance_before + p_amount;

    IF v_balance_after < -v_credit_limit THEN
        RETURN QUERY SELECT false, v_balance_before, NULL::UUID,
            ('Credit limit exceeded. Available: ' || (v_credit_limit + v_balance_before)::TEXT);
        RETURN;
    END IF;

    INSERT INTO balance_transactions (
        client_id, amount, transaction_type,
        balance_before, balance_after,
        description, reason, related_sale_id
    ) VALUES (
        p_client_id, p_amount, p_transaction_type,
        v_balance_before, v_balance_after,
        p_description, p_reason, p_related_sale_id
    ) RETURNING balance_transactions.id INTO v_transaction_id;

    UPDATE clients
    SET balance = v_balance_after, balance_updated_at = NOW()
    WHERE id = p_client_id;

    RETURN QUERY SELECT true, v_balance_after, v_transaction_id, NULL::TEXT;
END;
$function$;

-- ─── create_sale ──────────────────────────────────────────────────────────────
-- INSERT into sales + update session balance + update_client_balance atomically.

CREATE OR REPLACE FUNCTION public.create_sale(
  p_client_id uuid,
  p_ticket_id uuid DEFAULT NULL,
  p_trainer_id uuid DEFAULT NULL,
  p_price_paid integer DEFAULT 0,
  p_amount_given integer DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_notes text DEFAULT '',
  p_created_at timestamp with time zone DEFAULT NULL
)
RETURNS TABLE(success boolean, sale_id uuid, error_message text)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_sale_id      uuid;
  v_ticket_name  text    := NULL;
  v_ticket_price integer := 0;
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
    client_id, ticket_id, trainer_id,
    ticket_name, ticket_price, sessions, ticket_type,
    price_paid, amount_given, payment_method, notes, created_at
  ) VALUES (
    p_client_id, p_ticket_id, p_trainer_id,
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

-- ─── update_sale ──────────────────────────────────────────────────────────────
-- Reverse old balance delta + apply new, handle session balance corrections.

CREATE OR REPLACE FUNCTION public.update_sale(
  p_sale_id uuid,
  p_client_id uuid,
  p_ticket_id uuid,
  p_trainer_id uuid,
  p_ticket_name text,
  p_ticket_price integer,
  p_sessions integer,
  p_ticket_type text,
  p_price_paid integer,
  p_amount_given integer,
  p_payment_method text,
  p_notes text,
  p_created_at timestamp with time zone DEFAULT NULL
)
RETURNS TABLE(success boolean, error_message text)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_old_client_id    uuid;
  v_old_amount_given integer;
  v_old_price_paid   integer;
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

-- ─── delete_sale ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_sale(p_sale_id uuid)
RETURNS TABLE(success boolean, error_message text)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_client_id    uuid;
  v_amount_given integer;
  v_price_paid   integer;
  v_sessions     integer;
  v_ticket_type  text;
  v_delta        numeric;
  v_ok           boolean;
  v_err          text;
BEGIN
  SELECT client_id, amount_given, price_paid, sessions, ticket_type
  INTO v_client_id, v_amount_given, v_price_paid, v_sessions, v_ticket_type
  FROM sales WHERE id = p_sale_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Продажу не знайдено'::text;
    RETURN;
  END IF;

  v_delta := v_amount_given - v_price_paid;

  IF v_delta <> 0 THEN
    SELECT t.success, t.error_message INTO v_ok, v_err
    FROM public.update_client_balance(
      v_client_id, -v_delta, 'admin_adjustment', 'Скасування продажи', p_sale_id, NULL
    ) t;
    IF NOT v_ok THEN RETURN QUERY SELECT false, v_err; RETURN; END IF;
  END IF;

  IF COALESCE(v_sessions, 0) > 0 AND v_ticket_type IS NOT NULL THEN
    INSERT INTO client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_client_id, v_ticket_type, -v_sessions)
    ON CONFLICT (client_id, ticket_type) DO UPDATE
      SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  DELETE FROM sales WHERE id = p_sale_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$function$;

-- ─── check_class_conflicts ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_class_conflicts(
  p_starts_at timestamp with time zone,
  p_duration_min integer,
  p_hall_id uuid DEFAULT NULL,
  p_trainer_id uuid DEFAULT NULL,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS TABLE(conflict_type text, class_id uuid, starts_at timestamp with time zone, title text, ticket_type text)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    CASE WHEN c.hall_id = p_hall_id AND p_hall_id IS NOT NULL THEN 'hall' ELSE 'trainer' END,
    c.id, c.starts_at, c.title, c.ticket_type
  FROM classes c
  WHERE c.is_cancelled = false
    AND (p_exclude_id IS NULL OR c.id != p_exclude_id)
    AND c.starts_at < (p_starts_at + (p_duration_min || ' minutes')::interval)
    AND (c.starts_at + (c.duration_min || ' minutes')::interval) > p_starts_at
    AND (
      (p_hall_id IS NOT NULL AND c.hall_id = p_hall_id)
      OR (p_trainer_id IS NOT NULL AND c.trainer_id = p_trainer_id)
    )
  LIMIT 5;
$function$;

-- ─── check_client_conflict ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_client_conflict(p_client_id uuid, p_class_id uuid)
RETURNS TABLE(conflict_class_id uuid, starts_at timestamp with time zone, ticket_type text)
LANGUAGE sql
STABLE
AS $function$
  SELECT c.id, c.starts_at, c.ticket_type
  FROM enrollments e
  JOIN classes c ON c.id = e.class_id
  JOIN classes target ON target.id = p_class_id
  WHERE e.client_id = p_client_id
    AND e.status IN ('enrolled', 'attended')
    AND c.is_cancelled = false
    AND c.id != p_class_id
    AND c.starts_at < (target.starts_at + (target.duration_min || ' minutes')::interval)
    AND (c.starts_at + (c.duration_min || ' minutes')::interval) > target.starts_at
  LIMIT 1;
$function$;

-- ─── generate_week ────────────────────────────────────────────────────────────
-- Generates classes from type='template' series for p_weeks weeks starting p_start_date.
-- Idempotent — UNIQUE index uq_classes_series_date prevents duplicates.

CREATE OR REPLACE FUNCTION public.generate_week(p_start_date date, p_weeks integer DEFAULT 1)
RETURNS TABLE(classes_created integer, enrollments_created integer)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_series record;
  v_week_offset int;
  v_week_start date;
  v_class_date date;
  v_class_id uuid;
  v_classes_created int := 0;
  v_enrollments_created int := 0;
  v_count int;
BEGIN
  FOR v_week_offset IN 0..(p_weeks - 1) LOOP
    v_week_start := p_start_date + (v_week_offset * 7);

    FOR v_series IN SELECT * FROM class_series WHERE type = 'template' LOOP
      v_class_id := NULL;
      v_class_date := v_week_start + ((v_series.day_of_week - EXTRACT(DOW FROM v_week_start)::int + 7) % 7);

      INSERT INTO classes (series_id, trainer_id, hall_id, ticket_type, title, starts_at, duration_min, capacity, notes)
      VALUES (
        v_series.id, v_series.trainer_id, v_series.hall_id,
        v_series.ticket_type, v_series.title,
        (v_class_date::text || ' ' || v_series.time_of_day::text)::timestamp AT TIME ZONE 'Europe/Kyiv',
        v_series.duration_min, v_series.capacity, v_series.notes
      )
      ON CONFLICT (series_id, (date(starts_at AT TIME ZONE 'Europe/Kyiv'::text)))
        WHERE series_id IS NOT NULL DO NOTHING
      RETURNING id INTO v_class_id;

      IF v_class_id IS NOT NULL THEN
        v_classes_created := v_classes_created + 1;

        INSERT INTO enrollments (class_id, client_id, status, sessions_used, hours_attended)
        SELECT v_class_id, sc.client_id, 'enrolled', 0, sc.hours_attended
        FROM series_clients sc WHERE sc.series_id = v_series.id
        ON CONFLICT (class_id, client_id) DO NOTHING;

        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_enrollments_created := v_enrollments_created + v_count;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_classes_created, v_enrollments_created;
END;
$function$;

-- ─── calc_trainer_salary (legacy) ─────────────────────────────────────────────
-- Kept for backwards compatibility. Use calc_trainer_salary_v2 for new code.

CREATE OR REPLACE FUNCTION public.calc_trainer_salary(
  p_trainer_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone
)
RETURNS TABLE(ticket_type text, sessions_total integer, rate numeric, amount numeric)
LANGUAGE sql
STABLE
AS $function$
  WITH attended AS (
    SELECT
      c.ticket_type,
      SUM(
        CASE
          WHEN e.status = 'attended' THEN e.sessions_used
          WHEN e.status = 'noshow'   THEN c.duration_min / 60
        END
      )::int AS sessions_total
    FROM enrollments e
    JOIN classes c ON c.id = e.class_id
    WHERE e.status IN ('attended', 'noshow')
      AND c.trainer_id = p_trainer_id
      AND c.starts_at >= p_start
      AND c.starts_at <= p_end
    GROUP BY c.ticket_type
  ),
  rates AS (
    SELECT
      a.ticket_type, a.sessions_total,
      COALESCE(
        (SELECT r.rate FROM trainer_rates r WHERE r.trainer_id = p_trainer_id AND r.ticket_type = a.ticket_type),
        (SELECT r.rate FROM trainer_rates r WHERE r.trainer_id IS NULL AND r.ticket_type = a.ticket_type)
      ) AS rate
    FROM attended a
  )
  SELECT ticket_type, sessions_total, rate, (sessions_total * COALESCE(rate, 0)) AS amount
  FROM rates;
$function$;

-- ─── auto_close_classes ───────────────────────────────────────────────────────
-- Called by pg_cron every 5 minutes. Marks attendance for classes started 5–24h ago.

CREATE OR REPLACE FUNCTION public.auto_close_classes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
  v_sessions_used integer;
BEGIN
  FOR r IN
    SELECT e.id AS enrollment_id, e.hours_attended
    FROM public.enrollments e
    JOIN public.classes c ON c.id = e.class_id
    WHERE e.status = 'enrolled'
      AND c.is_cancelled = false
      AND c.starts_at < now() - INTERVAL '5 minutes'
      AND c.starts_at > now() - INTERVAL '24 hours'
  LOOP
    v_sessions_used := COALESCE(array_length(r.hours_attended, 1), 1);
    PERFORM public.mark_attendance(r.enrollment_id, v_sessions_used);
  END LOOP;
END;
$function$;
