import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// Telegram bot webhook — привʼязка кабінету тренера до Telegram-чату.
//
// Тренер тисне «Підключити Telegram» у кабінеті → відкривається deep-link
// https://t.me/<bot>?start=<telegram_link_token> → бот шле нам /start <token>.
// Тут ми звіряємо токен з trainers.telegram_link_token і записуємо chat_id
// через service-role (тренер не має UPDATE на свій рядок trainers).
//
// Захист: Telegram дзвонить сюди з заголовком x-telegram-bot-api-secret-token,
// що ми задаємо у setWebhook. Без збігу — 401.
//
// Разовий крок оператора (НЕ в коді):
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//     -d url="https://<домен>/api/telegram/webhook" \
//     -d secret_token="<TELEGRAM_WEBHOOK_SECRET>"

export const dynamic = 'force-dynamic'

// uuid v4 у тексті deep-link: 8-4-4-4-12 hex.
const START_RE = /^\/start\s+([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/

type TgUpdate = {
  message?: {
    text?: string
    chat?: { id?: number }
  }
}

/** Відповісти користувачу в чат (best-effort, помилку ковтаємо). */
async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  } catch {
    /* доставка відповіді не критична */
  }
}

export async function POST(req: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!botToken || !webhookSecret || !serviceKey || !url) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 })
  }

  // 1) Перевірка секрету Telegram.
  if (req.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 401 })
  }

  const update = (await req.json().catch(() => ({}))) as TgUpdate
  const text = update.message?.text?.trim()
  const chatId = update.message?.chat?.id

  // Не наш формат — мовчки 200, щоб Telegram не ретраїв.
  if (!text || typeof chatId !== 'number') {
    return NextResponse.json({ ok: true })
  }

  const match = text.match(START_RE)
  if (!match) {
    await sendMessage(botToken, chatId, 'Надішліть посилання з кабінету тренера, щоб підключити сповіщення.')
    return NextResponse.json({ ok: true })
  }
  const linkToken = match[1]

  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 2) Привʼязати chat_id за токеном (лише якщо ще не привʼязаний).
  const { data: linked, error: linkErr } = await admin
    .from('trainers')
    .update({ telegram_chat_id: chatId })
    .eq('telegram_link_token', linkToken)
    .is('telegram_chat_id', null)
    .select('id')
    .maybeSingle()

  if (linkErr) {
    // Унікальність chat_id: цей Telegram уже привʼязаний до іншого тренера.
    if (linkErr.code === '23505') {
      await sendMessage(botToken, chatId, 'Цей Telegram уже підключено до іншого профілю тренера.')
      return NextResponse.json({ ok: true })
    }
    await sendMessage(botToken, chatId, 'Не вдалося підключити. Спробуйте пізніше.')
    return NextResponse.json({ ok: true })
  }

  if (!linked) {
    // Токен невідомий АБО профіль уже підключений (chat_id заповнений).
    await sendMessage(botToken, chatId, 'Невідоме або вже використане посилання. Відкрийте кабінет тренера й спробуйте ще раз.')
    return NextResponse.json({ ok: true })
  }

  // 3) Ротувати токен — deep-link одноразовий.
  await admin
    .from('trainers')
    .update({ telegram_link_token: crypto.randomUUID() })
    .eq('id', linked.id)

  await sendMessage(botToken, chatId, '✅ Telegram підключено. Надсилатиму сповіщення про записи та скасування на ваші заняття.')
  return NextResponse.json({ ok: true })
}
