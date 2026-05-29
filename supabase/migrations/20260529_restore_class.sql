-- Додаємо колонку для збереження статусу до скасування заняття
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS cancelled_from_status text DEFAULT NULL;

-- Оновлюємо cancel_class_and_restore_sessions: зберігаємо попередній статус
CREATE OR REPLACE FUNCTION public.cancel_class_and_restore_sessions(p_class_id uuid)
RETURNS TABLE(success boolean, restored_count int, error_message text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.enrollments
  WHERE class_id = p_class_id AND status = 'attended';

  -- Повертаємо сесії для attended
  INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
  SELECT e.client_id, c.ticket_type, e.sessions_used
  FROM public.enrollments e
  JOIN public.classes c ON c.id = e.class_id
  WHERE e.class_id = p_class_id AND e.status = 'attended'
  ON CONFLICT (client_id, ticket_type)
  DO UPDATE SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;

  -- Зберігаємо попередній статус і переводимо в cancelled (для attended і noshow)
  UPDATE public.enrollments
  SET cancelled_from_status = status,
      status = 'cancelled',
      sessions_used = 0
  WHERE class_id = p_class_id AND status IN ('attended', 'noshow', 'enrolled');

  UPDATE public.classes SET is_cancelled = true WHERE id = p_class_id;

  RETURN QUERY SELECT true, v_count, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$;

-- Нова функція restore_class: відновлює заняття і статуси клієнтів
CREATE OR REPLACE FUNCTION public.restore_class(p_class_id uuid)
RETURNS TABLE(success boolean, restored_count int, error_message text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int;
BEGIN
  -- Декрементуємо сесії тим, чий попередній статус був 'attended'
  -- (їм повернули сесії при скасуванні — тепер забираємо назад)
  INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
  SELECT e.client_id, c.ticket_type, -e.sessions_used
  FROM public.enrollments e
  JOIN public.classes c ON c.id = e.class_id
  WHERE e.class_id = p_class_id
    AND e.cancelled_from_status = 'attended'
    AND e.sessions_used > 0
  ON CONFLICT (client_id, ticket_type)
  DO UPDATE SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;

  -- Відновлюємо статуси з cancelled_from_status
  UPDATE public.enrollments
  SET status = cancelled_from_status,
      cancelled_from_status = NULL,
      updated_at = now()
  WHERE class_id = p_class_id
    AND status = 'cancelled'
    AND cancelled_from_status IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Ті хто був просто cancelled (скасований клієнтом) — залишаємо cancelled, очищаємо поле
  UPDATE public.enrollments
  SET cancelled_from_status = NULL
  WHERE class_id = p_class_id AND cancelled_from_status IS NULL AND status = 'cancelled';

  UPDATE public.classes SET is_cancelled = false, updated_at = now() WHERE id = p_class_id;

  RETURN QUERY SELECT true, v_count, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_class_and_restore_sessions(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.restore_class(uuid) TO authenticated, anon;
