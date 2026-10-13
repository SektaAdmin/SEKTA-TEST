-- Відпускні тренерів.
-- Квартал = 3 місяці від trainers.vacation_start_date (NULL = відпускні не нараховуються).
-- Відпускні = ЗП за квартал ÷ (днів у кварталі − днів відпустки в кварталі) × 7.
-- Розрахунок — клієнтський (lib/vacation.ts), тут лише дані:
--   * trainers.vacation_start_date — точка відліку кварталів;
--   * trainer_vacations — періоди відпусток (м'яке видалення is_active);
--   * trainer_payments.payment_type += 'vacation' — виплата відпускних
--     (period_start/end = квартал; у «До виплати» ЗП НЕ враховується).

alter table trainers add column vacation_start_date date;

create table trainer_vacations (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references trainers(id) on delete cascade,
  date_from   date not null,
  date_to     date not null,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint trainer_vacations_dates_check check (date_to >= date_from)
);

create index trainer_vacations_trainer_idx on trainer_vacations (trainer_id) where is_active;

alter table trainer_vacations enable row level security;

create policy "owner_all" on trainer_vacations
  for all to authenticated
  using (auth_role() = 'owner')
  with check (auth_role() = 'owner');

create policy "trainer_select_own" on trainer_vacations
  for select to authenticated
  using (auth_role() = 'trainer' and trainer_id = current_trainer_id());

grant select, insert, update, delete on trainer_vacations to anon, authenticated;

alter table trainer_payments drop constraint trainer_payments_payment_type_check;
alter table trainer_payments add constraint trainer_payments_payment_type_check
  check (payment_type = any (array['advance'::text, 'final'::text, 'vacation'::text]));
