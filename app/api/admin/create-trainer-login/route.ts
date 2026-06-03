import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { getRole } from '@/lib/auth/getRole'
import { isStaff } from '@/lib/auth/role'
import type { Database } from '@/types/database.types'

// Створення кабінету (логіну) тренеру з картки в /settings/trainers.
// Дзеркало create-client-login, але role='trainer' і таблиця trainers.
// На відміну від клієнта, контакти живуть у самій trainers (phone/email),
// логін — по телефону (як у клієнтів, готово до SMS-OTP) або по email.
// Кабінет привʼязується до наявного trainers.id → дублі неможливі (UNIQUE user_id).

type Body = { trainer_id?: string }

/** Згенерувати читабельний пароль (8 символів, без неоднозначних 0/O/1/l/I). */
function generatePassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < 8; i++) out += chars[bytes[i] % chars.length]
  return out
}

export async function POST(req: Request) {
  // 1) Гейт ролі — лише owner/admin.
  const role = await getRole()
  if (!isStaff(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Body
  const trainerId = body.trainer_id
  if (!trainerId) {
    return NextResponse.json({ error: 'no_trainer_id' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 })
  }

  // Admin-клієнт (service-role) — лише на сервері, ніколи в браузер.
  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 2) Карта тренера: чи існує, чи вже привʼязаний, контакти.
  const supabase = createServerSupabase()
  const { data: trainer, error: trainerErr } = await supabase
    .from('trainers')
    .select('id, user_id, phone, email')
    .eq('id', trainerId)
    .maybeSingle()

  if (trainerErr) return NextResponse.json({ error: trainerErr.message }, { status: 500 })
  if (!trainer) return NextResponse.json({ error: 'trainer_not_found' }, { status: 404 })

  // 3) Ідентифікатор: телефон (нормалізований) у пріоритеті, інакше email.
  let phone: string | null = null
  if (trainer.phone) {
    const { data: normRows } = await admin.rpc('normalize_phone_ua', { p_phone: trainer.phone })
    phone = (normRows as unknown as string | null) ?? null
    if (!phone) return NextResponse.json({ error: 'bad_phone' }, { status: 400 })
  }
  const email = trainer.email?.trim() || null
  if (!phone && !email) {
    return NextResponse.json({ error: 'no_contact' }, { status: 400 })
  }

  // Кабінет уже є → скидаємо пароль (старий ніде не зберігається — показати
  // повторно неможливо, тож генеруємо новий). Логін лишається тим самим.
  if (trainer.user_id) {
    const newPassword = generatePassword()
    const { error: resetErr } = await admin.auth.admin.updateUserById(trainer.user_id, {
      password: newPassword,
    })
    if (resetErr) return NextResponse.json({ error: resetErr.message }, { status: 500 })
    return NextResponse.json({ login: phone ?? email, password: newPassword, reset: true })
  }

  // 4) Чи не зайнятий цей контакт іншим auth.users.
  const { data: existing } = await admin.auth.admin.listUsers()
  const taken = existing?.users.some(u =>
    (phone && (u.phone === phone.replace('+', '') || u.phone === phone)) ||
    (email && u.email?.toLowerCase() === email.toLowerCase())
  )
  if (taken) return NextResponse.json({ error: 'contact_taken' }, { status: 409 })

  // 5) Створити auth.users + привʼязати до картки.
  const password = generatePassword()
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    ...(phone ? { phone, phone_confirm: true } : {}),
    ...(email ? { email, email_confirm: true } : {}),
    password,
    app_metadata: { role: 'trainer' },
  })
  if (createErr || !created?.user) {
    return NextResponse.json({ error: createErr?.message ?? 'create_failed' }, { status: 500 })
  }

  const { error: linkErr } = await admin
    .from('trainers')
    .update({ user_id: created.user.id })
    .eq('id', trainerId)
    .is('user_id', null) // гонка: лишаємось ідемпотентними

  if (linkErr) {
    // відкат: видалити щойно створеного auth-юзера, щоб не лишати сироту
    await admin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: linkErr.message }, { status: 500 })
  }

  // Логін = той контакт, яким тренер заходитиме (телефон у пріоритеті).
  return NextResponse.json({ login: phone ?? email, password })
}
