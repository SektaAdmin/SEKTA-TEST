-- Доставка Telegram-нотифікацій: pg_net + vault + pg_cron (дзеркало auto-close).
--
-- Токен бота — у vault.secrets під назвою 'telegram_bot_token' (ручний крок
-- оператора, НЕ в міграції/cron.command):
--   select vault.create_secret('<BOT_TOKEN>', 'telegram_bot_token');
--
-- Dispatcher щохвилини бере недоставлені notify-рядки і шле sendMessage.
-- chat_id резолвиться «наживо» з trainers (coalesce зі снапшотом) — якщо тренер
-- привʼязав Telegram уже ПІСЛЯ події, повідомлення піде наступним тиком.

create extension if not exists pg_net;

create or replace function public.dispatch_telegram_notifications()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
  r       record;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'telegram_bot_token'
  limit 1;

  if v_token is null then
    raise warning 'dispatch_telegram_notifications: vault secret telegram_bot_token відсутній';
    return;
  end if;

  for r in
    select ee.id,
           coalesce(ee.telegram_chat_id, t.telegram_chat_id) as chat_id,
           ee.message_text
    from public.enrollment_events ee
    left join public.trainers t on t.id = ee.owner_trainer_id
    where ee.notify
      and not ee.delivered
      and ee.message_text is not null
      and ee.delivery_attempts < 5
      and coalesce(ee.telegram_chat_id, t.telegram_chat_id) is not null
    order by ee.created_at
    limit 50
  loop
    -- pg_net асинхронний: ставимо delivered=true оптимістично в тому ж UPDATE,
    -- що й enqueue (+attempts). Нотифікації некритичні — дубль прийнятний,
    -- cap 5 спроб захищає від нескінченних ретраїв.
    perform net.http_post(
      url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body    := jsonb_build_object('chat_id', r.chat_id, 'text', r.message_text),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );

    update public.enrollment_events
    set delivered         = true,
        delivered_at      = now(),
        delivery_attempts = delivery_attempts + 1
    where id = r.id;
  end loop;
end;
$$;

revoke all on function public.dispatch_telegram_notifications() from public;
grant execute on function public.dispatch_telegram_notifications() to postgres;

-- Cron щохвилини (дзеркало auto-close-classes). Ідемпотентно: знести й створити.
select cron.unschedule('dispatch-telegram')
where exists (select 1 from cron.job where jobname = 'dispatch-telegram');

select cron.schedule(
  'dispatch-telegram',
  '* * * * *',
  'select public.dispatch_telegram_notifications()'
);
