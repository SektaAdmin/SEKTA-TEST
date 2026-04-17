-- Drop the ambiguous numeric overload, keep only the integer version.
-- The error "Could not choose the best candidate function" occurs because
-- both signatures exist simultaneously and PostgREST cannot resolve the call.
DROP FUNCTION IF EXISTS public.adjust_client_balance(uuid, numeric);

-- Ensure the correct integer version exists.
CREATE OR REPLACE FUNCTION public.adjust_client_balance(p_client_id uuid, p_delta integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE clients
  SET balance = COALESCE(balance, 0) + p_delta
  WHERE id = p_client_id;
$$;
