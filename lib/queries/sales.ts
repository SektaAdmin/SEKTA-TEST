import type { SupabaseClient } from '@supabase/supabase-js'
import type { Sale } from '@/types'
import { sanitizePostgrestSearch } from './_escape'
import { callRpc } from '@/lib/rpc'

export interface ListSalesParams {
  page: number
  pageSize: number
  search: string
  dateFrom: string
  dateTo: string
  trainerId: string
}

export async function searchClientIdsByName(
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
    .select(`
      id, created_at, client_id, ticket_id, trainer_id,
      ticket_name, ticket_price, ticket_type, sessions, price_paid, amount_given,
      payment_method, notes,
      clients(first_name, last_name),
      tickets(name),
      trainers!sales_trainer_id_fkey(name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(rangeFrom, rangeFrom + pageSize - 1)

  if (clientIds !== null) query = query.in('client_id', clientIds)
  if (dateFrom)  query = query.gte('created_at', `${dateFrom}T00:00:00`)
  if (dateTo)    query = query.lte('created_at', `${dateTo}T23:59:59`)
  if (trainerId) query = query.eq('trainer_id', trainerId)

  const { data, count, error } = await query
  return {
    data: (data as unknown as Sale[]) ?? [],
    count: count ?? 0,
    error: error?.message ?? null,
  }
}

export async function listSalesForClient(
  supabase: SupabaseClient,
  clientId: string,
  page: number,
  pageSize: number
): Promise<{ data: Sale[]; count: number; error: string | null }> {
  const from = page * pageSize
  const { data, count, error } = await supabase
    .from('sales')
    .select(
      'id, created_at, client_id, ticket_id, trainer_id, ticket_name, ticket_price, ticket_type, sessions, price_paid, amount_given, payment_method, notes, clients(first_name, last_name), tickets(name), trainers!sales_trainer_id_fkey(name)',
      { count: 'exact' }
    )
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)
  return { data: (data as unknown as Sale[]) ?? [], count: count ?? 0, error: error?.message ?? null }
}

export type FeedSale = {
  id: string
  created_at: string
  ticket_name: string | null
  ticket_type: string | null
  sessions: number | null
  price_paid: number
  amount_given: number
  payment_method: string
  trainers: { name: string } | null
}

export async function listAllSalesForFeed(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ data: FeedSale[]; error: string | null }> {
  const { data, error } = await supabase
    .from('sales')
    .select('id, created_at, ticket_name, ticket_type, sessions, price_paid, amount_given, payment_method, trainers!sales_trainer_id_fkey(name)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  return { data: (data as unknown as FeedSale[]) ?? [], error: error?.message ?? null }
}

export async function listSalesForAccounting(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string
): Promise<{ data: { created_at: string; price_paid: number; amount_given: number; payment_method: string; ticket_id: string | null }[]; error: string | null }> {
  type SalesAccounting = {
    created_at: string; price_paid: number; amount_given: number; payment_method: string; ticket_id: string | null
  }

  const { data, error } = await supabase
    .from('sales')
    .select('created_at, price_paid, amount_given, payment_method, ticket_id')
    .gte('created_at', `${dateFrom}T00:00:00`)
    .lte('created_at', `${dateTo}T23:59:59`)
  return { data: (data as unknown as SalesAccounting[] | null) ?? [], error: error?.message ?? null }
}

export async function listSalesForTrainers(
  supabase: SupabaseClient,
  start: string,
  end: string
): Promise<{ data: { trainer_id: string; sessions: number | null; price_paid: number; payment_method: string; ticket_type: string | null; trainers: { name: string } | null }[]; error: string | null }> {
  type SalesTrainer = {
    trainer_id: string; sessions: number | null; price_paid: number; payment_method: string; ticket_type: string | null; trainers: { name: string } | null
  }

  const { data, error } = await supabase
    .from('sales')
    .select('trainer_id, sessions, price_paid, payment_method, ticket_type, trainers!sales_trainer_id_fkey(name)')
    .not('trainer_id', 'is', null)
    .not('ticket_id', 'is', null)
    .gte('created_at', start)
    .lte('created_at', end)
  return { data: (data as unknown as SalesTrainer[] | null) ?? [], error: error?.message ?? null }
}

export async function createSale(
  supabase: SupabaseClient,
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
  const { success, error } = await callRpc(() => supabase.rpc('create_sale', params), 'Помилка збереження')
  return { success, error }
}

export async function updateSale(
  supabase: SupabaseClient,
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
  const { success, error } = await callRpc(() => supabase.rpc('update_sale', params), 'Помилка збереження')
  return { success, error }
}

export async function deleteSale(
  supabase: SupabaseClient,
  saleId: string
): Promise<{ success: boolean; error: string | null }> {
  const { success, error } = await callRpc(() => supabase.rpc('delete_sale', { p_sale_id: saleId }), 'Помилка видалення')
  return { success, error }
}

export type ReconciliationSale = {
  id: string
  created_at: string
  price_paid: number
  amount_given: number
  payment_method: string
  ticket_id: string | null
  ticket_name: string | null
  clients: { first_name: string | null; last_name: string | null } | null
}

export async function listSalesForReconciliation(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string,
  methods: ('fop' | 'personal_card')[]
): Promise<{ data: ReconciliationSale[]; error: string | null }> {
  const { data, error } = await supabase
    .from('sales')
    .select('id, created_at, price_paid, amount_given, payment_method, ticket_id, ticket_name, clients(first_name, last_name)')
    .in('payment_method', methods)
    .gte('created_at', `${dateFrom}T00:00:00`)
    .lte('created_at', `${dateTo}T23:59:59`)
    .order('created_at', { ascending: false })
  return { data: (data as unknown as ReconciliationSale[]) ?? [], error: error?.message ?? null }
}

export async function getTicketById(
  supabase: SupabaseClient,
  ticketId: string
): Promise<{ data: { name: string; price: number; sessions: number; ticket_type: string } | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tickets')
    .select('name,price,sessions,ticket_type')
    .eq('id', ticketId)
    .maybeSingle()
  return { data: data ?? null, error: error?.message ?? null }
}
