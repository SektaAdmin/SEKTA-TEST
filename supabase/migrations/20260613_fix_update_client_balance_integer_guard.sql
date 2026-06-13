-- Fix #5: update_client_balance приймає numeric — дробове мовчки округлювалось
-- при записі в clients.balance (integer), але зберігалось точно в
-- balance_transactions.amount (numeric) → розбіжність між логом і балансом.
-- Гроші — цілі гривні (інваріант #6).

CREATE OR REPLACE FUNCTION public.update_client_balance(
  p_client_id       uuid,
  p_amount          numeric,
  p_transaction_type varchar,
  p_description     text,
  p_related_sale_id uuid DEFAULT NULL,
  p_reason          text DEFAULT NULL
)
RETURNS TABLE(success boolean, new_balance integer, transaction_id uuid, error_message text)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client         RECORD;
  v_transaction_id uuid;
BEGIN
  -- Гроші — цілі гривні; дробове = помилка виклику (інваріант #6)
  IF p_amount <> floor(p_amount) THEN
    RETURN QUERY SELECT false, 0, NULL::uuid,
      'Сума повинна бути цілим числом гривень'::text;
    RETURN;
  END IF;

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
$$;

-- Fix #8: DROP calc_trainer_salary v1 — мертва (0 викликів у коді)
DROP FUNCTION IF EXISTS public.calc_trainer_salary(uuid, timestamptz, timestamptz);
