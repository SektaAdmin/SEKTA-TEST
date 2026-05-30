-- Add p_cash_holder parameter to create_sale and update_sale RPCs

CREATE OR REPLACE FUNCTION public.create_sale(
  p_client_id uuid,
  p_ticket_id uuid DEFAULT NULL,
  p_trainer_id uuid DEFAULT NULL,
  p_cash_holder uuid DEFAULT NULL,
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

-- ─── update_sale ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_sale(
  p_sale_id uuid,
  p_client_id uuid,
  p_ticket_id uuid,
  p_trainer_id uuid,
  p_cash_holder uuid DEFAULT NULL,
  p_ticket_name text DEFAULT NULL,
  p_ticket_price integer DEFAULT 0,
  p_sessions integer DEFAULT 0,
  p_ticket_type text DEFAULT NULL,
  p_price_paid integer DEFAULT 0,
  p_amount_given integer DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_notes text DEFAULT '',
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
