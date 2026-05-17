-- Fix: auto_close_classes now respects hours_attended for 2-hour classes.
-- Previously always passed sessions_used=1, ignoring hours_attended=[1,2].
CREATE OR REPLACE FUNCTION public.auto_close_classes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
  v_sessions_used integer;
BEGIN
  FOR r IN
    SELECT e.id AS enrollment_id, e.hours_attended
    FROM public.enrollments e
    JOIN public.classes c ON c.id = e.class_id
    WHERE e.status = 'enrolled'
      AND c.is_cancelled = false
      AND c.starts_at < now() - INTERVAL '5 minutes'
      AND c.starts_at > now() - INTERVAL '24 hours'
  LOOP
    v_sessions_used := COALESCE(array_length(r.hours_attended, 1), 1);
    PERFORM public.mark_attendance(r.enrollment_id, v_sessions_used);
  END LOOP;
END;
$function$
