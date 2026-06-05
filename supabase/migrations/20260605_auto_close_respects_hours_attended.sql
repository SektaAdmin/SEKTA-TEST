-- Fix (regression): auto_close_classes знову списує сесії за hours_attended.
--
-- Історія: фікс hours_attended додавався у 20260517_fix_auto_close_hours_attended,
-- але міграція 20260601130000_fix_db_advisors зробила DROP+CREATE функції
-- (додала search_path від advisors, перейшла на модель «почалось=проведено»
-- без вікна 24год) і ПРИ ЦЬОМУ загубила фікс — повернула хардкод
-- mark_attendance(id, 1). Як наслідок двогодинні заняття (hours_attended=[1,2])
-- списували 1 сесію замість 2.
--
-- Тут відновлюємо логіку поверх АКТУАЛЬНОЇ версії функції (RETURNS TABLE,
-- SET search_path, без вікна — starts_at <= now()), читаючи hours_attended,
-- проставлений адміном через чекбокс заздалегідь при записі.
--   hours_attended [1,2] → 2 сесії; [1] або [2] → 1; NULL (годинне) → 1.
CREATE OR REPLACE FUNCTION public.auto_close_classes()
 RETURNS TABLE(closed_count integer)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer := 0;
  v_enrollment RECORD;
BEGIN
  FOR v_enrollment IN
    SELECT e.id, e.hours_attended
    FROM enrollments e
    JOIN classes c ON e.class_id = c.id
    WHERE c.starts_at <= now()
      AND c.is_cancelled = false
      AND e.status = 'enrolled'
  LOOP
    -- Списуємо стільки сесій, скільки годин проставлено в чекбоксі заздалегідь
    -- (hours_attended: [1,2]=2 сесії, [1]/[2]=1, NULL=звичайне годинне=1).
    PERFORM mark_attendance(
      v_enrollment.id,
      COALESCE(array_length(v_enrollment.hours_attended, 1), 1)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$function$;
