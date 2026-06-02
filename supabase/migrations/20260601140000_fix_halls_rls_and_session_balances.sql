-- Виправлення регресії з 20260601130000_fix_db_advisors.sql.
--
-- Та міграція дропнула ОБИДВІ політики на halls (рядки 127-128:
-- "Allow all for authenticated" + "authenticated_all"), але — на відміну
-- від усіх інших таблиць — НЕ перестворила authenticated_all.
-- Результат: halls лишився RLS-on з НУЛЕМ політик = deny-all для всіх,
-- окрім service_role. Браузер (authenticated) отримував 0 залів →
-- порожнє розклад/шаблони (всі в'юхи джоїнять halls(name)).
--
-- Заодно вирівнюємо client_session_balances: інваріант #9 і CLAUDE.md
-- вимагають RLS-on, а фактично RLS був вимкнений (дірка — anon міг читати
-- залишки сесій). Вмикаємо + authenticated_all, як у решти доменних таблиць.

-- 1. halls — повернути забуту політику
CREATE POLICY "authenticated_all" ON public.halls
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. client_session_balances — увімкнути RLS згідно з інваріантом #9
ALTER TABLE public.client_session_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON public.client_session_balances;
CREATE POLICY "authenticated_all" ON public.client_session_balances
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_session_balances TO anon, authenticated;
