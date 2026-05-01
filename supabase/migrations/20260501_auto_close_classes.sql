-- auto_close_classes: щохвилинна задача для автоматичного закриття занять
-- Запустити в Supabase Dashboard → SQL Editor

-- 1. Функція: знаходить заняття що почались 5–60 хв тому і викликає mark_attendance
--    для всіх enrolled клієнтів. Клієнти без балансу залишаються enrolled для ручного розбору.
CREATE OR REPLACE FUNCTION public.auto_close_classes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT e.id AS enrollment_id
    FROM public.enrollments e
    JOIN public.classes c ON c.id = e.class_id
    WHERE e.status = 'enrolled'
      AND c.is_cancelled = false
      AND c.starts_at < now() - INTERVAL '5 minutes'
      AND c.starts_at > now() - INTERVAL '24 hours'
  LOOP
    -- mark_attendance повертає (success, error_message)
    -- При success=false (немає балансу) — enrollment залишається 'enrolled',
    -- адмін бачить callout і виправляє вручну
    PERFORM public.mark_attendance(r.enrollment_id, 1);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_close_classes() TO service_role;

-- 2. Cron-задача: кожні 5 хвилин
-- Потребує увімкненого pg_cron розширення (Supabase: Database → Extensions → pg_cron)
SELECT cron.schedule(
  'auto-close-classes',
  '*/5 * * * *',
  'SELECT public.auto_close_classes()'
);
