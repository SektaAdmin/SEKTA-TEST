import type { QueryData } from '@supabase/supabase-js'
import type { Db } from '@/lib/queries/_db'
import { TRAINER_FK } from '@/lib/queries/_fk'

const RATE_SELECT = 'id, trainer_id, ticket_type, hall_id, trainer_rate, studio_rate, valid_from, valid_to, created_at, trainers(name), halls(name)' as const
function rateQuery(supabase: Db) { return supabase.from('trainer_rates').select(RATE_SELECT) }

export type TrainerRate = {
  id: string
  trainer_id: string | null
  trainer_name: string | null
  ticket_type: string
  hall_id: string | null
  hall_name: string | null
  trainer_rate: number
  studio_rate: number
  valid_from: string
  valid_to: string | null
  created_at: string
}

export type TrainerSalaryDetailRow = {
  class_id: string
  starts_at: string
  ticket_type: string
  hall_name: string | null
  duration_min: number
  enrollments: {
    client_id: string
    client_name: string
    status: 'attended' | 'noshow'
    trainer_amount: number
    studio_amount: number
  }[]
  total_clients: number
  total_trainer: number
  total_studio: number
}

const PAYMENT_SELECT = '*, trainers!trainer_payments_trainer_id_fkey(name)' as const
const _payFkCheck: typeof TRAINER_FK.payments = 'trainer_payments_trainer_id_fkey'
void _payFkCheck
function paymentQuery(supabase: Db) { return supabase.from('trainer_payments').select(PAYMENT_SELECT) }

/**
 * Shape виведено зі схеми (QueryData); payment_method/payment_type звужено до
 * union (БД CHECK + форми). trainers — embed одного FK.
 */
export type TrainerPayment = Omit<QueryData<ReturnType<typeof paymentQuery>>[number], 'payment_method' | 'payment_type'> & {
  payment_method: 'cash' | 'fop' | 'personal_card'
  payment_type: 'advance' | 'final'
}

export type TrainerCashBalance = {
  cash_sales: { id: string; created_at: string; client_name: string; ticket_name: string | null; amount: number }[]
  expenses: { id: string; created_at: string; description: string | null; amount: number }[]
  salary_payments: { id: string; created_at: string; payment_date: string; amount: number }[]
  total: number
}

// ─── Rates ────────────────────────────────────────────────────────────────────

export async function listTrainerRatesAll(
  supabase: Db
): Promise<{ data: TrainerRate[]; error: string | null }> {
  const { data, error } = await rateQuery(supabase)
    .order('ticket_type')
    .order('valid_from', { ascending: false })
  return {
    data: (data ?? []).map(r => ({
      id: r.id,
      trainer_id: r.trainer_id,
      trainer_name: r.trainers?.name ?? null,
      ticket_type: r.ticket_type,
      hall_id: r.hall_id,
      hall_name: r.halls?.name ?? null,
      trainer_rate: r.trainer_rate,
      studio_rate: r.studio_rate,
      valid_from: r.valid_from,
      valid_to: r.valid_to,
      created_at: r.created_at,
    })),
    error: error?.message ?? null,
  }
}

// Додає нову ставку. Якщо є активна ставка для тієї ж комбінації (trainer_id, ticket_type, hall_id) —
// закриває її (valid_to = valid_from - 1 день).
export async function addTrainerRate(
  supabase: Db,
  payload: {
    trainer_id: string | null
    ticket_type: string
    hall_id: string | null
    trainer_rate: number
    studio_rate: number
    valid_from: string
  }
): Promise<{ error: string | null }> {
  // Знайти активну ставку для цієї комбінації
  let query = supabase
    .from('trainer_rates')
    .select('id, valid_from')
    .is('valid_to', null)
    .eq('ticket_type', payload.ticket_type)

  if (payload.trainer_id) {
    query = query.eq('trainer_id', payload.trainer_id)
  } else {
    query = query.is('trainer_id', null)
  }
  if (payload.hall_id) {
    query = query.eq('hall_id', payload.hall_id)
  } else {
    query = query.is('hall_id', null)
  }

  const { data: existing } = await query.maybeSingle()

  if (existing) {
    // Закрити попередню ставку: valid_to = valid_from нової - 1 день
    const newFrom = new Date(payload.valid_from)
    newFrom.setDate(newFrom.getDate() - 1)
    const validTo = newFrom.toISOString().slice(0, 10)
    const { error: closeErr } = await supabase
      .from('trainer_rates')
      .update({ valid_to: validTo })
      .eq('id', existing.id)
    if (closeErr) return { error: closeErr.message }
  }

  const { error } = await supabase.from('trainer_rates').insert({
    trainer_id: payload.trainer_id,
    ticket_type: payload.ticket_type,
    hall_id: payload.hall_id,
    trainer_rate: payload.trainer_rate,
    studio_rate: payload.studio_rate,
    valid_from: payload.valid_from,
  })
  return { error: error?.message ?? null }
}

export async function archiveTrainerRate(
  supabase: Db,
  id: string,
  validTo: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('trainer_rates')
    .update({ valid_to: validTo })
    .eq('id', id)
  return { error: error?.message ?? null }
}

export async function restoreTrainerRate(
  supabase: Db,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('trainer_rates')
    .update({ valid_to: null })
    .eq('id', id)
  return { error: error?.message ?? null }
}

// Залишаємо для зворотної сумісності зі старим кодом (rates/page.tsx)
// ─── Salary calculation ────────────────────────────────────────────────────────

// Деталізований RPC — повертає рядки по кожному enrollment, згруповані по заняттях
export async function calcTrainerSalaryDetail(
  supabase: Db,
  trainerId: string,
  start: string,
  end: string
): Promise<{ data: TrainerSalaryDetailRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('calc_trainer_salary_v2', {
    p_trainer_id: trainerId,
    p_start: start,
    p_end: end,
  })
  if (error || !data) return { data: [], error: error?.message ?? null }

  // Групуємо по class_id
  const map = new Map<string, TrainerSalaryDetailRow>()
  for (const r of data) {
    if (!map.has(r.class_id)) {
      map.set(r.class_id, {
        class_id: r.class_id,
        starts_at: r.starts_at,
        ticket_type: r.ticket_type,
        hall_name: r.hall_name ?? null,
        duration_min: r.duration_min,
        enrollments: [],
        total_clients: 0,
        total_trainer: 0,
        total_studio: 0,
      })
    }
    const row = map.get(r.class_id)!
    row.enrollments.push({
      client_id: r.client_id,
      client_name: r.client_name,
      status: r.enrollment_status as 'attended' | 'noshow',
      trainer_amount: Number(r.trainer_amount),
      studio_amount: Number(r.studio_amount),
    })
    row.total_clients += 1
    row.total_trainer += Number(r.trainer_amount)
    row.total_studio += Number(r.studio_amount)
  }
  return { data: Array.from(map.values()), error: null }
}

// Готівка на руках у тренера за період:
// cash-продажі − studio_expenses − виплати ЗП готівкою за цей же період
// Готівка тренера за обраний період (для деталізації в розрахунках)
export async function getTrainerCashBalance(
  supabase: Db,
  trainerId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ data: TrainerCashBalance; error: string | null }> {
  const [salesRes, expensesRes, paymentsRes] = await Promise.all([
    supabase
      .from('sales')
      .select('id, created_at, price_paid, ticket_name, clients(first_name, last_name)')
      .eq('cash_holder', trainerId)
      .eq('payment_method', 'cash')
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lte('created_at', `${dateTo}T23:59:59`)
      .order('created_at'),
    supabase
      .from('studio_expenses')
      .select('id, created_at, amount, description')
      .eq('cash_holder', trainerId)
      .eq('direction', 'expense')
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lte('created_at', `${dateTo}T23:59:59`)
      .order('created_at'),
    supabase
      .from('trainer_payments')
      .select('id, created_at, paid_amount, payment_date')
      .eq('cash_holder', trainerId)
      .eq('payment_method', 'cash')
      .gte('payment_date', dateFrom)
      .lte('payment_date', dateTo)
      .order('payment_date'),
  ])

  const error =
    salesRes.error?.message ??
    expensesRes.error?.message ??
    paymentsRes.error?.message ??
    null

  const cashSales = (salesRes.data ?? []).map(s => ({
    id: s.id,
    created_at: s.created_at,
    client_name: [s.clients?.first_name, s.clients?.last_name].filter(Boolean).join(' ') || '—',
    ticket_name: s.ticket_name ?? null,
    amount: Number(s.price_paid),
  }))

  const expenses = (expensesRes.data ?? []).map(e => ({
    id: e.id,
    created_at: e.created_at,
    description: e.description ?? null,
    amount: Number(e.amount),
  }))

  const salaryPayments = (paymentsRes.data ?? []).map(p => ({
    id: p.id,
    created_at: p.created_at,
    payment_date: p.payment_date,
    amount: Number(p.paid_amount),
  }))

  const totalSales = cashSales.reduce((s, r) => s + r.amount, 0)
  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0)
  const totalSalaryPaid = salaryPayments.reduce((s, r) => s + r.amount, 0)

  return {
    data: {
      cash_sales: cashSales,
      expenses,
      salary_payments: salaryPayments,
      total: totalSales - totalExpenses - totalSalaryPaid,
    },
    error,
  }
}

// Загальний баланс готівки тренера за весь час (без фільтра дат)
export async function getTrainerCashBalanceTotal(
  supabase: Db,
  trainerId: string
): Promise<{ data: number; error: string | null }> {
  const [salesRes, expensesRes, paymentsRes] = await Promise.all([
    supabase
      .from('sales')
      .select('price_paid')
      .eq('cash_holder', trainerId)
      .eq('payment_method', 'cash'),
    supabase
      .from('studio_expenses')
      .select('amount')
      .eq('cash_holder', trainerId)
      .eq('direction', 'expense'),
    supabase
      .from('trainer_payments')
      .select('paid_amount')
      .eq('cash_holder', trainerId)
      .eq('payment_method', 'cash'),
  ])

  const error =
    salesRes.error?.message ??
    expensesRes.error?.message ??
    paymentsRes.error?.message ??
    null

  const totalSales = (salesRes.data ?? []).reduce((s, r) => s + Number(r.price_paid), 0)
  const totalExpenses = (expensesRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const totalPaid = (paymentsRes.data ?? []).reduce((s, r) => s + Number(r.paid_amount), 0)

  return { data: totalSales - totalExpenses - totalPaid, error }
}

// Баланси готівки всіх тренерів одним запитом (для /accounting)
export async function listAllCashBalances(
  supabase: Db
): Promise<{ data: { trainer_id: string; trainer_name: string; balance: number }[]; error: string | null }> {
  const [trainersRes, salesRes, expensesRes, paymentsRes] = await Promise.all([
    supabase.from('trainers').select('id, name').eq('is_active', true).order('name'),
    supabase.from('sales').select('cash_holder, price_paid').eq('payment_method', 'cash').not('cash_holder', 'is', null),
    supabase.from('studio_expenses').select('cash_holder, amount').eq('direction', 'expense').not('cash_holder', 'is', null),
    supabase.from('trainer_payments').select('cash_holder, paid_amount').eq('payment_method', 'cash').not('cash_holder', 'is', null),
  ])

  const error =
    trainersRes.error?.message ??
    salesRes.error?.message ??
    expensesRes.error?.message ??
    paymentsRes.error?.message ??
    null

  const trainers = trainersRes.data ?? []

  // cash_holder гарантовано non-null — запити фільтрують .not('cash_holder','is',null).
  const salesByHolder = new Map<string, number>()
  for (const s of salesRes.data ?? []) {
    const h = s.cash_holder!
    salesByHolder.set(h, (salesByHolder.get(h) ?? 0) + Number(s.price_paid))
  }

  const expensesByHolder = new Map<string, number>()
  for (const e of expensesRes.data ?? []) {
    const h = e.cash_holder!
    expensesByHolder.set(h, (expensesByHolder.get(h) ?? 0) + Number(e.amount))
  }

  const paidByHolder = new Map<string, number>()
  for (const p of paymentsRes.data ?? []) {
    const h = p.cash_holder!
    paidByHolder.set(h, (paidByHolder.get(h) ?? 0) + Number(p.paid_amount))
  }

  return {
    data: trainers
      .map(t => ({
        trainer_id: t.id,
        trainer_name: t.name,
        balance: (salesByHolder.get(t.id) ?? 0) - (expensesByHolder.get(t.id) ?? 0) - (paidByHolder.get(t.id) ?? 0),
      }))
      .filter(t => t.balance !== 0),
    error,
  }
}

// Загальний борг студії перед тренером за весь час:
// сума всіх нарахувань (з calc_trainer_salary_v2 за весь час) мінус сума всіх виплат
// ─── Payments ─────────────────────────────────────────────────────────────────

export async function listTrainerPayments(
  supabase: Db,
  trainerId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ data: TrainerPayment[]; error: string | null }> {
  const { data, error } = await paymentQuery(supabase)
    .eq('trainer_id', trainerId)
    .lte('period_start', periodEnd)
    .gte('period_end', periodStart)
    .order('created_at', { ascending: false })
  return { data: (data ?? []) as TrainerPayment[], error: error?.message ?? null }
}

export async function updateTrainerPayment(
  supabase: Db,
  id: string,
  payload: {
    paid_amount: number
    payment_date: string
    payment_method: 'cash' | 'fop' | 'personal_card'
    cash_holder: string | null
    payment_type: 'advance' | 'final'
    notes: string | null
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trainer_payments').update(payload).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteTrainerPayment(
  supabase: Db,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trainer_payments').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export async function insertTrainerPayment(
  supabase: Db,
  payload: {
    trainer_id: string
    period_start: string
    period_end: string
    calculated_amount: number
    paid_amount: number
    payment_date: string
    payment_method: 'cash' | 'fop' | 'personal_card'
    cash_holder: string | null
    payment_type: 'advance' | 'final'
    notes: string | null
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trainer_payments').insert(payload)
  return { error: error?.message ?? null }
}
