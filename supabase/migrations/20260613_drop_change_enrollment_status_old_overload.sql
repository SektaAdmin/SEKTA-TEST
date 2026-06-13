-- Видалити стару 4-параметрову версію — замінена 5-параметровою з p_staff_note DEFAULT NULL.
-- Виклики без p_staff_note продовжують працювати через DEFAULT.
DROP FUNCTION IF EXISTS public.change_enrollment_status(uuid, text, boolean, integer);
