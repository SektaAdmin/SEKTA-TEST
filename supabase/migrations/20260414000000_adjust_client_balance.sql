-- Atomic client balance adjustment.
-- Using a stored procedure avoids the read-modify-write race condition
-- that occurs when the client reads balance, adds delta, and writes back
-- as two separate round-trips.
CREATE OR REPLACE FUNCTION adjust_client_balance(p_client_id uuid, p_delta integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE clients
  SET balance = COALESCE(balance, 0) + p_delta
  WHERE id = p_client_id;
$$;
