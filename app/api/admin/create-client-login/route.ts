import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { getRole } from '@/lib/auth/getRole'
import { isStaff } from '@/lib/auth/role'
import type { Database } from '@/types/database.types'

// Фаза 5: створення кабінету (логіну) клієнту з картки.
// Кабінет завжди привʼязується до наявного clients.id → дублі неможливі by design.
// Identifier = телефон (E.164). Зараз віддаємо логін+пароль (адмін шле в директ),
// пізніше — OTP по SMS на той самий auth.users.phone без переробок.

type Body = { client_id?: string }

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
  const clientId = body.client_id
  if (!clientId) {
    return NextResponse.json({ error: 'no_client_id' }, { status: 400 })
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

  // 2) Карта клієнта: чи існує, чи вже привʼязаний, нормалізований телефон.
  //    Читаємо через звичайну серверну сесію (RLS owner/admin бачить усе).
  const supabase = createServerSupabase()
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, user_id, first_name, last_name')
    .eq('id', clientId)
    .maybeSingle()

  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 })
  if (!client) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  const { data: contact } = await supabase
    .from('client_contacts')
    .select('phone')
    .eq('client_id', clientId)
    .maybeSingle()

  // Нормалізація через БД-хелпер — єдине джерело правди формату.
  const { data: normRows } = await admin.rpc('normalize_phone_ua', { p_phone: contact?.phone ?? '' })
  const phone = (normRows as unknown as string | null) ?? null
  if (!phone) return NextResponse.json({ error: 'no_phone' }, { status: 400 })

  // Кабінет уже є → скидаємо пароль (старий ніде не зберігається — показати
  // повторно неможливо, тож генеруємо новий). Логін (телефон) лишається тим самим.
  if (client.user_id) {
    const newPassword = generatePassword()
    const { error: resetErr } = await admin.auth.admin.updateUserById(client.user_id, {
      password: newPassword,
    })
    if (resetErr) return NextResponse.json({ error: resetErr.message }, { status: 500 })
    return NextResponse.json({ login: phone, password: newPassword, reset: true })
  }

  // 3) Чи не зайнятий цей номер іншим auth.users (напр. сімейний номер).
  const { data: existing } = await admin.auth.admin.listUsers()
  const taken = existing?.users.some(u => u.phone === phone.replace('+', '') || u.phone === phone)
  if (taken) return NextResponse.json({ error: 'phone_taken' }, { status: 409 })

  // 4) Створити auth.users + привʼязати до картки.
  const password = generatePassword()
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
    app_metadata: { role: 'client' },
  })
  if (createErr || !created?.user) {
    return NextResponse.json({ error: createErr?.message ?? 'create_failed' }, { status: 500 })
  }

  const { error: linkErr } = await admin
    .from('clients')
    .update({ user_id: created.user.id })
    .eq('id', clientId)
    .is('user_id', null) // гонка: лишаємось ідемпотентними

  if (linkErr) {
    // відкат: видалити щойно створеного auth-юзера, щоб не лишати сироту
    await admin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: linkErr.message }, { status: 500 })
  }

  return NextResponse.json({ login: phone, password })
}
