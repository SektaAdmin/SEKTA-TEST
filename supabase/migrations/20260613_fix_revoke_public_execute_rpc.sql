-- Fix #9: REVOKE EXECUTE FROM PUBLIC на всіх RPC що не повинні бути публічними
-- PUBLIC = будь-яка роль включно з anon (без JWT) — вектор: anon-ключ читає/змінює дані

-- Грошові мутації
REVOKE EXECUTE ON FUNCTION public.create_sale(uuid, uuid, uuid, uuid, integer, integer, text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_sale(uuid, uuid, uuid, uuid, uuid, text, integer, integer, text, integer, integer, text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_sale(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_client_balance(uuid, numeric, varchar, text, uuid, text) FROM PUBLIC;

-- Розклад / серії
REVOKE EXECUTE ON FUNCTION public.generate_week(date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_class(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_close_classes() FROM PUBLIC;

-- Звіти (дані клієнтів)
REVOKE EXECUTE ON FUNCTION public.calc_trainer_salary_v2(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calc_trainer_salary(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_session_debtors_for_date(date) FROM PUBLIC;

-- Перевірки (повертають дані про заняття/клієнтів)
REVOKE EXECUTE ON FUNCTION public.check_class_conflicts(timestamptz, integer, uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_client_conflict(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancellation_deadline(timestamptz) FROM PUBLIC;

-- Утиліта (нешкідлива, але anon не потрібен)
REVOKE EXECUTE ON FUNCTION public.normalize_phone_ua(text) FROM PUBLIC;

-- Явні гранти для тих хто реально викликає
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, uuid, uuid, uuid, integer, integer, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_sale(uuid, uuid, uuid, uuid, uuid, text, integer, integer, text, integer, integer, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sale(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_balance(uuid, numeric, varchar, text, uuid, text) TO authenticated, postgres;

GRANT EXECUTE ON FUNCTION public.generate_week(date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_close_classes() TO postgres;

GRANT EXECUTE ON FUNCTION public.calc_trainer_salary_v2(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_debtors_for_date(date) TO authenticated;

GRANT EXECUTE ON FUNCTION public.check_class_conflicts(timestamptz, integer, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_client_conflict(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancellation_deadline(timestamptz) TO authenticated;

GRANT EXECUTE ON FUNCTION public.normalize_phone_ua(text) TO authenticated, postgres;

-- calc_trainer_salary v1 — мертва (0 викликів у коді), але залишаємо без гранту anon
-- (DROP окремим кроком після підтвердження)
