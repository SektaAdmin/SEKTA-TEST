-- Фаза 3: Drop old RPC overloads without p_cash_holder
-- Код везде передає p_cash_holder, нові версії резолвяться.
-- Стара версія може спричинити амбігвність при вставці.

DROP FUNCTION IF EXISTS public.create_sale(
  p_client_id uuid,
  p_ticket_id uuid,
  p_trainer_id uuid,
  p_price_paid integer,
  p_amount_given integer,
  p_payment_method text,
  p_notes text,
  p_created_at timestamp with time zone
);

DROP FUNCTION IF EXISTS public.update_sale(
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
  p_created_at timestamp with time zone
);
