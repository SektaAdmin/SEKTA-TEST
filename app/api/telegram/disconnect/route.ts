import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import type { Database } from '@/types/database.types'

// Відписка тренера від Telegram-сповіщень з кабінету.
//
// Тренер не має UPDATE на свій рядок trainers (за дизайном пише лише
// service-role — див. webhook). Тому кнопка «Відключити» дзвонить сюди:
// звіряємо, що це справді власник картки (auth-user → trainers.user_id),
// і через service-role зануляємо telegram_chat_id + ротуємо
// telegram_link_token (щоб deep-link для повторного підключення був новий).

export const dynamic = 'force-dynamic'

export async function POST() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 })
  }

  // 1) Хто дзвонить — має бути залогінений тренер.
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 2) Його картка тренера (RLS: тренер бачить свій рядок).
  const { data: trainer, error: trainerErr } = await supabase
    .from('trainers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (trainerErr) return NextResponse.json({ error: trainerErr.message }, { status: 500 })
  if (!trainer) return NextResponse.json({ error: 'trainer_not_found' }, { status: 404 })

  // 3) Занулити chat_id + ротувати токен (service-role — тренер сам не може).
  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: updErr } = await admin
    .from('trainers')
    .update({ telegram_chat_id: null, telegram_link_token: crypto.randomUUID() })
    .eq('id', trainer.id)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
