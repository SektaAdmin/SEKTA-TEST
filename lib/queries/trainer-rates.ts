import type { SupabaseClient } from '@supabase/supabase-js'

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

export type TrainerSalaryRow = {
  ticket_type: string
  sessions_total: number
  rate: number | null
  amount: number
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

export type TrainerPayment = {
  id: string
  trainer_id: string
  cash_holder: string | null
  period_start: string
  period_end: string
  calculated_amount: number
  paid_amount: number
  payment_date: string
  payment_method: 'cash' | 'fop' | 'personal_card'
  payment_type: 'advance' | 'final'
  notes: string | null
  created_at: string
  trainers?: { name: string } | null
}

export type TrainerCashBalance = {
  cash_sales: { id: string; created_at: string; client_name: string; ticket_name: string | null; amount: number }[]
  expenses: { id: string; created_at: string; description: string | null; amount: number }[]
  salary_payments: { id: string; created_at: string; payment_date: string; amount: number }[]
  total: number
}

// ─── Rates ────────────────────────────────────────────────────────────────────

export async function listTrainerRatesActive(
  supabase: SupabaseClient
): Promise<{ data: TrainerRate[]; error: string | null }> {
  type RateRow = {
    id: string; trainer_id: string | null; ticket_type: string; hall_id: string | null;
    trainer_rate: number; studio_rate: number; valid_from: string; valid_to: string | null; created_at: string;
    trainers: { name: string } | null; halls: { name: string } | null
  }

  const { data, error } = await supabase
    .from('trainer_rates')
    .select('id, trainer_id, ticket_type, hall_id, trainer_rate, studio_rate, valid_from, valid_to, created_at, trainers(name), halls(name)')
    .is('valid_to', null)
    .order('ticket_type')
    .order('trainer_id', { nullsFirst: true })
  return {
    data: ((data as unknown as RateRow[] | null) ?? []).map(r => ({
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

export async function listTrainerRatesAll(
  supabase: SupabaseClient
): Promise<{ data: TrainerRate[]; error: string | null }> {
  type RateRow = {
    id: string; trainer_id: string | null; ticket_type: string; hall_id: string | null;
    trainer_rate: number; studio_rate: number; valid_from: string; valid_to: string | null; created_at: string;
    trainers: { name: string } | null; halls: { name: string } | null
  }

  const { data, error } = await supabase
    .from('trainer_rates')
    .select('id, trainer_id, ticket_type, hall_id, trainer_rate, studio_rate, valid_from, valid_to, created_at, trainers(name), halls(name)')
    .order('ticket_type')
    .order('valid_from', { ascending: false })
  return {
    data: ((data as unknown as RateRow[] | null) ?? []).map(r => ({
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('trainer_rates')
    .update({ valid_to: null })
    .eq('id', id)
  return { error: error?.message ?? null }
}

// Залишаємо для зворотної сумісності зі старим кодом (rates/page.tsx)
export async function listTrainerRates(
  supabase: SupabaseClient
): Promise<{ data: TrainerRate[]; error: string | null }> {
  return listTrainerRatesActive(supabase)
}

export async function deleteTrainerRate(
  supabase: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trainer_rates').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// ─── Salary calculation ────────────────────────────────────────────────────────

// Старий RPC — залишаємо для зворотної сумісності
export async function calcTrainerSalary(
  supabase: SupabaseClient,
  trainerId: string,
  start: string,
  end: string
): Promise<{ data: TrainerSalaryRow[]; error: string | null }> {
  type SalaryRawRow = { ticket_type: string; sessions_total: number; rate: number | null; amount: number }

  const { data, error } = await supabase.rpc('calc_trainer_salary', {
    p_trainer_id: trainerId,
    p_start: start,
    p_end: end,
  })
  if (error || !data) return { data: [], error: error?.message ?? null }
  return {
    data: (data as unknown as SalaryRawRow[]).map(r => ({
      ticket_type: r.ticket_type,
      sessions_total: r.sessions_total,
      rate: r.rate ?? null,
      amount: r.amount,
    })),
    error: null,
  }
}

// Новий деталізований RPC — повертає рядки по кожному enrollment, згруповані по заняттях
export async function calcTrainerSalaryDetail(
  supabase: SupabaseClient,
  trainerId: string,
  start: string,
  end: string
): Promise<{ data: TrainerSalaryDetailRow[]; error: string | null }> {
  type DetailRawRow = {
    class_id: string; starts_at: string; ticket_type: string; hall_name: string | null;
    duration_min: number; client_id: string; client_name: string; enrollment_status: 'attended' | 'noshow';
    trainer_amount: number; studio_amount: number
  }

  const { data, error } = await supabase.rpc('calc_trainer_salary_v2', {
    p_trainer_id: trainerId,
    p_start: start,
    p_end: end,
  })
  if (error || !data) return { data: [], error: error?.message ?? null }

  // Групуємо по class_id
  const map = new Map<string, TrainerSalaryDetailRow>()
  for (const r of data as unknown as DetailRawRow[]) {
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
      status: r.enrollment_status,
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
  supabase: SupabaseClient,
  trainerId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ data: TrainerCashBalance; error: string | null }> {
  type SaleRow = {
    id: string; created_at: string; price_paid: number; ticket_name: string | null;
    clients: { first_name: string | null; last_name: string | null } | null
  }
  type ExpenseRow = {
    id: string; created_at: string; amount: number; description: string | null
  }
  type PaymentRow = {
    id: string; created_at: string; paid_amount: number; payment_date: string
  }

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

  const cashSales = ((salesRes.data as unknown as SaleRow[] | null) ?? []).map(s => ({
    id: s.id,
    created_at: s.created_at,
    client_name: [s.clients?.first_name, s.clients?.last_name].filter(Boolean).join(' ') || '—',
    ticket_name: s.ticket_name ?? null,
    amount: Number(s.price_paid),
  }))

  const expenses = ((expensesRes.data as unknown as ExpenseRow[] | null) ?? []).map(e => ({
    id: e.id,
    created_at: e.created_at,
    description: e.description ?? null,
    amount: Number(e.amount),
  }))

  const salaryPayments = ((paymentsRes.data as unknown as PaymentRow[] | null) ?? []).map(p => ({
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
  supabase: SupabaseClient,
  trainerId: string
): Promise<{ data: number; error: string | null }> {
  type SalesTotal = { price_paid: number }
  type ExpensesTotal = { amount: number }
  type PaymentsTotal = { paid_amount: number }

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

  const totalSales = ((salesRes.data as unknown as SalesTotal[] | null) ?? []).reduce((s, r) => s + Number(r.price_paid), 0)
  const totalExpenses = ((expensesRes.data as unknown as ExpensesTotal[] | null) ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const totalPaid = ((paymentsRes.data as unknown as PaymentsTotal[] | null) ?? []).reduce((s, r) => s + Number(r.paid_amount), 0)

  return { data: totalSales - totalExpenses - totalPaid, error }
}

// Баланси готівки всіх тренерів одним запитом (для /accounting)
export async function listAllCashBalances(
  supabase: SupabaseClient
): Promise<{ data: { trainer_id: string; trainer_name: string; balance: number }[]; error: string | null }> {
  type TrainerRow = { id: string; name: string }
  type SalesHolder = { cash_holder: string; price_paid: number }
  type ExpenseHolder = { cash_holder: string; amount: number }
  type PaymentHolder = { cash_holder: string; paid_amount: number }

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

  const trainers = (trainersRes.data as unknown as TrainerRow[] | null) ?? []

  const salesByHolder = new Map<string, number>()
  for (const s of (salesRes.data as unknown as SalesHolder[] | null) ?? []) {
    salesByHolder.set(s.cash_holder, (salesByHolder.get(s.cash_holder) ?? 0) + Number(s.price_paid))
  }

  const expensesByHolder = new Map<string, number>()
  for (const e of (expensesRes.data as unknown as ExpenseHolder[] | null) ?? []) {
    expensesByHolder.set(e.cash_holder, (expensesByHolder.get(e.cash_holder) ?? 0) + Number(e.amount))
  }

  const paidByHolder = new Map<string, number>()
  for (const p of (paymentsRes.data as unknown as PaymentHolder[] | null) ?? []) {
    paidByHolder.set(p.cash_holder, (paidByHolder.get(p.cash_holder) ?? 0) + Number(p.paid_amount))
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
export async function getTrainerTotalDebt(
  supabase: SupabaseClient,
  trainerId: string,
  totalAccrued: number
): Promise<{ data: number; error: string | null }> {
  type PaymentDebt = { paid_amount: number }

  const { data, error } = await supabase
    .from('trainer_payments')
    .select('paid_amount')
    .eq('trainer_id', trainerId)
  const totalPaid = ((data as unknown as PaymentDebt[] | null) ?? []).reduce((s, r) => s + Number(r.paid_amount), 0)
  return { data: totalAccrued - totalPaid, error: error?.message ?? null }
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function listTrainerPayments(
  supabase: SupabaseClient,
  trainerId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ data: TrainerPayment[]; error: string | null }> {
  const { data, error } = await supabase
    .from('trainer_payments')
    .select('*, trainers!trainer_payments_trainer_id_fkey(name)')
    .eq('trainer_id', trainerId)
    .lte('period_start', periodEnd)
    .gte('period_end', periodStart)
    .order('created_at', { ascending: false })
  return { data: (data ?? []) as TrainerPayment[], error: error?.message ?? null }
}

export async function listTrainerPaymentsForPeriod(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string
): Promise<{ data: TrainerPayment[]; error: string | null }> {
  const { data, error } = await supabase
    .from('trainer_payments')
    .select('*, trainers!trainer_payments_trainer_id_fkey(name)')
    .gte('payment_date', dateFrom)
    .lte('payment_date', dateTo)
    .order('payment_date', { ascending: false })
  return { data: (data ?? []) as TrainerPayment[], error: error?.message ?? null }
}

export async function updateTrainerPayment(
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trainer_payments').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export async function insertTrainerPayment(
  supabase: SupabaseClient,
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
