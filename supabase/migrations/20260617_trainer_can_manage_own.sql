-- Розширення can_manage_enrollment() для тренера на власних заняттях.
--
-- Проблема: гейт пропускав лише owner/admin/trusted_call/cron.
-- Тренер не міг виконувати жодних дій з enrollments/класами навіть на своїх заняттях —
-- хоча RLS (trainer_update_own / trainer_delete_own) вже дозволяє прямий DML.
-- Привілейовані SECURITY DEFINER RPC (change_enrollment_status, cancel_class_and_restore_sessions
-- тощо) оминають RLS → потрібен власний гейт.
--
-- Рішення: у кожній RPC замінити can_manage_enrollment() (без контексту) на inline-перевірку
-- що враховує trainer-власника класу.
--
-- Логіка гейту для тренера:
--   class-RPC (відомий p_class_id):   trainer де trainer_id = current_trainer_id()
--   enrollment-RPC (відомий p_enrollment_id): lookup class через enrollments
--
-- Нова допоміжна функція can_manage_class(p_class_id) для зручності class-RPC.
-- can_manage_enrollment() лишається без змін (сумісність з client_cancel/auto_close_classes).

-- ── 1. Нова helper-функція: перевірка доступу до конкретного класу ──────────
CREATE OR REPLACE FUNCTION public.can_manage_class(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    -- staff (owner/admin)
    public.auth_role() IN ('owner', 'admin')
    -- довірений внутрішній виклик (client_cancel)
    OR current_setting('app.trusted_call', true) = 'on'
    -- cron (postgres, без JWT)
    OR (
      nullif(current_setting('request.jwt.claims', true), '') IS NULL
      AND current_user NOT IN ('anon', 'authenticated')
    )
    -- тренер на своєму занятті
    OR (
      public.auth_role() = 'trainer'
      AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = p_class_id
          AND c.trainer_id = public.current_trainer_id()
      )
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_class(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_class(uuid) TO postgres;

-- ── 2. Нова helper-функція: перевірка доступу через enrollment → class ───────
CREATE OR REPLACE FUNCTION public.can_manage_class_enrollment(p_enrollment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    public.auth_role() IN ('owner', 'admin')
    OR current_setting('app.trusted_call', true) = 'on'
    OR (
      nullif(current_setting('request.jwt.claims', true), '') IS NULL
      AND current_user NOT IN ('anon', 'authenticated')
    )
    OR (
      public.auth_role() = 'trainer'
      AND EXISTS (
        SELECT 1 FROM public.enrollments e
        JOIN public.classes c ON c.id = e.class_id
        WHERE e.id = p_enrollment_id
          AND c.trainer_id = public.current_trainer_id()
      )
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_class_enrollment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_class_enrollment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_class_enrollment(uuid) TO postgres;

-- ── 3. Оновити RPC: замінити гейт на контекстний ────────────────────────────
--
-- 3a. change_enrollment_status → can_manage_class_enrollment
CREATE OR REPLACE FUNCTION public.change_enrollment_status(
  p_enrollment_id uuid,
  p_new_status    text,
  p_force_no_charge boolean DEFAULT false,
  p_sessions_used   integer DEFAULT NULL,
  p_staff_note      text    DEFAULT NULL
)
RETURNS TABLE(success boolean, charged boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enrollment public.enrollments%ROWTYPE;
  v_class      public.classes%ROWTYPE;
  v_charge     integer := 0;
  v_source     text;
  v_cancelled_at timestamptz;
BEGIN
  IF NOT public.can_manage_class_enrollment(p_enrollment_id) THEN
    RETURN QUERY SELECT false, false, 'Доступно лише персоналу або тренеру цього заняття'::text; RETURN;
  END IF;

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

  v_charge := COALESCE(
    p_sessions_used,
    NULLIF(v_enrollment.sessions_used, 0),
    array_length(v_enrollment.hours_attended, 1),
    1
  );

  IF p_new_status = 'attended' THEN
    IF v_class.is_cancelled THEN
      RETURN QUERY SELECT false, false, 'Заняття скасовано'::text; RETURN;
    END IF;
  ELSIF p_new_status = 'noshow' THEN
    IF p_force_no_charge THEN v_charge := 0; END IF;
  ELSIF p_new_status = 'cancelled' THEN
    IF p_force_no_charge OR now() <= public.cancellation_deadline(v_class.starts_at) THEN
      v_charge := 0;
    END IF;
  ELSE
    v_charge := 0;
  END IF;

  IF v_enrollment.sessions_used > 0 THEN
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_enrollment.client_id, v_class.ticket_type, v_enrollment.sessions_used)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  IF v_charge > 0 THEN
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_enrollment.client_id, v_class.ticket_type, -v_charge)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance - v_charge;
  END IF;

  -- Джерело скасування + timestamp
  IF p_new_status = 'cancelled' THEN
    v_source       := 'staff_manual';
    v_cancelled_at := now();
  ELSE
    v_source       := NULL;
    v_cancelled_at := NULL;
  END IF;

  UPDATE public.enrollments
  SET
    status             = p_new_status,
    sessions_used      = v_charge,
    cancellation_source = CASE WHEN p_new_status = 'cancelled' THEN v_source ELSE cancellation_source END,
    cancelled_at       = CASE WHEN p_new_status = 'cancelled' THEN v_cancelled_at ELSE NULL END,
    staff_note         = CASE WHEN p_force_no_charge AND p_staff_note IS NOT NULL THEN p_staff_note ELSE staff_note END,
    updated_at         = now()
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, (v_charge > 0), NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, false, SQLERRM;
END;
$$;

-- 3b. reverse_attendance → can_manage_class_enrollment
CREATE OR REPLACE FUNCTION public.reverse_attendance(p_enrollment_id uuid)
RETURNS TABLE(success boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_enrollment public.enrollments%ROWTYPE;
  v_class      public.classes%ROWTYPE;
BEGIN
  IF NOT public.can_manage_class_enrollment(p_enrollment_id) THEN
    RETURN QUERY SELECT false, 'Доступно лише персоналу або тренеру цього заняття'::text; RETURN;
  END IF;

  SELECT * INTO v_enrollment FROM public.enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Запис не знайдено'::text; RETURN;
  END IF;
  IF v_enrollment.status <> 'attended' THEN
    RETURN QUERY SELECT false, 'Відвідування не зафіксовано'::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;

  INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
  VALUES (v_enrollment.client_id, v_class.ticket_type, v_enrollment.sessions_used)
  ON CONFLICT (client_id, ticket_type)
  DO UPDATE SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;

  UPDATE public.enrollments
  SET status = 'cancelled', sessions_used = 0,
      cancellation_source = 'staff_manual', cancelled_at = now(),
      updated_at = now()
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM;
END;
$$;

-- 3c. delete_enrollment → can_manage_class_enrollment
CREATE OR REPLACE FUNCTION public.delete_enrollment(p_enrollment_id uuid)
RETURNS TABLE(success boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_enrollment public.enrollments%ROWTYPE;
  v_class      public.classes%ROWTYPE;
BEGIN
  IF NOT public.can_manage_class_enrollment(p_enrollment_id) THEN
    RETURN QUERY SELECT false, 'Доступно лише персоналу або тренеру цього заняття'::text; RETURN;
  END IF;

  SELECT * INTO v_enrollment FROM public.enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Запис не знайдено'::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;

  IF v_enrollment.sessions_used > 0 THEN
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_enrollment.client_id, v_class.ticket_type, v_enrollment.sessions_used)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  DELETE FROM public.enrollments WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM;
END;
$$;

-- 3d. cancel_class_and_restore_sessions → can_manage_class
CREATE OR REPLACE FUNCTION public.cancel_class_and_restore_sessions(p_class_id uuid)
RETURNS TABLE(success boolean, restored_count integer, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT public.can_manage_class(p_class_id) THEN
    RETURN QUERY SELECT false, 0, 'Доступно лише персоналу або тренеру цього заняття'::text; RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.enrollments
  WHERE class_id = p_class_id AND status IN ('attended', 'noshow') AND sessions_used > 0;

  INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
  SELECT e.client_id, c.ticket_type, e.sessions_used
  FROM public.enrollments e
  JOIN public.classes c ON c.id = e.class_id
  WHERE e.class_id = p_class_id AND e.status IN ('attended', 'noshow') AND e.sessions_used > 0
  ON CONFLICT (client_id, ticket_type)
  DO UPDATE SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;

  UPDATE public.enrollments
  SET cancelled_from_status  = status,
      status                 = 'cancelled',
      sessions_used          = 0,
      cancellation_source    = 'class_cancelled',
      cancelled_at           = now(),
      updated_at             = now()
  WHERE class_id = p_class_id AND status IN ('attended', 'noshow', 'enrolled');

  UPDATE public.classes SET is_cancelled = true, updated_at = now() WHERE id = p_class_id;

  RETURN QUERY SELECT true, v_count, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$;

-- 3e. restore_class → can_manage_class
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
  IF NOT public.can_manage_class(p_class_id) THEN
    RETURN QUERY SELECT false, 0, 'Доступно лише персоналу або тренеру цього заняття'::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = p_class_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Заняття не знайдено'::text; RETURN;
  END IF;
  IF NOT v_class.is_cancelled THEN
    RETURN QUERY SELECT false, 0, 'Заняття не скасовано'::text; RETURN;
  END IF;

  FOR r IN
    SELECT
      e.client_id,
      e.cancelled_from_status,
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
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (r.client_id, v_class.ticket_type, -r.cost)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;

    v_restored := v_restored + 1;
  END LOOP;

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
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$;

-- 3f. delete_class → can_manage_class
CREATE OR REPLACE FUNCTION public.delete_class(p_class_id uuid)
RETURNS TABLE(success boolean, restored_count integer, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_class    public.classes%ROWTYPE;
  v_restored integer := 0;
  r          record;
BEGIN
  IF NOT public.can_manage_class(p_class_id) THEN
    RETURN QUERY SELECT false, 0, 'Доступно лише персоналу або тренеру цього заняття'::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = p_class_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Заняття не знайдено'::text; RETURN;
  END IF;

  FOR r IN
    SELECT client_id, SUM(sessions_used) AS total
    FROM public.enrollments
    WHERE class_id = p_class_id AND sessions_used > 0
    GROUP BY client_id
  LOOP
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (r.client_id, v_class.ticket_type, r.total)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
    v_restored := v_restored + 1;
  END LOOP;

  DELETE FROM public.classes WHERE id = p_class_id;

  RETURN QUERY SELECT true, v_restored, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$;

-- ── 4. Гранти на оновлені RPC (лишаються ті самі) ───────────────────────────
-- change_enrollment_status, reverse_attendance, delete_enrollment:
REVOKE ALL ON FUNCTION public.change_enrollment_status(uuid,text,boolean,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_enrollment_status(uuid,text,boolean,integer,text) TO authenticated;

REVOKE ALL ON FUNCTION public.reverse_attendance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_attendance(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_enrollment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_enrollment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_enrollment(uuid) TO postgres;

-- cancel_class_and_restore_sessions, restore_class, delete_class:
REVOKE ALL ON FUNCTION public.cancel_class_and_restore_sessions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_class_and_restore_sessions(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.restore_class(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_class(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_class(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_class(uuid) TO postgres;
