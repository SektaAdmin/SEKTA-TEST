import type { QueryData } from '@supabase/supabase-js'
import type { Db } from '@/lib/queries/_db'
import { sanitizePostgrestSearch } from './_escape'
import { callRpc } from '@/lib/rpc'
import { TRAINER_FK } from '@/lib/queries/_fk'
import type { StudioExpense } from '@/lib/queries/studio-expenses'
import { kyivDayUtcBounds } from '@/lib/dateUtils'

// Літерал (НЕ template з ${}) — QueryData парсить embed лише зі статичного
// рядка. FK із TRAINER_FK.sales вшито вручну; узгодженість тримає тест нижче.
const SALE_SELECT = `
  id, created_at, client_id, ticket_id, trainer_id, cash_holder,
  ticket_name, ticket_price, ticket_type, sessions, price_paid, amount_given,
  payment_method, notes,
  receipt_number, receipt_url, session_balance_snapshot,
  clients(first_name, last_name),
  tickets(name),
  trainers!sales_trainer_id_fkey(name)
` as const

// Compile-time guard: вшитий FK = канонічний TRAINER_FK.sales.
const _saleFkCheck: typeof TRAINER_FK.sales = 'sales_trainer_id_fkey'
void _saleFkCheck

/**
 * Row продажу з усіма embed — тип ВИВЕДЕНО зі схеми через QueryData (джерело
 * істини = сам .select(), не ручний інтерфейс). Реекспортується як Sale.
 */
export type Sale = QueryData<ReturnType<typeof saleListQuery>>[number]

function saleListQuery(supabase: Db) {
  return supabase.from('sales').select(SALE_SELECT)
}

async function searchClientIdsByName(
  supabase: Db,
  search: string
): Promise<string[] | null> {
  const s = sanitizePostgrestSearch(search)
  if (!s) return null
  const parts = s.split(/\s+/)
  let query = supabase.from('clients').select('id')
  if (parts.length === 1) {
    query = query.or(`first_name.ilike.%${parts[0]}%,last_name.ilike.%${parts[0]}%`)
  } else {
    const [a, b] = parts
    query = query.or(
      `first_name.ilike.%${a}%,last_name.ilike.%${b}%,` +
      `first_name.ilike.%${b}%,last_name.ilike.%${a}%`
    )
  }
  const { data: matched } = await query.limit(200)
  return (matched ?? []).map((c: { id: string }) => c.id)
}

/* ── Уніфікований feed (sales + studio_expenses) для /sales ──
   Дзеркалить listReconciliationFeedPage: sales_feed_page RPC віддає
   впорядковані (kind,id) сторінки + total_count; повні рядки з embed
   дотягуємо через .in('id', …) (лише ≤pageSize id на тип) і
   перевпорядковуємо за порядком RPC (single source of truth). */

const FEED_EXPENSE_SELECT = `id, amount, direction, payment_method, trainer_id, cash_holder, description, created_at, trainers!studio_expenses_trainer_id_fkey(name)` as const
const _feedExpFkCheck: typeof TRAINER_FK.expenses = 'studio_expenses_trainer_id_fkey'
void _feedExpFkCheck

export type SalesFeedRow =
  | { kind: 'sale'; data: Sale }
  | { kind: 'expense'; data: StudioExpense }

export interface SalesFeedParams {
  /** 'all' | 'sales' | 'expenses' */
  tab: 'all' | 'sales' | 'expenses'
  search: string
  dateFrom: string
  dateTo: string
  trainerId: string
  /** метод оплати — лише для expenses */
  expenseMethod: string
  page: number
  pageSize: number
}

export async function listSalesFeedPage(
  supabase: Db,
  { tab, search, dateFrom, dateTo, trainerId, expenseMethod, page, pageSize }: SalesFeedParams
): Promise<{ rows: SalesFeedRow[]; count: number; error: string | null }> {
  // Пошук за іменем застосовний лише до sales (expenses не мають клієнта).
  // Якщо є пошук і він нічого не знайшов — sales порожні; expenses теж
  // ховаємо (інакше «Все» показувало б операції попри активний пошук).
  let clientIds: string[] | null = null
  let searchHadNoMatch = false
  if (search.trim() && tab !== 'expenses') {
    const ids = await searchClientIdsByName(supabase, search)
    if (ids !== null) {
      if (ids.length === 0) searchHadNoMatch = true
      else clientIds = ids
    }
  }

  const includeSales = tab !== 'expenses' && !searchHadNoMatch
  const includeExpenses = tab !== 'sales' && !search.trim()

  if (!includeSales && !includeExpenses) return { rows: [], count: 0, error: null }

  const { data: ids, error: feedErr } = await supabase.rpc('sales_feed_page', {
    p_include_sales: includeSales,
    p_include_expenses: includeExpenses,
    p_client_ids: clientIds ?? undefined,
    p_trainer_id: trainerId || undefined,
    p_expense_method: expenseMethod || undefined,
    p_from: dateFrom ? kyivDayUtcBounds(dateFrom).from : undefined,
    p_to: dateTo ? kyivDayUtcBounds(dateTo).to : undefined,
    p_limit: pageSize,
    p_offset: page * pageSize,
  })
  if (feedErr) return { rows: [], count: 0, error: feedErr.message }

  const idRows = (ids ?? []) as { kind: 'sale' | 'expense'; id: string; total_count: number }[]
  const count = idRows[0]?.total_count ?? 0
  if (idRows.length === 0) return { rows: [], count: 0, error: null }

  const saleIds = idRows.filter(r => r.kind === 'sale').map(r => r.id)
  const expIds = idRows.filter(r => r.kind === 'expense').map(r => r.id)

  const [salesRes, expRes] = await Promise.all([
    saleIds.length ? saleListQuery(supabase).in('id', saleIds) : Promise.resolve({ data: [], error: null }),
    expIds.length ? supabase.from('studio_expenses').select(FEED_EXPENSE_SELECT).in('id', expIds) : Promise.resolve({ data: [], error: null }),
  ])

  const error = salesRes.error?.message ?? expRes.error?.message ?? null
  if (error) return { rows: [], count, error }

  const saleMap = new Map((salesRes.data as Sale[]).map(s => [s.id, s]))
  const expMap = new Map((expRes.data as StudioExpense[]).map(e => [e.id, e]))

  const rows: SalesFeedRow[] = []
  for (const r of idRows) {
    if (r.kind === 'sale') { const d = saleMap.get(r.id); if (d) rows.push({ kind: 'sale', data: d }) }
    else { const d = expMap.get(r.id); if (d) rows.push({ kind: 'expense', data: d }) }
  }

  return { rows, count, error: null }
}

export async function listSalesForClient(
  supabase: Db,
  clientId: string,
  page: number,
  pageSize: number
): Promise<{ data: Sale[]; count: number; error: string | null }> {
  const from = page * pageSize
  const { data, count, error } = await supabase
    .from('sales')
    .select(SALE_SELECT, { count: 'exact' })
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)
  return { data: data ?? [], count: count ?? 0, error: error?.message ?? null }
}

const FEED_SALE_SELECT = `id, created_at, ticket_name, ticket_type, sessions, price_paid, amount_given, payment_method, trainers!sales_trainer_id_fkey(name)` as const
export type FeedSale = QueryData<ReturnType<typeof feedSaleQuery>>[number]
function feedSaleQuery(supabase: Db) {
  return supabase.from('sales').select(FEED_SALE_SELECT)
}

export async function listAllSalesForFeed(
  supabase: Db,
  clientId: string
): Promise<{ data: FeedSale[]; error: string | null }> {
  const { data, error } = await feedSaleQuery(supabase)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  return { data: data ?? [], error: error?.message ?? null }
}

export async function createSale(
  supabase: Db,
  params: {
    p_client_id: string
    p_ticket_id: string | null
    p_trainer_id: string | null
    p_cash_holder: string | null
    p_price_paid: number
    p_amount_given: number
    p_payment_method: string
    p_notes: string
    p_created_at: string
  }
): Promise<{ success: boolean; error: string | null }> {
  // Усі optional-args create_sale мають DEFAULT NULL/0 у БД (nullable), але
  // генератор типізує їх як non-null T → null не проходить. Омісія (undefined)
  // = той самий DEFAULT NULL.
  const { success, error } = await callRpc(() => supabase.rpc('create_sale', {
    p_client_id: params.p_client_id,
    p_ticket_id: params.p_ticket_id ?? undefined,
    p_trainer_id: params.p_trainer_id ?? undefined,
    p_cash_holder: params.p_cash_holder ?? undefined,
    p_price_paid: params.p_price_paid,
    p_amount_given: params.p_amount_given,
    p_payment_method: params.p_payment_method,
    p_notes: params.p_notes,
    p_created_at: params.p_created_at,
  }), 'Помилка збереження')
  return { success, error }
}

export async function updateSale(
  supabase: Db,
  params: {
    p_sale_id: string
    p_client_id: string
    p_ticket_id: string | null
    p_trainer_id: string | null
    p_cash_holder: string | null
    p_ticket_name: string | null
    p_ticket_price: number
    p_sessions: number
    p_ticket_type: string | null
    p_price_paid: number
    p_amount_given: number
    p_payment_method: string
    p_notes: string
    p_created_at: string
  }
): Promise<{ success: boolean; error: string | null }> {
  const { success, error } = await callRpc(() => supabase.rpc('update_sale', {
    p_sale_id: params.p_sale_id,
    p_client_id: params.p_client_id,
    // p_ticket_id/p_trainer_id у БД nullable (депозитний продаж = null), але
    // генератор типізує їх non-null (немає DEFAULT). null тут легітимний.
    p_ticket_id: params.p_ticket_id as string,
    p_trainer_id: params.p_trainer_id as string,
    p_cash_holder: params.p_cash_holder ?? undefined,
    p_ticket_name: params.p_ticket_name ?? undefined,
    p_ticket_price: params.p_ticket_price,
    p_sessions: params.p_sessions,
    p_ticket_type: params.p_ticket_type ?? undefined,
    p_price_paid: params.p_price_paid,
    p_amount_given: params.p_amount_given,
    p_payment_method: params.p_payment_method,
    p_notes: params.p_notes,
    p_created_at: params.p_created_at,
  }), 'Помилка збереження')
  return { success, error }
}

export async function deleteSale(
  supabase: Db,
  saleId: string
): Promise<{ success: boolean; error: string | null }> {
  const { success, error } = await callRpc(() => supabase.rpc('delete_sale', { p_sale_id: saleId }), 'Помилка видалення')
  return { success, error }
}

export async function getTicketById(
  supabase: Db,
  ticketId: string
): Promise<{ data: { name: string; price: number; sessions: number; ticket_type: string } | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tickets')
    .select('name,price,sessions,ticket_type')
    .eq('id', ticketId)
    .maybeSingle()
  return { data: data ?? null, error: error?.message ?? null }
}

export type SessionBalance = { ticket_type: string; sessions_balance: number }

/** Залишки сесій по типах для клієнта (для snapshot у квитанції). */
export async function getClientSessionBalances(
  supabase: Db,
  clientId: string
): Promise<{ data: SessionBalance[]; error: string | null }> {
  const { data, error } = await supabase
    .from('client_session_balances')
    .select('ticket_type, sessions_balance')
    .eq('client_id', clientId)
  return { data: data ?? [], error: error?.message ?? null }
}
