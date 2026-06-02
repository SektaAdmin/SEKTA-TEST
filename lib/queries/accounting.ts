import type { QueryData } from '@supabase/supabase-js'
import type { Db } from '@/lib/queries/_db'
import type { PaymentMethod } from '@/types'
import { TRAINER_FK } from '@/lib/queries/_fk'
import type { StudioExpense } from '@/lib/queries/studio-expenses'
import type { TrainerPayment } from '@/lib/queries/trainer-rates'

/* Запити для звірки (/accounting). Feed = sales + studio_expenses + trainer_payments
   за один рахунок (метод оплати + опційно cash_holder) у діапазоні дат.
   Гроші — integer ₴, snapshot-поля (ticket_name/ticket_price) беремо як є.
   select-літерали (без template ${}) — QueryData парсить embed лише зі статики;
   FK вшито вручну + compile-time guard проти TRAINER_FK. */

const RECON_SALE_SELECT = `id, created_at, price_paid, amount_given, ticket_price, payment_method, ticket_id, ticket_name, trainer_id, cash_holder, clients(first_name, last_name), trainers!sales_trainer_id_fkey(name)` as const
const RECON_EXP_SELECT = `id, amount, direction, payment_method, trainer_id, cash_holder, description, created_at, trainers!studio_expenses_trainer_id_fkey(name)` as const
const RECON_PAY_SELECT = `id, trainer_id, cash_holder, period_start, period_end, calculated_amount, paid_amount, payment_date, payment_method, payment_type, notes, created_at, trainers!trainer_payments_trainer_id_fkey(name)` as const
const _fkChecks: [typeof TRAINER_FK.sales, typeof TRAINER_FK.expenses, typeof TRAINER_FK.payments] =
  ['sales_trainer_id_fkey', 'studio_expenses_trainer_id_fkey', 'trainer_payments_trainer_id_fkey']
void _fkChecks

function reconSaleQuery(supabase: Db) { return supabase.from('sales').select(RECON_SALE_SELECT) }

/** Row продажу для звірки — виведено зі схеми; payment_method звужено до union. */
export type ReconSaleRow = Omit<QueryData<ReturnType<typeof reconSaleQuery>>[number], 'payment_method'> & {
  payment_method: PaymentMethod
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
  supabase: Db,
  { method, holder, from, to }: ReconFilter
): Promise<{
  sales: ReconSaleRow[]
  expenses: StudioExpense[]
  payments: TrainerPayment[]
  error: string | null
}> {
  let salesQuery = reconSaleQuery(supabase)
    .eq('payment_method', method)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: false })
  if (from) salesQuery = salesQuery.gte('created_at', `${from}T00:00:00`)
  if (holder) salesQuery = salesQuery.eq('cash_holder', holder)

  let expQuery = supabase
    .from('studio_expenses')
    .select(RECON_EXP_SELECT)
    .eq('payment_method', method)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: false })
  if (from) expQuery = expQuery.gte('created_at', `${from}T00:00:00`)
  if (holder) expQuery = expQuery.eq('cash_holder', holder)

  let payQuery = supabase
    .from('trainer_payments')
    .select(RECON_PAY_SELECT)
    .eq('payment_method', method)
    .lte('payment_date', to)
    .order('payment_date', { ascending: false })
  if (from) payQuery = payQuery.gte('payment_date', from)
  if (holder) payQuery = payQuery.eq('cash_holder', holder)

  const [salesRes, expRes, payRes] = await Promise.all([salesQuery, expQuery, payQuery])

  // expenses/payments: той самий набір колонок, що в модулях-власниках —
  // union-звуження (direction/payment_method) до доменних StudioExpense/TrainerPayment.
  return {
    sales: (salesRes.data ?? []) as ReconSaleRow[],
    expenses: (expRes.data ?? []) as StudioExpense[],
    payments: (payRes.data ?? []) as TrainerPayment[],
    error: salesRes.error?.message ?? expRes.error?.message ?? payRes.error?.message ?? null,
  }
}
