import type { QueryData } from '@supabase/supabase-js'
import type { Db } from '@/lib/queries/_db'
import { sanitizePostgrestSearch } from './_escape'
import { callRpc } from '@/lib/rpc'
import { TRAINER_FK } from '@/lib/queries/_fk'

export interface ListSalesParams {
  page: number
  pageSize: number
  search: string
  dateFrom: string
  dateTo: string
  trainerId: string
}

// Літерал (НЕ template з ${}) — QueryData парсить embed лише зі статичного
// рядка. FK із TRAINER_FK.sales вшито вручну; узгодженість тримає тест нижче.
const SALE_SELECT = `
  id, created_at, client_id, ticket_id, trainer_id, cash_holder,
  ticket_name, ticket_price, ticket_type, sessions, price_paid, amount_given,
  payment_method, notes,
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

export async function listSales(
  supabase: Db,
  { page, pageSize, search, dateFrom, dateTo, trainerId }: ListSalesParams
): Promise<{ data: Sale[]; count: number; error: string | null }> {
  let clientIds: string[] | null = null

  if (search.trim()) {
    const ids = await searchClientIdsByName(supabase, search)
    if (ids !== null) {
      if (ids.length === 0) return { data: [], count: 0, error: null }
      clientIds = ids
    }
  }

  const rangeFrom = page * pageSize
  let query = supabase
    .from('sales')
    .select(SALE_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(rangeFrom, rangeFrom + pageSize - 1)

  if (clientIds !== null) query = query.in('client_id', clientIds)
  if (dateFrom)  query = query.gte('created_at', `${dateFrom}T00:00:00`)
  if (dateTo)    query = query.lte('created_at', `${dateTo}T23:59:59`)
  if (trainerId) query = query.eq('trainer_id', trainerId)

  const { data, count, error } = await query
  return {
    data: data ?? [],
    count: count ?? 0,
    error: error?.message ?? null,
  }
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
