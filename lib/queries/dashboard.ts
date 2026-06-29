import type { Db } from '@/lib/queries/_db'
import { formatClientName } from '@/lib/formatters'
import { kyivDayUtcBounds } from '@/lib/dateUtils'
import { type DebtGroup } from '@/lib/dashboardReport'

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
  supabase: Db,
  date: string
): Promise<{ data: MoneyTotals; error: string | null }> {
  const { from, to } = kyivDayUtcBounds(date)

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
  supabase: Db
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
  supabase: Db,
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

/** Боржники по сесіях на дату — один RPC-запит, групування в БД. */
export async function listSessionDebtorsForDate(
  supabase: Db,
  date: string
): Promise<{ data: DebtGroup[]; error: string | null }> {
  const { data, error } = await supabase.rpc('get_session_debtors_for_date', { p_date: date })
  if (error) return { data: [], error: error.message }

  type RpcRow = {
    time_str: string; start_min: number; hall: string; trainer: string
    short_label: string | null
    clients: { name: string; balance: number }[]
  }

  const groups: DebtGroup[] = ((data ?? []) as RpcRow[]).map(r => ({
    time: r.time_str,
    startMin: r.start_min,
    hall: r.hall,
    trainer: r.trainer,
    indivLabel: r.short_label ?? '',
    clients: r.clients,
  }))

  return { data: groups, error: null }
}

/** Готівка (cash), що надійшла за день, згрупована по cash_holder (trainer.id). */
export async function getCashIncomingByHolderForDate(
  supabase: Db,
  date: string
): Promise<{ data: Map<string, number>; error: string | null }> {
  const { from, to } = kyivDayUtcBounds(date)
  const { data, error } = await supabase
    .from('sales')
    .select('cash_holder, price_paid')
    .eq('payment_method', 'cash')
    .not('cash_holder', 'is', null)
    .gte('created_at', from)
    .lte('created_at', to)

  const byHolder = new Map<string, number>()
  for (const s of (data ?? []) as { cash_holder: string; price_paid: number }[]) {
    byHolder.set(s.cash_holder, (byHolder.get(s.cash_holder) ?? 0) + Number(s.price_paid))
  }
  return { data: byHolder, error: error?.message ?? null }
}
