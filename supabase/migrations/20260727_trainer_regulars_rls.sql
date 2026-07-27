-- Екран /trainer/regulars: тренеру потрібен SELECT на власні class_series
-- (тижневі шаблони) + series_clients лише для власних серій.
--
-- class_series раніше не мав жодної trainer-політики (лише owner_admin_all).
-- series_clients.trainer_select існував, але без фільтра власності — будь-
-- який trainer міг SELECT-ити series_clients чужих серій. Звужуємо разом.

create policy "trainer_select_own" on class_series
  for select to authenticated
  using (auth_role() = 'trainer' and trainer_id = current_trainer_id());

drop policy "trainer_select" on series_clients;

create policy "trainer_select_own" on series_clients
  for select to authenticated
  using (
    auth_role() = 'trainer'
    and series_id in (select id from class_series where trainer_id = current_trainer_id())
  );
