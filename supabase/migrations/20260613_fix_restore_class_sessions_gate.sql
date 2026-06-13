-- Fix #7: restore_class — NULL краш, брехливий restored_count, відсутній гейт,
-- відсутній реверс балансу сесій.
--
-- cancel_class_and_restore_sessions: повертає sessions_used у баланс → sessions_used=0
--   + зберігає cancelled_from_status.
-- restore_class (цей фікс): списує сесії назад із балансу, відновлює
--   sessions_used і статус з cancelled_from_status.

CREATE OR REPLACE FUNCTION public.restore_class(p_class_id uuid)
RETURNS TABLE(success boolean, restored_count integer, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class     public.classes%ROWTYPE;
  v_restored  integer := 0;
  r           RECORD;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, 0, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = p_class_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Заняття не знайдено'::text; RETURN;
  END IF;
  IF NOT v_class.is_cancelled THEN
    RETURN QUERY SELECT false, 0, 'Заняття не скасовано'::text; RETURN;
  END IF;

  -- Списати сесії назад для тих, кому вони були повернуті при скасуванні
  -- (attended/noshow з cancelled_from_status — саме їх cancel_class повернув).
  FOR r IN
    SELECT
      e.client_id,
      e.cancelled_from_status,
      -- відновлюємо sessions_used: для 2-год — array_length, інакше 1
      CASE
        WHEN v_class.duration_min >= 120 AND e.hours_attended IS NOT NULL
          THEN COALESCE(array_length(e.hours_attended, 1), 1)
        ELSE 1
      END AS cost
    FROM public.enrollments e
    WHERE e.class_id = p_class_id
      AND e.status = 'cancelled'
      AND e.cancellation_source = 'class_cancelled'
      AND e.cancelled_from_status IN ('attended', 'noshow')
  LOOP
    -- Списати сесії назад із балансу (реверс повернення)
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (r.client_id, v_class.ticket_type, -r.cost)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;

    v_restored := v_restored + 1;
  END LOOP;

  -- Відновити статус, sessions_used, прибрати cancellation-поля
  UPDATE public.enrollments
  SET
    status               = cancelled_from_status,
    sessions_used        = CASE
      WHEN cancelled_from_status IN ('attended', 'noshow') THEN
        CASE
          WHEN v_class.duration_min >= 120 AND hours_attended IS NOT NULL
            THEN COALESCE(array_length(hours_attended, 1), 1)
          ELSE 1
        END
      ELSE 0
    END,
    cancelled_from_status  = NULL,
    cancellation_source    = NULL,
    cancelled_at           = NULL,
    updated_at             = now()
  WHERE class_id = p_class_id
    AND status = 'cancelled'
    AND cancellation_source = 'class_cancelled';

  UPDATE public.classes SET is_cancelled = false, updated_at = now() WHERE id = p_class_id;

  RETURN QUERY SELECT true, v_restored, NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$;
