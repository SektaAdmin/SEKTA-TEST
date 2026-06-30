import type { Db } from '@/lib/queries/_db'
import { formatClientName } from '@/lib/formatters'
import { ticketTypeShortLabel } from '@/lib/badges'
import { kyivDayUtcBounds } from '@/lib/dateUtils'
import { type DebtGroup } from '@/lib/dashboardReport'

/* Запити, специфічні для операційного дашборду (/dashboard).
   Решта блоків збирається з існуючих queries (enrollments.ts, trainer-rates.ts).
   Гроші — integer ₴, НЕ ділити на 100. */

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

export type SessionDebtorColumn = { ticketType: string; label: string }
export type SessionDebtorRow = {
  clientId: string
  name: string
  /** ticket_type → від'ємний залишок занять (лише типи, де клієнт у мінусі). */
  balances: Record<string, number>
}
export type SessionDebtorsTable = {
  columns: SessionDebtorColumn[]   // лише типи, де є хоч один боржник
  rows: SessionDebtorRow[]
}

/** Усі боржники по сесіях (будь-який тип квитка, не лише сьогодні) у вигляді
   таблиці: рядок = клієнт, колонки = типи занять (лише ті, де є боржники).
   Залишок — кількість занять (integer), знак мінус. */
export async function listSessionDebtorsAll(
  supabase: Db
): Promise<{ data: SessionDebtorsTable; error: string | null }> {
  const { data, error } = await supabase
    .from('client_session_balances')
    .select('ticket_type, sessions_balance, clients(id, first_name, last_name)')
    .lt('sessions_balance', 0)
    .order('ticket_type', { ascending: true })

  type Row = {
    ticket_type: string
    sessions_balance: number | null
    clients: { id: string; first_name: string | null; last_name: string | null } | null
  }

  const colSet = new Set<string>()
  const byClient = new Map<string, SessionDebtorRow>()
  for (const r of ((data ?? []) as Row[])) {
    if (!r.clients) continue
    colSet.add(r.ticket_type)
    let row = byClient.get(r.clients.id)
    if (!row) {
      row = { clientId: r.clients.id, name: formatClientName(r.clients), balances: {} }
      byClient.set(r.clients.id, row)
    }
    row.balances[r.ticket_type] = r.sessions_balance ?? 0
  }

  const columns = Array.from(colSet)
    .sort()
    .map(t => ({ ticketType: t, label: ticketTypeShortLabel(t) }))
  // Найбільші боржники першими (за сумою мінусів по всіх типах).
  const rows = Array.from(byClient.values()).sort((a, b) => {
    const sum = (r: SessionDebtorRow) => Object.values(r.balances).reduce((s, v) => s + v, 0)
    return sum(a) - sum(b)
  })

  return { data: { columns, rows }, error: error?.message ?? null }
}

export type HallBusyInterval = {
  hall: string
  trainer: string | null
  title: string | null
  ticketType: string
  clientName: string | null   // клієнт активного запису (для оренди — хто забронював)
  startMin: number   // хвилини від 00:00 (локально)
  endMin: number
  startsAt: string   // ISO
  durationMin: number
}

/** Зайняті інтервали по залах на дату (лише активні заняття) — для розрахунку
   вільних вікон і покриття студії. Скасовані/видалені сюди не потрапляють: для
   алерту «оренду нема кому відкрити» дивимось на поточну відсутність покриття. */
export async function listHallBusyIntervalsForDate(
  supabase: Db,
  date: string
): Promise<{ data: HallBusyInterval[]; error: string | null }> {
  const { from: dayStart, to: dayEnd } = kyivDayUtcBounds(date)

  type ClassRow = {
    starts_at: string
    duration_min: number
    title: string | null
    ticket_type: string
    halls: { name: string } | null
    trainers: { name: string } | null
    enrollments: { status: string; clients: { first_name: string | null; last_name: string | null } | null }[]
  }

  const { data, error } = await supabase
    .from('classes')
    .select('starts_at, duration_min, title, ticket_type, halls(name), trainers(name), enrollments(status, clients(first_name, last_name))')
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd)
    .eq('is_cancelled', false)
    .order('starts_at', { ascending: true })
    .returns<ClassRow[]>()

  const ACTIVE_ENROLL = new Set(['enrolled', 'attended', 'waitlist'])
  const intervals: HallBusyInterval[] = (data ?? [])
    .filter(c => c.halls?.name)
    .map(c => {
      const d = new Date(c.starts_at)
      const startMin = d.getHours() * 60 + d.getMinutes()
      // Ім'я клієнта активного запису (оренду бронює один клієнт).
      const active = (c.enrollments ?? []).find(e => ACTIVE_ENROLL.has(e.status) && e.clients)
      const clientName = active?.clients ? formatClientName(active.clients) : null
      return {
        hall: c.halls!.name,
        trainer: c.trainers?.name ?? null,
        title: c.title,
        ticketType: c.ticket_type,
        clientName,
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

