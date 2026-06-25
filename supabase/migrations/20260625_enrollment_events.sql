-- enrollment_events: append-only лог змін enrollment + аутбокс нотифікацій.
--
-- Одна таблиця грає дві ролі:
--   • Аудит — хто (owner/admin/trainer/client/system) що зробив із записом.
--   • Черга — рядки notify=true and delivered=false шле dispatch-cron у Telegram.
--
-- Подію ловимо AFTER-тригером на enrollments → покриває ВСІ шляхи одразу
-- (client_enroll / client_cancel / change_enrollment_status / прямий INSERT
-- через enrollClient).
--
-- Ключове правило нотифікації: мовчить ТІЛЬКИ тренер-власник, коли діє у себе.
-- Клієнт / адмін / інший тренер / самозапис → нотифікувати власника.

-- ── 1. Таблиця ──────────────────────────────────────────────────────────────
create table if not exists public.enrollment_events (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  event_type        text not null,        -- enrolled/cancelled/attended/noshow/waitlisted/status_changed
  enrollment_id     uuid references public.enrollments(id) on delete set null,
  class_id          uuid,                 -- снапшот (enrollment може зникнути)
  client_id         uuid,                 -- снапшот
  owner_trainer_id  uuid,                 -- снапшот тренера-власника заняття
  old_status        text,
  new_status        text,
  actor_role        text not null,        -- owner/admin/trainer/client/system
  actor_user_id     uuid,
  actor_trainer_id  uuid,
  actor_client_id   uuid,
  is_self_owner     boolean not null default false,
  notify            boolean not null default false,
  telegram_chat_id  bigint,               -- снапшот chat_id власника на момент події
  message_text      text,
  delivered         boolean not null default false,
  delivered_at      timestamptz,
  delivery_attempts integer not null default 0,
  last_error        text
);

-- гаряча черга dispatch
create index if not exists idx_enrollment_events_queue
  on public.enrollment_events(created_at)
  where notify and not delivered;
-- лог (стрічка адмінки)
create index if not exists idx_enrollment_events_created
  on public.enrollment_events(created_at desc);
create index if not exists idx_enrollment_events_class
  on public.enrollment_events(class_id);
create index if not exists idx_enrollment_events_client
  on public.enrollment_events(client_id);

-- RLS: читають лише owner/admin. Пише виключно SECURITY DEFINER тригер;
-- delivered оновлює dispatcher (postgres, обходить RLS як власник таблиці).
alter table public.enrollment_events enable row level security;

drop policy if exists owner_admin_select on public.enrollment_events;
create policy owner_admin_select on public.enrollment_events
  for select to authenticated
  using (public.auth_role() in ('owner', 'admin'));

grant select on public.enrollment_events to authenticated;
-- свідомо БЕЗ insert/update/delete grant

-- ── 2. Рендер тексту повідомлення (українською, час Europe/Kyiv) ────────────
create or replace function public.render_enrollment_event_message(
  p_event_type text,
  p_class_id   uuid,
  p_client_id  uuid,
  p_actor_role text
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_client text;
  v_type   text;
  v_hall   text;
  v_starts timestamptz;
  v_when   text;
  v_actor  text;
begin
  select nullif(trim(coalesce(cl.first_name, '') || ' ' || coalesce(cl.last_name, '')), '')
    into v_client
  from public.clients cl
  where cl.id = p_client_id;

  select c.starts_at,
         coalesce(tt.label, c.ticket_type),
         h.name
    into v_starts, v_type, v_hall
  from public.classes c
  left join public.training_types tt on tt.code = c.ticket_type
  left join public.halls h on h.id = c.hall_id
  where c.id = p_class_id;

  v_when := to_char(v_starts at time zone 'Europe/Kyiv', 'DD.MM HH24:MI');

  v_actor := case p_actor_role
    when 'owner'   then 'адміністратор'
    when 'admin'   then 'адміністратор'
    when 'client'  then 'клієнт'
    when 'trainer' then 'тренер'
    else p_actor_role
  end;

  return case p_event_type
    when 'enrolled' then
      '🟢 Новий запис: ' || coalesce(v_client, 'клієнт')
      || ' на «' || v_type || '» ' || v_when
      || coalesce(', ' || v_hall, '')
      || '. Хто: ' || v_actor || '.'
    when 'cancelled' then
      '🔴 Скасування: ' || coalesce(v_client, 'клієнт')
      || ' — «' || v_type || '» ' || v_when
      || '. Хто: ' || v_actor || '.'
    when 'waitlisted' then
      '🟡 У чергу: ' || coalesce(v_client, 'клієнт')
      || ' (зал повний) — «' || v_type || '» ' || v_when || '.'
    else
      'Зміна запису: ' || coalesce(v_client, 'клієнт')
      || ' — «' || v_type || '» ' || v_when || '.'
  end;
end;
$$;

revoke all on function public.render_enrollment_event_message(text, uuid, uuid, text) from public;

-- ── 3. Тригер логування + постановки в чергу ────────────────────────────────
create or replace function public.log_enrollment_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_cron      boolean;
  v_actor_role   text;
  v_actor_user   uuid;
  v_actor_trainer uuid;
  v_actor_client  uuid;
  v_owner        uuid;
  v_is_self_owner boolean := false;
  v_event_type   text;
  v_old_status   text;
  v_notify       boolean := false;
  v_chat_id      bigint;
  v_message      text;
begin
  -- На UPDATE без зміни статусу — нічого (updated_at/sessions_used тощо).
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return null;
    end if;
    v_old_status := old.status;
  end if;

  -- ── Актор ──
  v_actor_user := auth.uid();
  v_is_cron := (
    nullif(current_setting('request.jwt.claims', true), '') is null
    and current_user not in ('anon', 'authenticated')
  );

  if v_is_cron or v_actor_user is null then
    v_actor_role := 'system';
  else
    v_actor_role := public.auth_role();
    if v_actor_role = 'trainer' then
      v_actor_trainer := public.current_trainer_id();
    elsif v_actor_role = 'client' then
      v_actor_client := public.current_client_id();
    end if;
  end if;

  -- ── Власник заняття (снапшот) ──
  select trainer_id into v_owner from public.classes where id = new.class_id;

  -- ── Suppress: власник діє у себе ──
  v_is_self_owner := (
    v_actor_role = 'trainer'
    and v_owner is not null
    and v_actor_trainer is not null
    and v_actor_trainer = v_owner
  );

  -- ── Тип події (з фінального статусу; waitlist → waitlisted) ──
  v_event_type := case new.status
    when 'enrolled'  then 'enrolled'
    when 'waitlist'  then 'waitlisted'
    when 'cancelled' then 'cancelled'
    when 'attended'  then 'attended'
    when 'noshow'    then 'noshow'
    else 'status_changed'
  end;

  -- ── Нотифікувати? (attended/noshow — аудит-only) ──
  v_notify := (
    v_actor_role <> 'system'
    and not v_is_self_owner
    and v_owner is not null
    and v_event_type in ('enrolled', 'cancelled', 'waitlisted')
  );

  if v_notify then
    select telegram_chat_id into v_chat_id from public.trainers where id = v_owner;
    v_message := public.render_enrollment_event_message(
      v_event_type, new.class_id, new.client_id, v_actor_role
    );
  end if;

  insert into public.enrollment_events (
    event_type, enrollment_id, class_id, client_id, owner_trainer_id,
    old_status, new_status, actor_role, actor_user_id, actor_trainer_id,
    actor_client_id, is_self_owner, notify, telegram_chat_id, message_text
  ) values (
    v_event_type, new.id, new.class_id, new.client_id, v_owner,
    v_old_status, new.status, v_actor_role, v_actor_user, v_actor_trainer,
    v_actor_client, v_is_self_owner, v_notify, v_chat_id, v_message
  );

  return null;
exception when others then
  -- Лог НІКОЛИ не валить грошовий шлях (change_enrollment_status тощо).
  raise warning 'log_enrollment_event failed: %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.log_enrollment_event() from public;

drop trigger if exists trg_enrollment_event on public.enrollments;
create trigger trg_enrollment_event
  after insert or update of status on public.enrollments
  for each row execute function public.log_enrollment_event();
