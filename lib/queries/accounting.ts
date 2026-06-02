import type { SupabaseClient } from '@supabase/supabase-js'
import type { PaymentMethod } from '@/types'
import type { StudioExpense } from '@/lib/queries/studio-expenses'
import type { TrainerPayment } from '@/lib/queries/trainer-rates'

/* Запити для звірки (/accounting). Feed = sales + studio_expenses + trainer_payments
   за один рахунок (метод оплати + опційно cash_holder) у діапазоні дат.
   Гроші — integer ₴, snapshot-поля (ticket_name/ticket_price) беремо як є. */

export type ReconSaleRow = {
  id: string
  created_at: string
  price_paid: number
  amount_given: number
  ticket_price: number | null
  payment_method: PaymentMethod
  ticket_id: string | null
  ticket_name: string | null
  trainer_id: string | null
  cash_holder: string | null
  clients: { first_name: string | null; last_name: string | null } | null
  trainers: { name: string } | null
}

export interface ReconFilter {
  /** метод оплати рахунку */
  method: PaymentMethod
  /** cash_holder (trainer.id) — лише для cash-рахунків, інакше null */
  holder: string | null
  /** РРРР-ММ-ДД, '' = без нижньої межі */
  from: string
  /** РРРР-ММ-ДД, верхня межа (включно) */
  to: string
}

export async function listReconciliationFeed(
  supabase: SupabaseClient,
  { method, holder, from, to }: ReconFilter
): Promise<{
  sales: ReconSaleRow[]
  expenses: StudioExpense[]
  payments: TrainerPayment[]
  error: string | null
}> {
  let salesQuery = supabase
    .from('sales')
    .select('id, created_at, price_paid, amount_given, ticket_price, payment_method, ticket_id, ticket_name, trainer_id, cash_holder, clients(first_name, last_name), trainers!sales_trainer_id_fkey(name)')
    .eq('payment_method', method)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: false })
  if (from) salesQuery = salesQuery.gte('created_at', `${from}T00:00:00`)
  if (holder) salesQuery = salesQuery.eq('cash_holder', holder)

  let expQuery = supabase
    .from('studio_expenses')
    .select('id, amount, direction, payment_method, trainer_id, cash_holder, description, created_at, trainers!studio_expenses_trainer_id_fkey(name)')
    .eq('payment_method', method)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: false })
  if (from) expQuery = expQuery.gte('created_at', `${from}T00:00:00`)
  if (holder) expQuery = expQuery.eq('cash_holder', holder)

  let payQuery = supabase
    .from('trainer_payments')
    .select('id, trainer_id, cash_holder, period_start, period_end, calculated_amount, paid_amount, payment_date, payment_method, payment_type, notes, created_at, trainers(name)')
    .eq('payment_method', method)
    .lte('payment_date', to)
    .order('payment_date', { ascending: false })
  if (from) payQuery = payQuery.gte('payment_date', from)
  if (holder) payQuery = payQuery.eq('cash_holder', holder)

  const [salesRes, expRes, payRes] = await Promise.all([salesQuery, expQuery, payQuery])

  return {
    sales: (salesRes.data ?? []) as unknown as ReconSaleRow[],
    expenses: (expRes.data ?? []) as unknown as StudioExpense[],
    payments: (payRes.data ?? []) as unknown as TrainerPayment[],
    error: salesRes.error?.message ?? expRes.error?.message ?? payRes.error?.message ?? null,
  }
}
