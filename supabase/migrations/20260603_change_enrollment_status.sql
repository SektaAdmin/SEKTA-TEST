-- Фаза 1 аудиту: уніфікована зміна статусу enrollment з коректним балансом
-- сесій + правило скасування у часових рамках.
--
-- Проблема: frontend міняв статус прямим UPDATE enrollments SET status, що
-- обходило бухгалтерію client_session_balances (attended→noshow лишало сесію
-- списаною; повернення нічого не відновлювало). Плюс правило студії про
-- безкоштовне/штрафне скасування ніде не застосовувалось.
--
-- ── Правило скасування (дедлайн безкоштовності) ─────────────────────
--   година(starts_at) < 14  → дедлайн 19:00 попереднього календарного дня
--   година(starts_at) >= 14 → дедлайн starts_at − 6 годин
--   now() <= deadline  → вчасно, сесія НЕ списується
--   now() >  deadline  → пізно,  сесія списується (заняття «використане»)
--   noshow → завжди списується. p_force_no_charge → форс без штрафу (виняток).
--
-- ── Інваріант балансу ───────────────────────────────────────────────
--   Сесія списана рівно коли sessions_used > 0. Перехід вирівнює баланс:
--   спершу повертає поточне списане (sessions_used), потім застосовує
--   списання цільового стану. Тож будь-який перехід коректний без матриці if.

-- Дедлайн безкоштовного скасування для заняття.
CREATE OR REPLACE FUNCTION public.cancellation_deadline(p_starts_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM p_starts_at) < 14
      THEN date_trunc('day', p_starts_at) - interval '1 day' + interval '19 hours'
    ELSE p_starts_at - interval '6 hours'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.change_enrollment_status(
  p_enrollment_id   uuid,
  p_new_status      text,
  p_force_no_charge boolean DEFAULT false,
  p_sessions_used   integer DEFAULT NULL
)
RETURNS TABLE(success boolean, charged boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_enrollment public.enrollments%ROWTYPE;
  v_class      public.classes%ROWTYPE;
  v_charge     integer := 0;   -- скільки списати на новому статусі (>0 = списано)
BEGIN
  IF p_new_status NOT IN ('enrolled', 'attended', 'noshow', 'cancelled', 'waitlist') THEN
    RETURN QUERY SELECT false, false, 'Невідомий статус'::text; RETURN;
  END IF;

  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 'Запис не знайдено'::text; RETURN;
  END IF;

  IF v_enrollment.status = p_new_status THEN
    RETURN QUERY SELECT true, (v_enrollment.sessions_used > 0), NULL::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;

  -- Скільки сесій коштує це заняття для клієнта (1 або 2 для 2-год занять).
  v_charge := COALESCE(
    p_sessions_used,
    NULLIF(v_enrollment.sessions_used, 0),
    array_length(v_enrollment.hours_attended, 1),
    1
  );

  -- ── Визначити, чи списувати на цільовому статусі ───────────────────
  IF p_new_status = 'attended' THEN
    IF v_class.is_cancelled THEN
      RETURN QUERY SELECT false, false, 'Заняття скасовано'::text; RETURN;
    END IF;
    -- attended завжди списує
  ELSIF p_new_status = 'noshow' THEN
    -- noshow завжди списує (хіба що адмін форснув)
    IF p_force_no_charge THEN v_charge := 0; END IF;
  ELSIF p_new_status = 'cancelled' THEN
    IF p_force_no_charge OR now() <= public.cancellation_deadline(v_class.starts_at) THEN
      v_charge := 0;  -- вчасно або форс → без штрафу
    END IF;
    -- інакше (пізно) → лишається v_charge (штраф)
  ELSE
    -- enrolled / waitlist → ніколи не списано
    v_charge := 0;
  END IF;

  -- ── Реверс поточного списання (якщо було) ──────────────────────────
  IF v_enrollment.sessions_used > 0 THEN
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_enrollment.client_id, v_class.ticket_type, v_enrollment.sessions_used)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  -- ── Застосувати списання цільового стану ───────────────────────────
  IF v_charge > 0 THEN
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_enrollment.client_id, v_class.ticket_type, -v_charge)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance - v_charge;
  END IF;

  UPDATE public.enrollments
  SET status = p_new_status,
      sessions_used = v_charge,
      updated_at = now()
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, (v_charge > 0), NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, false, SQLERRM;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancellation_deadline(timestamptz)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_enrollment_status(uuid, text, boolean, integer)
  TO anon, authenticated;
