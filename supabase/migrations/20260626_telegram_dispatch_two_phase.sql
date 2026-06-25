-- Двофазна доставка Telegram-нотифікацій: фікс оптимістичного delivered=true.
--
-- БАГ (до цього): dispatch_telegram_notifications ставив delivered=true одразу
-- після net.http_post. Але pg_net АСИНХРОННИЙ — http_post лише ставить запит у
-- чергу й повертає request_id; реальна відповідь (200 / timeout) приходить пізніше
-- в net._http_response. Тому подія закривалась як доставлена ще ДО того, як
-- Telegram відповів, а при мережевому таймауті (TCP/SSL handshake > 5с) ретраїв
-- не було — подія вже delivered, dispatcher її більше не брав.
--
-- ФІКС: розводимо на дві фази в одному тіку cron:
--   1) CONFIRM — для подій, що вже надіслані (request_id is not null, не delivered),
--      читаємо net._http_response. 200 + {"ok":true} → delivered=true.
--      Помилка/таймаут (status_code<>200 або error_msg) → лишаємо недоставленою:
--      обнуляємо request_id, щоб наступний тик переслав (поки attempts < 5).
--      Відповіді ще нема (запит у польоті) → чекаємо наступний тик.
--   2) SEND — для нових/скинутих подій робимо http_post і ЗБЕРІГАЄМО request_id
--      (+attempts, +dispatched_at). delivered НЕ ставимо тут.

create extension if not exists pg_net;

alter table public.enrollment_events
  add column if not exists request_id   bigint,
  add column if not exists dispatched_at timestamptz;

create or replace function public.dispatch_telegram_notifications()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
  r       record;
  v_req   bigint;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'telegram_bot_token'
  limit 1;

  if v_token is null then
    raise warning 'dispatch_telegram_notifications: vault secret telegram_bot_token відсутній';
    return;
  end if;

  -- ── ФАЗА 1: CONFIRM ──────────────────────────────────────────────────────
  -- Подія вже надіслана (request_id is not null), але ще не підтверджена.
  for r in
    select ee.id, ee.request_id
    from public.enrollment_events ee
    where ee.notify
      and not ee.delivered
      and ee.request_id is not null
  loop
    -- Беремо відповідь pg_net (net._http_response чиститься періодично — якщо
    -- запис уже зник, вважаємо що відповіді нема й чекаємо/переслати по таймауту).
    declare
      v_status int;
      v_err    text;
      v_ok     boolean;
      v_found  boolean := false;
    begin
      select resp.status_code,
             resp.error_msg,
             (resp.content::jsonb ->> 'ok')::boolean
        into v_status, v_err, v_ok
      from net._http_response resp
      where resp.id = r.request_id;

      v_found := found;

      if not v_found then
        -- Відповіді ще нема в таблиці — лишаємо як є, перевіримо наступний тик.
        continue;
      end if;

      if v_status = 200 and coalesce(v_ok, false) then
        update public.enrollment_events
        set delivered    = true,
            delivered_at  = now(),
            last_error    = null
        where id = r.id;
      else
        -- Невдача (таймаут: status_code null + error_msg; або Telegram ok=false).
        -- Скидаємо request_id → ФАЗА 2 надішле ще раз, поки attempts < 5.
        update public.enrollment_events
        set request_id = null,
            last_error = coalesce(v_err, 'telegram ok=false / status ' || coalesce(v_status::text, 'null'))
        where id = r.id;
      end if;
    end;
  end loop;

  -- ── ФАЗА 2: SEND ─────────────────────────────────────────────────────────
  -- Нові або скинуті після невдачі події (request_id is null), attempts < 5.
  -- timeout_milliseconds=15000: дефолтні 5с pg_net часто не встигають на
  -- TCP/SSL handshake до api.telegram.org (handshake ~5с → стабільний timeout).
  for r in
    select ee.id,
           coalesce(ee.telegram_chat_id, t.telegram_chat_id) as chat_id,
           ee.message_text
    from public.enrollment_events ee
    left join public.trainers t on t.id = ee.owner_trainer_id
    where ee.notify
      and not ee.delivered
      and ee.request_id is null
      and ee.message_text is not null
      and ee.delivery_attempts < 5
      and coalesce(ee.telegram_chat_id, t.telegram_chat_id) is not null
    order by ee.created_at
    limit 50
  loop
    v_req := net.http_post(
      url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body    := jsonb_build_object('chat_id', r.chat_id, 'text', r.message_text),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 15000
    );

    update public.enrollment_events
    set request_id        = v_req,
        dispatched_at     = now(),
        delivery_attempts = delivery_attempts + 1
    where id = r.id;
  end loop;
end;
$$;

revoke all on function public.dispatch_telegram_notifications() from public;
grant execute on function public.dispatch_telegram_notifications() to postgres;
