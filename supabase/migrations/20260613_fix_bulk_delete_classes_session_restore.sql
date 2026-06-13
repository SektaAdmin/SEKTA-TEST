-- Fix #3: bulk DELETE classes знищував enrollments без повернення сесій
-- deleteClassesInRange → сирий PostgREST DELETE → CASCADE enrollments → 0 повернень
--
-- Рішення: BEFORE DELETE тригер на classes що повертає sessions_used
-- перед CASCADE. Тепер будь-який DELETE (одиночний/bulk/RPC) автоматично
-- повертає сесії. delete_class RPC більше не робить це вручну — прибираємо
-- щоб уникнути подвійного повернення.

-- 1. Тригерна функція
CREATE OR REPLACE FUNCTION public.restore_sessions_before_class_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Повернути sessions_used > 0 по клієнтах (агрегат)
  INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
  SELECT
    e.client_id,
    OLD.ticket_type,
    SUM(e.sessions_used)
  FROM public.enrollments e
  WHERE e.class_id = OLD.id
    AND e.sessions_used > 0
  GROUP BY e.client_id
  ON CONFLICT (client_id, ticket_type)
  DO UPDATE SET sessions_balance =
    public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;

  RETURN OLD;
END;
$$;

-- 2. Тригер BEFORE DELETE FOR EACH ROW
CREATE TRIGGER restore_sessions_on_class_delete
BEFORE DELETE ON public.classes
FOR EACH ROW
EXECUTE FUNCTION public.restore_sessions_before_class_delete();

-- 3. Переписати delete_class: прибрати ручний реверс (тепер через тригер),
--    лишити гейт + FOR UPDATE + підрахунок restored_count
CREATE OR REPLACE FUNCTION public.delete_class(p_class_id uuid)
RETURNS TABLE(success boolean, restored_count integer, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class    public.classes%ROWTYPE;
  v_restored integer := 0;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, 0, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  SELECT * INTO v_class
  FROM public.classes
  WHERE id = p_class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Заняття не знайдено'::text; RETURN;
  END IF;

  -- Підраховуємо скільки клієнтів отримають повернення (тригер зробить саме повернення)
  SELECT COUNT(DISTINCT client_id) INTO v_restored
  FROM public.enrollments
  WHERE class_id = p_class_id AND sessions_used > 0;

  -- Тригер restore_sessions_on_class_delete спрацює перед видаленням
  DELETE FROM public.classes WHERE id = p_class_id;

  RETURN QUERY SELECT true, v_restored, NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$;
