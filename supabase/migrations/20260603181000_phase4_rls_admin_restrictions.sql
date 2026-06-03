-- Фаза 4: звузити admin до матриці ROLES_PLAN (досі owner+admin були рівні = ALL).
--   (1) ЗП-таблиці (trainer_payments/trainer_rates) — owner-only (admin не бачить зарплати).
--   (2) Довідники halls/training_types/tickets — admin лише SELECT (редагує тільки owner).
-- Поточні логіни обидва = owner, тож робоча адмінка не зачеплена; обмеження
-- активуються коли заведуться реальні admin-логіни (ресепшен).

-- ===== trainer_payments: owner-only (trainer_select_own лишається) =====
drop policy if exists owner_admin_all on trainer_payments;
create policy owner_all on trainer_payments for all to authenticated
  using (auth_role() = 'owner') with check (auth_role() = 'owner');

-- ===== trainer_rates: owner-only (trainer_select_own лишається) =====
drop policy if exists owner_admin_all on trainer_rates;
create policy owner_all on trainer_rates for all to authenticated
  using (auth_role() = 'owner') with check (auth_role() = 'owner');

-- ===== halls: owner редагує; admin/trainer/client лише SELECT =====
drop policy if exists owner_admin_all on halls;
drop policy if exists trainer_client_select on halls;
create policy owner_all on halls for all to authenticated
  using (auth_role() = 'owner') with check (auth_role() = 'owner');
create policy staff_ref_select on halls for select to authenticated
  using (auth_role() in ('admin','trainer','client'));

-- ===== training_types =====
drop policy if exists owner_admin_all on training_types;
drop policy if exists trainer_client_select on training_types;
create policy owner_all on training_types for all to authenticated
  using (auth_role() = 'owner') with check (auth_role() = 'owner');
create policy staff_ref_select on training_types for select to authenticated
  using (auth_role() in ('admin','trainer','client'));

-- ===== tickets =====
drop policy if exists owner_admin_all on tickets;
drop policy if exists trainer_client_select on tickets;
create policy owner_all on tickets for all to authenticated
  using (auth_role() = 'owner') with check (auth_role() = 'owner');
create policy staff_ref_select on tickets for select to authenticated
  using (auth_role() in ('admin','trainer','client'));
