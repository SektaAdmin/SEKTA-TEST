-- #4a (LOW): client_enroll не гейтив тип заняття (group) і вікно запису — прямий виклик RPC
--   давав запис на не-group заняття або на дату далі вікна UI (today+31д).
-- #4b (LOW): EXCEPTION WHEN OTHERS віддавав SQLERRM клієнту (витік внутрішніх помилок).
-- CREATE OR REPLACE: сигнатура та сама → EXECUTE-гранти збережено. Логіка балансу/черги/lock —
-- без змін (овербукінг #2 свідомо лишено).

CREATE OR REPLACE FUNCTION public.client_enroll(p_class_id uuid)
  RETURNS TABLE(success boolean, enrollment_id uuid, enrolled_status text, error_message text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id    uuid;
  v_class        public.classes%ROWTYPE;
  v_balance      integer;
  v_cost         integer;
  v_enroll_id    uuid;
  v_status       text;
  v_active_cnt   integer;
  v_waitlist_cnt integer;
  v_target       text;
  v_hours        integer[];
BEGIN
  IF auth_role() <> 'client' THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'Доступно лише клієнту'::text; RETURN;
  END IF;

  v_client_id := current_client_id();
  IF v_client_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'Кабінет не привʼязано до клієнта'::text; RETURN;
  END IF;

  -- Advisory lock per class: серіалізує одночасні записи на одне заняття.
  -- bigint: беремо перші 8 байт md5 щоб уникнути колізій між різними uuid.
  PERFORM pg_advisory_xact_lock(('x' || left(md5(p_class_id::text), 16))::bit(64)::bigint);

  SELECT * INTO v_class FROM public.classes WHERE id = p_class_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'Заняття не знайдено'::text; RETURN;
  END IF;
  IF v_class.is_cancelled THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'Заняття скасовано'::text; RETURN;
  END IF;
  IF v_class.starts_at <= now() THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'Заняття вже почалось'::text; RETURN;
  END IF;

  -- Самозапис кабінету — лише групові заняття (UI показує тільки їх). Прямий виклик RPC на
  -- не-group class_id відсікаємо тут.
  IF v_class.ticket_type <> 'group' THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'Доступно лише групові заняття'::text; RETURN;
  END IF;

  -- Вікно запису = вікно кабінету (today + 31 день, app/client/schedule/page.tsx).
  IF v_class.starts_at > now() + interval '31 days' THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'Поза вікном запису'::text; RETURN;
  END IF;

  -- Вартість заняття: 2-год → 2 сесії, інше → 1.
  v_cost := CASE WHEN v_class.duration_min >= 120 THEN 2 ELSE 1 END;

  -- є оплачені заняття потрібного типу? (баланс має вистачати на вартість заняття)
  SELECT sessions_balance INTO v_balance
  FROM public.client_session_balances
  WHERE client_id = v_client_id AND ticket_type = v_class.ticket_type;

  IF COALESCE(v_balance, 0) < v_cost THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'no_sessions'::text; RETURN;
  END IF;

  -- конфлікт у часі з іншим записом
  IF EXISTS (SELECT 1 FROM public.check_client_conflict(v_client_id, p_class_id)) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'conflict'::text; RETURN;
  END IF;

  -- дубль (вже записаний на це заняття активно)
  IF EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE class_id = p_class_id AND client_id = v_client_id
      AND status IN ('enrolled', 'attended', 'waitlist')
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'duplicate'::text; RETURN;
  END IF;

  -- Справедливість черги: у резерв, якщо місць немає АБО черга вже є.
  -- Після lock читаємо актуальні лічильники — гонки більше нема.
  SELECT COUNT(*) INTO v_active_cnt
  FROM public.enrollments
  WHERE class_id = p_class_id AND status IN ('enrolled', 'attended');

  SELECT COUNT(*) INTO v_waitlist_cnt
  FROM public.enrollments
  WHERE class_id = p_class_id AND status = 'waitlist';

  IF v_waitlist_cnt > 0
     OR (v_class.capacity IS NOT NULL AND v_active_cnt >= v_class.capacity) THEN
    v_target := 'waitlist';
  ELSE
    v_target := 'enrolled';
  END IF;

  -- Двогодинне заняття → hours_attended=[1,2] (auto_close спише 2 сесії)
  IF v_class.duration_min >= 120 THEN
    v_hours := ARRAY[1, 2];
  ELSE
    v_hours := NULL;
  END IF;

  -- INSERT з реанімацією: пара (class_id, client_id) має UNIQUE-індекс, тож після
  -- self-відміни на занятті лишається рядок status='cancelled'. Сліпий INSERT падав
  -- на 23505 («не вдалося записатись»). ON CONFLICT реанімує той рядок як нову чисту
  -- заявку: новий статус + скидання ВСІХ слідів попередньої відмови/проведення
  -- (sessions_used/sale_id/hours/cancellation-поля). WHERE гарантує, що активний
  -- рядок (enrolled/attended/waitlist) НЕ перетреться — туди дубль-гілка вже не пустила б,
  -- але це страховка від гонок.
  INSERT INTO public.enrollments (class_id, client_id, status, hours_attended)
  VALUES (p_class_id, v_client_id, v_target, v_hours)
  ON CONFLICT (class_id, client_id) DO UPDATE
    SET status                = EXCLUDED.status,
        hours_attended        = EXCLUDED.hours_attended,
        sessions_used         = 0,
        sale_id               = NULL,
        cancelled_at          = NULL,
        cancellation_source   = NULL,
        cancelled_from_status = NULL,
        staff_note            = NULL,
        updated_at            = now()
    WHERE public.enrollments.status IN ('cancelled', 'noshow')
  RETURNING id, status INTO v_enroll_id, v_status;

  -- Якщо RETURNING порожній → ON CONFLICT WHERE не спрацював (рядок активний).
  -- Дубль-гілка вище мала б це зловити; лишаємо як страховку.
  IF v_enroll_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'duplicate'::text; RETURN;
  END IF;

  RETURN QUERY SELECT true, v_enroll_id, v_status, NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    -- Не світимо внутрішню помилку БД клієнту; деталі — у лог.
    RAISE WARNING 'client_enroll failed for class % client %: %', p_class_id, v_client_id, SQLERRM;
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'Не вдалося записатись'::text;
END;
$function$;
