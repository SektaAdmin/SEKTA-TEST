-- Два пов'язані баги в update_client_balance():
-- 1. balance_transactions.balance_before / balance_after — NOT NULL без дефолта,
--    але INSERT їх не заповнював → будь-яка депозитна транзакція падала з
--    'null value in column "balance_before" ... violates not-null constraint'.
--    RPC уже тримає before (v_client.balance під FOR UPDATE) і after — лишалось записати.
-- 2. RETURN-тип має new_balance integer, але v_client.balance(int)+p_amount(numeric)=numeric
--    → на success-гілці 'structure of query does not match function result type'
--    (цей баг ховався за #1: INSERT падав раніше). Гроші — integer ₴ (інв. #6) → каст.
CREATE OR REPLACE FUNCTION public.update_client_balance(p_client_id uuid, p_amount numeric, p_transaction_type character varying, p_description text, p_related_sale_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, new_balance integer, transaction_id uuid, error_message text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
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
    client_id, amount, transaction_type, description, related_sale_id, reason,
    balance_before, balance_after, created_at
  ) VALUES (
    p_client_id, p_amount, p_transaction_type, p_description, p_related_sale_id, p_reason,
    v_client.balance, v_client.balance + p_amount, now()
  ) RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT true, (v_client.balance + p_amount)::integer, v_transaction_id, NULL::text;
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, v_client.balance, NULL::uuid, SQLERRM;
END;
$function$;
