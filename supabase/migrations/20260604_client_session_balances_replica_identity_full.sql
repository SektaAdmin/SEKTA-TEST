-- Realtime RLS-фільтрація по client_id вимагає старих значень рядка при UPDATE/DELETE.
-- При REPLICA IDENTITY DEFAULT у WAL лише PK → політика client_select_own
-- (client_id = current_client_id()) не може звіритись зі старою версією рядка,
-- тож UPDATE-події (списання/повернення сесій) не доходять до кабінету клієнта.
-- FULL кладе у WAL увесь старий рядок → realtime у /client підхоплює зміни балансу занять.
ALTER TABLE public.client_session_balances REPLICA IDENTITY FULL;
