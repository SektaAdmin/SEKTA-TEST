-- Telegram-привʼязка тренера для нотифікацій про зміни enrollment.
--
-- telegram_chat_id      — куди слати (bigint: int32 замало для TG id).
-- telegram_link_token   — одноразовий deep-link токен (/start <token> у боті).
--                         Ротується webhook-ом після успішної привʼязки.
--
-- RLS без змін: тренер читає свій рядок (trainer_client_select, SELECT-only).
-- UPDATE telegram_chat_id робить лише service-role webhook (тренер не має UPDATE
-- на свій рядок trainers).

alter table public.trainers
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_link_token uuid not null default gen_random_uuid();

create unique index if not exists uq_trainers_tg_link_token
  on public.trainers(telegram_link_token);

create unique index if not exists uq_trainers_tg_chat_id
  on public.trainers(telegram_chat_id)
  where telegram_chat_id is not null;
