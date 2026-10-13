-- #1 (HIGH): витік чутливих колонок trainers будь-якому клієнту/тренеру.
-- Політика trainers.trainer_client_select дозволяє client/trainer SELECT усіх рядків,
-- а RLS не фільтрує колонки → клієнт читав phone/email/telegram_chat_id/telegram_link_token
-- усіх тренерів і міг перехопити Telegram тренера (/start <token>).
--
-- Усі залогінені мають один DB-роль authenticated (роль застосунку — в JWT), тож колонковий
-- GRANT не відрізнить owner від client. Ховаємо чутливі колонки табличним бар'єром
-- (REVOKE table-SELECT → GRANT SELECT лише на безпечні колонки), а кому вони потрібні —
-- через gated SECURITY DEFINER RPC: тренеру свій рядок (get_my_trainer), персоналу — контакти
-- всіх (list_trainers_admin). Embed'и trainers(name) по всьому коду не ламаються (name лишається).

-- 1) anon не має читати тренерів узагалі (RLS його й так блокує; прибираємо грант для чистоти).
REVOKE SELECT ON public.trainers FROM anon;

-- 2) Колонковий бар'єр для authenticated: лише безпечні колонки.
REVOKE SELECT ON public.trainers FROM authenticated;
GRANT SELECT (id, name, is_active, instagram_username, telegram_username, user_id, vacation_start_date)
  ON public.trainers TO authenticated;

-- 3) Кабінет тренера: власна картка з telegram-полями (гейт = власний рядок user_id = auth.uid()).
CREATE OR REPLACE FUNCTION public.get_my_trainer()
  RETURNS TABLE(id uuid, name text, telegram_chat_id bigint, telegram_link_token uuid)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT t.id, t.name, t.telegram_chat_id, t.telegram_link_token
  FROM public.trainers t
  WHERE t.user_id = auth.uid()
  LIMIT 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_my_trainer() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_trainer() TO authenticated;

-- 4) Контакти тренерів для сторінки персоналу (гейт owner/admin).
CREATE OR REPLACE FUNCTION public.list_trainers_admin()
  RETURNS TABLE(
    id uuid, name text, is_active boolean,
    instagram_username text, telegram_username text,
    phone text, email text, user_id uuid
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT t.id, t.name, t.is_active,
           t.instagram_username, t.telegram_username,
           t.phone, t.email, t.user_id
    FROM public.trainers t
    ORDER BY t.name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_trainers_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_trainers_admin() TO authenticated;
