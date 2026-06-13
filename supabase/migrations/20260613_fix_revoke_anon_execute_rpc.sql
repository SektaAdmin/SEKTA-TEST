-- Додатковий REVOKE: anon — окрема роль від PUBLIC, потребує явного відкликання
REVOKE EXECUTE ON FUNCTION public.calc_trainer_salary(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calc_trainer_salary_v2(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancellation_deadline(timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_class_conflicts(timestamptz, integer, uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_client_conflict(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_week(date, integer) FROM anon;
