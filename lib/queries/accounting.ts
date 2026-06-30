import type { QueryData } from '@supabase/supabase-js'
import type { Db } from '@/lib/queries/_db'
import type { PaymentMethod } from '@/types'
import { TRAINER_FK } from '@/lib/queries/_fk'
import type { StudioExpense } from '@/lib/queries/studio-expenses'
import type { TrainerPayment } from '@/lib/queries/trainer-rates'
import { kyivDayUtcBounds } from '@/lib/dateUtils'

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

/** Баланс одного рахунку з ідентифікатором/назвою — для відображення блоком. */
export interface AccountBalance {
  key: string
  label: string
  income: number
  outcome: number
  balance: number
  error: string | null
}

/** Баланс рахунку за вибраний період — рахує Postgres (`accounting_balance`),
    клієнт не перебирає тисячі рядків. Без меж дат (from/to = '') — за всю історію.
    Межі — київська доба (як у feed), щоб баланс і список збігалися. */
export async function getAccountingBalance(
  supabase: Db,
  { method, holder, from, to }: { method: PaymentMethod; holder: string | null; from?: string; to?: string }
): Promise<{ income: number; outcome: number; balance: number; error: string | null }> {
  const { data, error } = await supabase.rpc('accounting_balance', {
    p_method: method,
    p_holder: holder ?? undefined,
    p_from: from ? kyivDayUtcBounds(from).from : undefined,
    p_to: to ? kyivDayUtcBounds(to).to : undefined,
  })
  const row = (data as { income: number; outcome: number; balance: number }[] | null)?.[0]
  return {
    income: row?.income ?? 0,
    outcome: row?.outcome ?? 0,
    balance: row?.balance ?? 0,
    error: error?.message ?? null,
  }
}

/** Уніфікований feed-рядок зі збереженням типу-власника (kind-дискримінант). */
export type FeedRow =
  | { kind: 'sale'; data: ReconSaleRow }
  | { kind: 'expense'; data: StudioExpense }
  | { kind: 'payment'; data: TrainerPayment }

/** Сторінка хронологічного feed (sales+expenses+payments). `accounting_feed_page`
    повертає впорядковані (kind,id) поточної сторінки + total_count; повні рядки з
    embed дотягуємо тут через .in('id', …) (лише ≤pageSize id на тип) і
    перевпорядковуємо за порядком RPC. */
export async function listReconciliationFeedPage(
  supabase: Db,
  { method, holder, from, to }: ReconFilter,
  page: number,
  pageSize: number
): Promise<{ rows: FeedRow[]; count: number; error: string | null }> {
  const { data: ids, error: feedErr } = await supabase.rpc('accounting_feed_page', {
    p_method: method,
    p_holder: holder ?? undefined,
    p_from: from ? kyivDayUtcBounds(from).from : undefined,
    p_to: to ? kyivDayUtcBounds(to).to : undefined,
    p_limit: pageSize,
    p_offset: page * pageSize,
  })
  if (feedErr) return { rows: [], count: 0, error: feedErr.message }

  const idRows = (ids ?? []) as { kind: 'sale' | 'expense' | 'payment'; id: string; total_count: number }[]
  const count = idRows[0]?.total_count ?? 0
  if (idRows.length === 0) return { rows: [], count: 0, error: null }

  const saleIds = idRows.filter(r => r.kind === 'sale').map(r => r.id)
  const expIds = idRows.filter(r => r.kind === 'expense').map(r => r.id)
  const payIds = idRows.filter(r => r.kind === 'payment').map(r => r.id)

  const [salesRes, expRes, payRes] = await Promise.all([
    saleIds.length ? reconSaleQuery(supabase).in('id', saleIds) : Promise.resolve({ data: [], error: null }),
    expIds.length ? supabase.from('studio_expenses').select(RECON_EXP_SELECT).in('id', expIds) : Promise.resolve({ data: [], error: null }),
    payIds.length ? supabase.from('trainer_payments').select(RECON_PAY_SELECT).in('id', payIds) : Promise.resolve({ data: [], error: null }),
  ])

  const error = salesRes.error?.message ?? expRes.error?.message ?? payRes.error?.message ?? null
  if (error) return { rows: [], count, error }

  // Мапи id→рядок, щоб відтворити точний порядок із RPC (single source of truth).
  const saleMap = new Map((salesRes.data as ReconSaleRow[]).map(s => [s.id, s]))
  const expMap = new Map((expRes.data as StudioExpense[]).map(e => [e.id, e]))
  const payMap = new Map((payRes.data as TrainerPayment[]).map(p => [p.id, p]))

  const rows: FeedRow[] = []
  for (const r of idRows) {
    if (r.kind === 'sale') { const d = saleMap.get(r.id); if (d) rows.push({ kind: 'sale', data: d }) }
    else if (r.kind === 'expense') { const d = expMap.get(r.id); if (d) rows.push({ kind: 'expense', data: d }) }
    else { const d = payMap.get(r.id); if (d) rows.push({ kind: 'payment', data: d }) }
  }

  return { rows, count, error: null }
}
