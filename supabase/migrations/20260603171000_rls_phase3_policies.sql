-- Фаза 3 (ROLES_PLAN.md): переписати RLS з єдиної authenticated_all USING(true)
-- на доступ за роллю через auth_role(). Модель:
--   owner+admin = повний доступ (ALL) — обмеження admin відкладено на Фазу 4;
--   trainer/client — вузькі політики (read чужого закрито, write лише своє).
-- Доменний id у політиках — через current_client_id()/current_trainer_id().

-- ===== clients =====
drop policy if exists authenticated_all on clients;
create policy owner_admin_all on clients for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
-- тренер бачить усіх клієнтів (контакти фізично в окремій таблиці client_contacts)
create policy trainer_select on clients for select to authenticated
  using (auth_role() = 'trainer');
-- клієнт бачить лише свою картку
create policy client_select_own on clients for select to authenticated
  using (id = current_client_id());

-- ===== client_contacts (owner_admin_all вже з Фази 2; додаємо клієнтський self-read) =====
create policy client_select_own on client_contacts for select to authenticated
  using (client_id = current_client_id());

-- ===== sales =====
drop policy if exists authenticated_all on sales;
create policy owner_admin_all on sales for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
create policy client_select_own on sales for select to authenticated
  using (client_id = current_client_id());

-- ===== balance_transactions =====
drop policy if exists authenticated_all on balance_transactions;
create policy owner_admin_all on balance_transactions for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
create policy client_select_own on balance_transactions for select to authenticated
  using (client_id = current_client_id());

-- ===== client_session_balances =====
drop policy if exists authenticated_all on client_session_balances;
create policy owner_admin_all on client_session_balances for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
create policy trainer_select on client_session_balances for select to authenticated
  using (auth_role() = 'trainer');
create policy client_select_own on client_session_balances for select to authenticated
  using (client_id = current_client_id());

-- ===== classes =====
drop policy if exists authenticated_all on classes;
create policy owner_admin_all on classes for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
create policy trainer_select on classes for select to authenticated
  using (auth_role() = 'trainer');
-- тренер CRUD лише своїх занять
create policy trainer_insert_own on classes for insert to authenticated
  with check (auth_role() = 'trainer' and trainer_id = current_trainer_id());
create policy trainer_update_own on classes for update to authenticated
  using (auth_role() = 'trainer' and trainer_id = current_trainer_id())
  with check (auth_role() = 'trainer' and trainer_id = current_trainer_id());
create policy trainer_delete_own on classes for delete to authenticated
  using (auth_role() = 'trainer' and trainer_id = current_trainer_id());
-- клієнт бачить розклад (для запису)
create policy client_select on classes for select to authenticated
  using (auth_role() = 'client');

-- ===== enrollments =====
drop policy if exists authenticated_all on enrollments;
create policy owner_admin_all on enrollments for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
create policy trainer_select on enrollments for select to authenticated
  using (auth_role() = 'trainer');
-- тренер пише/редагує/видаляє записи лише на СВОЇ заняття
create policy trainer_insert_own on enrollments for insert to authenticated
  with check (
    auth_role() = 'trainer'
    and exists (select 1 from classes c
                where c.id = class_id and c.trainer_id = current_trainer_id())
  );
create policy trainer_update_own on enrollments for update to authenticated
  using (
    auth_role() = 'trainer'
    and exists (select 1 from classes c
                where c.id = class_id and c.trainer_id = current_trainer_id())
  )
  with check (
    auth_role() = 'trainer'
    and exists (select 1 from classes c
                where c.id = class_id and c.trainer_id = current_trainer_id())
  );
create policy trainer_delete_own on enrollments for delete to authenticated
  using (
    auth_role() = 'trainer'
    and exists (select 1 from classes c
                where c.id = class_id and c.trainer_id = current_trainer_id())
  );
-- клієнт бачить лише свої записи (запис/відміна — через RPC у Фазі 4)
create policy client_select_own on enrollments for select to authenticated
  using (client_id = current_client_id());

-- ===== series_clients (шаблони серій — суто адмінське) =====
drop policy if exists authenticated_all on series_clients;
create policy owner_admin_all on series_clients for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
-- тренер бачить склад серій (read-only)
create policy trainer_select on series_clients for select to authenticated
  using (auth_role() = 'trainer');

-- ===== trainer_payments =====
drop policy if exists authenticated_all on trainer_payments;
create policy owner_admin_all on trainer_payments for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
create policy trainer_select_own on trainer_payments for select to authenticated
  using (auth_role() = 'trainer' and trainer_id = current_trainer_id());

-- ===== trainer_rates =====
drop policy if exists authenticated_all on trainer_rates;
create policy owner_admin_all on trainer_rates for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
-- тренер бачить свою ставку + глобальну (trainer_id is null)
create policy trainer_select_own on trainer_rates for select to authenticated
  using (auth_role() = 'trainer'
         and (trainer_id = current_trainer_id() or trainer_id is null));

-- ===== halls (довідник — ціни/зали бачать усі залогінені) =====
drop policy if exists authenticated_all on halls;
create policy owner_admin_all on halls for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
create policy trainer_client_select on halls for select to authenticated
  using (auth_role() in ('trainer','client'));

-- ===== training_types =====
drop policy if exists authenticated_all on training_types;
create policy owner_admin_all on training_types for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
create policy trainer_client_select on training_types for select to authenticated
  using (auth_role() in ('trainer','client'));

-- ===== tickets (ціни тарифів) =====
drop policy if exists authenticated_all on tickets;
create policy owner_admin_all on tickets for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
create policy trainer_client_select on tickets for select to authenticated
  using (auth_role() in ('trainer','client'));

-- ===== studio_expenses (лише owner/admin) =====
drop policy if exists authenticated_all on studio_expenses;
create policy owner_admin_all on studio_expenses for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));

-- ===== trainers (імена видно в розкладі всім залогіненим) =====
drop policy if exists authenticated_all on trainers;
create policy owner_admin_all on trainers for all to authenticated
  using (auth_role() in ('owner','admin'))
  with check (auth_role() in ('owner','admin'));
create policy trainer_client_select on trainers for select to authenticated
  using (auth_role() in ('trainer','client'));
