# Telegram-нотифікації тренерам

Тренер-власник заняття отримує повідомлення в Telegram, коли **хтось інший**
(клієнт / адмін / інший тренер / самозапис) записується чи скасовує запис на його
заняття. Коли діє **сам власник у себе** — тиша. Повний лог усіх змін — `/audit`.

Архітектура: AFTER-тригер `trg_enrollment_event` на `enrollments` пише рядок у
`enrollment_events` (лог + аутбокс). `pg_cron` job `dispatch-telegram` щохвилини
шле недоставлені notify-рядки через `pg_net` у Bot API. Деталі — `docs/DATABASE.md`.

## Разове налаштування оператора

1. **Створити бота** у [@BotFather](https://t.me/BotFather) → `/newbot` → зберегти
   `TOKEN` і `username` (напр. `sekta_crm_bot`).

2. **Env (Vercel + `.env.local`):**
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC...            # серверний секрет
   TELEGRAM_WEBHOOK_SECRET=<довгий-рандом>     # будь-який рядок, звіряємо з заголовком
   NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=sekta_crm_bot  # для deep-link у кабінеті (БЕЗ @)
   ```
   `SUPABASE_SERVICE_ROLE_KEY` і `NEXT_PUBLIC_SUPABASE_URL` уже є.

3. **Токен у Vault** (для cron-dispatcher, через Supabase SQL Editor / MCP):
   ```sql
   select vault.create_secret('<TELEGRAM_BOT_TOKEN>', 'telegram_bot_token');
   ```
   Той самий токен, що в env. У SQL/cron.command токен НЕ зберігається.

4. **Зареєструвати webhook** (після деплою, домен з HTTPS):
   ```sh
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -d url="https://<домен>/api/telegram/webhook" \
     -d secret_token="<TELEGRAM_WEBHOOK_SECRET>"
   ```

## Привʼязка тренера
Кабінет тренера (`/trainer`) → картка «Сповіщення в Telegram» → **Підключити** →
відкривається бот із `/start <token>` → webhook записує `telegram_chat_id` і ротує
токен (deep-link одноразовий). Далі кнопка показує «Підключено ✅».

## Перевірка
- `vault.create_secret(...)` зроблено, `setWebhook` повернув `{"ok":true}`.
- Привʼязка: `select telegram_chat_id, telegram_link_token from trainers where ...`
  — chat_id заповнено, токен змінився.
- Запис/скасування **не власником** → ≤60с приходить повідомлення; рядок у
  `enrollment_events` має `notify=true`, `delivered=true`.
- Власник у себе → `is_self_owner=true`, `notify=false`, тиша.
- `auto_close_classes` (enrolled→attended) → `actor_role='system'`, без нотифікації.
- Якщо тренер ще не привʼязав Telegram — notify-рядок лишається `delivered=false`,
  доставиться наступним тиком після привʼязки (chat_id резолвиться наживо).
