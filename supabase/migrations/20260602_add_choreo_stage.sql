-- Етап вивчення хореографії на конкретному занятті.
-- Окреме поле, НЕ змішувати з classes.notes (загальні нотатки до заняття).
-- Запис на кожне заняття; generate_week не переносить — нові заняття з порожнім полем.
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS choreo_stage text;

COMMENT ON COLUMN public.classes.choreo_stage IS
  'Етап вивчення хореографії на цьому занятті (вільний текст). Вписує тренер/адмін.';
