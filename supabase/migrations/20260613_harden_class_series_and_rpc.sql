-- Hardening: закриваємо anon-write у class_series, ставимо гейт на
-- update_training_type_sort_orders і фіксимо search_path грошових/тригерних RPC.
-- Закриває пункти 1.1, 1.2 та частину 1.4 аудиту docs/audit-2026-06.md.

-- ── 1.1  class_series: anon-write ───────────────────────────────
-- Таблиця мала RLS OFF + повний DML-грант anon/authenticated → будь-хто
-- з публічним anon-ключем міг переписати/видалити шаблони тижня.
-- Лікування (варіант аудиту 1.1): вмикаємо RLS + owner_admin_all,
-- забираємо DML лише в anon. authenticated лишає грант, але RLS пускає
-- тільки owner/admin (staff пишуть шаблони через PostgREST як authenticated).
ALTER TABLE public.class_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_admin_all ON public.class_series;
CREATE POLICY owner_admin_all ON public.class_series
  FOR ALL
  TO authenticated
  USING (auth_role() = ANY (ARRAY['owner', 'admin']))
  WITH CHECK (auth_role() = ANY (ARRAY['owner', 'admin']));

REVOKE INSERT, UPDATE, DELETE ON public.class_series FROM anon;

-- ── 1.2  update_training_type_sort_orders: гейт + EXECUTE ───────
-- Тіло було голим UPDATE без перевірки ролі, EXECUTE у PUBLIC →
-- anon/client/trainer міг переписати sort_order довідника (DEFINER
-- оминає RLS). Додаємо owner/admin-гейт усередину + звужуємо EXECUTE.
-- (search_path у функції вже стоїть — не чіпаємо.)
CREATE OR REPLACE FUNCTION public.update_training_type_sort_orders(
  p_ids uuid[],
  p_orders integer[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'access denied: owner/admin only';
  END IF;

  FOR i IN 1 .. array_length(p_ids, 1) LOOP
    UPDATE training_types SET sort_order = p_orders[i] WHERE id = p_ids[i];
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_training_type_sort_orders(uuid[], integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_training_type_sort_orders(uuid[], integer[]) TO authenticated;

-- ── 1.4  search_path на грошових/тригерній RPC (інв. #10) ───────
-- create_sale, update_sale (гроші), check_class_capacity (тригер на
-- кожен INSERT enrollment) — без search_path = вектор ескалації.
ALTER FUNCTION public.create_sale(uuid, uuid, uuid, uuid, integer, integer, text, text, timestamptz)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.update_sale(uuid, uuid, uuid, uuid, uuid, text, integer, integer, text, integer, integer, text, text, timestamptz)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.check_class_capacity()
  SET search_path = public, pg_temp;
