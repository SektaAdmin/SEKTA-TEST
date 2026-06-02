import type { SupabaseClient } from '@supabase/supabase-js'
import { effectiveSessionBalance } from '@/lib/scheduleMetrics'
import { formatClientName, formatTime } from '@/lib/formatters'
import { groupDebtRows, type DebtRow, type DebtGroup } from '@/lib/dashboardReport'

/* Запити, специфічні для операційного дашборду (/dashboard).
   Решта блоків збирається з існуючих queries (enrollments.ts, trainer-rates.ts).
   Гроші — integer ₴, НЕ ділити на 100. */

/** Гроші за день: продажі по методах оплати + витрати/доходи студії. */
export type MoneyTotals = {
  cash: number
  fop: number
  personal_card: number
  deposit: number
  expense: number   // витрати студії за день (direction='expense')
  income: number    // доходи студії за день (direction='income')
}

export async function getMoneyTotalsForDate(
  supabase: SupabaseClient,
  date: string
): Promise<{ data: MoneyTotals; error: string | null }> {
  const from = `${date}T00:00:00`
  const to = `${date}T23:59:59.999`

  const [salesRes, expRes] = await Promise.all([
    supabase.from('sales').select('payment_method, price_paid').gte('created_at', from).lte('created_at', to),
    supabase.from('studio_expenses').select('direction, amount').gte('created_at', from).lte('created_at', to),
  ])

  const t: MoneyTotals = { cash: 0, fop: 0, personal_card: 0, deposit: 0, expense: 0, income: 0 }
  for (const s of (salesRes.data ?? []) as { payment_method: string; price_paid: number }[]) {
    if (s.payment_method in t) (t as Record<string, number>)[s.payment_method] += Number(s.price_paid)
  }
  for (const e of (expRes.data ?? []) as { direction: string; amount: number }[]) {
    if (e.direction === 'expense') t.expense += Number(e.amount)
    else if (e.direction === 'income') t.income += Number(e.amount)
  }

  return { data: t, error: salesRes.error?.message ?? expRes.error?.message ?? null }
}

/** Клієнти з від'ємним грошовим депозитом (view clients_negative_balance). */
export async function listNegativeBalanceClients(
  supabase: SupabaseClient
): Promise<{ data: { id: string; name: string; balance: number }[]; error: string | null }> {
  const { data, error } = await supabase
    .from('clients_negative_balance')
    .select('id, first_name, last_name, balance')
    .order('balance', { ascending: true })

  type Row = { id: string | null; first_name: string | null; last_name: string | null; balance: number | null }
  const rows = ((data ?? []) as Row[])
    .filter(r => r.id != null)
    .map(r => ({ id: r.id!, name: formatClientName(r), balance: r.balance ?? 0 }))

  return { data: rows, error: error?.message ?? null }
}

export type HallBusyInterval = {
  hall: string
  trainer: string | null
  title: string | null
  startMin: number   // хвилини від 00:00 (локально)
  endMin: number
  startsAt: string   // ISO
  durationMin: number
}

/** Зайняті інтервали по залах на дату — для розрахунку вільних вікон. */
export async function listHallBusyIntervalsForDate(
  supabase: SupabaseClient,
  date: string
): Promise<{ data: HallBusyInterval[]; error: string | null }> {
  const dayStart = new Date(`${date}T00:00:00`).toISOString()
  const dayEnd = new Date(`${date}T23:59:59.999`).toISOString()

  type ClassRow = {
    starts_at: string
    duration_min: number
    title: string | null
    halls: { name: string } | null
    trainers: { name: string } | null
  }

  const { data, error } = await supabase
    .from('classes')
    .select('starts_at, duration_min, title, halls(name), trainers(name)')
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd)
    .eq('is_cancelled', false)
    .order('starts_at', { ascending: true })
    .returns<ClassRow[]>()

  const intervals: HallBusyInterval[] = (data ?? [])
    .filter(c => c.halls?.name)
    .map(c => {
      const d = new Date(c.starts_at)
      const startMin = d.getHours() * 60 + d.getMinutes()
      return {
        hall: c.halls!.name,
        trainer: c.trainers?.name ?? null,
        title: c.title,
        startMin,
        endMin: startMin + c.duration_min,
        startsAt: c.starts_at,
        durationMin: c.duration_min,
      }
    })

  return { data: intervals, error: error?.message ?? null }
}

/** Боржники по сесіях на сьогодні — агрегатно, БЕЗ N+1.
   3 запити: класи дня → всі активні enrollments по class_id IN → всі баланси по (client_id, ticket_type).
   «Боржник» = effectiveSessionBalance(...) < 0. */
export async function listSessionDebtorsForDate(
  supabase: SupabaseClient,
  date: string
): Promise<{ data: DebtGroup[]; error: string | null }> {
  const dayStart = new Date(`${date}T00:00:00`).toISOString()
  const dayEnd = new Date(`${date}T23:59:59.999`).toISOString()

  type ClassRow = {
    id: string; ticket_type: string; starts_at: string
    trainers: { name: string } | null; halls: { name: string } | null
  }
  const { data: classes, error: clsErr } = await supabase
    .from('classes')
    .select('id, ticket_type, starts_at, trainers(name), halls(name)')
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd)
    .eq('is_cancelled', false)
    .order('starts_at', { ascending: true })
    .returns<ClassRow[]>()

  if (clsErr) return { data: [], error: clsErr.message }
  if (!classes || classes.length === 0) return { data: [], error: null }

  const classById = new Map(classes.map(c => [c.id, c]))
  const classIds = classes.map(c => c.id)

  type EnrRow = {
    class_id: string; client_id: string; status: string; sessions_used: number; hours_attended: number[] | null
    clients: { first_name: string | null; last_name: string | null } | null
  }
  const { data: enrollments, error: enrErr } = await supabase
    .from('enrollments')
    .select('class_id, client_id, status, sessions_used, hours_attended, clients(first_name, last_name)')
    .in('class_id', classIds)
    .in('status', ['enrolled', 'attended', 'noshow'])
    .returns<EnrRow[]>()

  if (enrErr) return { data: [], error: enrErr.message }
  const active = enrollments ?? []
  if (active.length === 0) return { data: [], error: null }

  // Унікальні (client_id, ticket_type) → один запит балансів.
  const clientIds = Array.from(new Set(active.map(e => e.client_id)))
  const { data: balRows, error: balErr } = await supabase
    .from('client_session_balances')
    .select('client_id, ticket_type, sessions_balance')
    .in('client_id', clientIds)

  if (balErr) return { data: [], error: balErr.message }
  const balByKey = new Map<string, number>()
  for (const b of (balRows ?? []) as { client_id: string; ticket_type: string; sessions_balance: number }[]) {
    balByKey.set(`${b.client_id}||${b.ticket_type}`, b.sessions_balance)
  }

  const rows: DebtRow[] = []
  for (const e of active) {
    const cls = classById.get(e.class_id)
    if (!cls) continue
    const raw = balByKey.get(`${e.client_id}||${cls.ticket_type}`) ?? 0
    const eff = effectiveSessionBalance(raw, e.status, e.sessions_used, e.hours_attended)
    if (eff >= 0) continue
    const d = new Date(cls.starts_at)
    rows.push({
      time: formatTime(cls.starts_at),
      startMin: d.getHours() * 60 + d.getMinutes(),
      hall: cls.halls?.name ?? '—',
      trainer: cls.trainers?.name ?? '—',
      ticketType: cls.ticket_type,
      clientName: e.clients ? formatClientName(e.clients) : '—',
      balance: eff,
    })
  }

  return { data: groupDebtRows(rows), error: null }
}
