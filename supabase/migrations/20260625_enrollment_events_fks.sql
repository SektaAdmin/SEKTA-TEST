-- FK для PostgREST-embed на сторінці /audit: client_id→clients, class_id→classes.
-- ON DELETE SET NULL — delete_class/clients не блокуються; аудит-рядок лишається,
-- лише втрачає посилання (показуємо «—»). owner_trainer_id/actor_trainer_id
-- резолвимо через RefsContext (тренери вже в кеші), тож FK на них не потрібні.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'enrollment_events_class_id_fkey') then
    alter table public.enrollment_events
      add constraint enrollment_events_class_id_fkey
      foreign key (class_id) references public.classes(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'enrollment_events_client_id_fkey') then
    alter table public.enrollment_events
      add constraint enrollment_events_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete set null;
  end if;
end $$;
