import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRole } from '@/lib/auth/getRole'
import type { Database } from '@/types/database.types'

// Створення клієнта тренером (а також owner/admin) без прямого доступу до
// client_contacts з браузера. Тренер за RLS не бачить контактів — тож дедуп по
// телефону й запис у clients + client_contacts робить сервер під service-role.
// Інваріант «тренер не бачить контактів» лишається в силі: контакти сюди лише
// надходять, назад тренеру не повертаються.

type Body = {
  first_name?: string
  last_name?: string
  phone?: string
  instagram_username?: string
  telegram_username?: string
}

function clean(v: string | undefined): string | null {
  const t = (v ?? '').trim()
  return t || null
}

export async function POST(req: Request) {
  // 1) Гейт ролі — owner/admin/trainer (клієнт не може створювати клієнтів).
  const role = await getRole()
  if (role !== 'owner' && role !== 'admin' && role !== 'trainer') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Body
  const firstName = (body.first_name ?? '').trim()
  const lastName = (body.last_name ?? '').trim()
  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 })
  }

  // Admin-клієнт (service-role) — лише на сервері, в обхід RLS. Дедуп по
  // контактах тренер сам зробити не може (нема доступу до client_contacts).
  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Телефон зберігаємо як ввели (trim) — так само, як адмінська ClientModal,
  // щоб формат у client_contacts лишався консистентним між шляхами.
  const phone = clean(body.phone)

  // 2) Дедуп по телефону. Звіряємо і сирий введений номер (як адмінський
  //    searchClientsByPhone), і нормалізований через БД-хелпер — щоб впіймати
  //    той самий номер у іншому форматі (+380 / 0...).
  if (phone) {
    const { data: normRows } = await admin.rpc('normalize_phone_ua', { p_phone: phone })
    const normPhone = (normRows as unknown as string | null) ?? null
    const candidates = (normPhone && normPhone !== phone) ? [phone, normPhone] : [phone]
    const { data: phoneMatch } = await admin
      .from('client_contacts')
      .select('client_id')
      .in('phone', candidates)
      .limit(1)
      .maybeSingle()
    if (phoneMatch) {
      return NextResponse.json({ error: 'phone_exists' }, { status: 409 })
    }
  }

  // 3) Дедуп по імені+прізвищу (case-insensitive).
  const { data: nameMatch } = await admin
    .from('clients')
    .select('id')
    .ilike('first_name', firstName)
    .ilike('last_name', lastName)
    .limit(1)
    .maybeSingle()
  if (nameMatch) {
    return NextResponse.json({ error: 'name_exists' }, { status: 409 })
  }

  // 4) Створити картку + контакти.
  const { data: created, error: insertErr } = await admin
    .from('clients')
    .insert({ first_name: firstName, last_name: lastName })
    .select('id')
    .single()
  if (insertErr || !created) {
    return NextResponse.json({ error: insertErr?.message ?? 'insert_failed' }, { status: 500 })
  }

  const { error: contactErr } = await admin
    .from('client_contacts')
    .insert({
      client_id: created.id,
      phone,
      instagram_username: clean(body.instagram_username),
      telegram_username: clean(body.telegram_username),
    })
  if (contactErr) {
    // відкат: знести щойно створену картку, щоб не лишати сироту без контактів
    await admin.from('clients').delete().eq('id', created.id)
    return NextResponse.json({ error: contactErr.message }, { status: 500 })
  }

  return NextResponse.json({ id: created.id })
}
