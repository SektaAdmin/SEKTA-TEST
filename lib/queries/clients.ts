import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from '@/types'

export interface ListClientsParams {
  search: string
  page: number
  pageSize: number
}

export async function listClients(
  supabase: SupabaseClient,
  { search, page, pageSize }: ListClientsParams
): Promise<{ data: Client[]; count: number; error: string | null }> {
  let query = supabase
    .from('clients')
    .select('id, first_name, last_name, phone, instagram_username, telegram_username, balance', { count: 'exact' })
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  if (search.trim()) {
    const s = search.trim()
    query = query.or(
      `first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,instagram_username.ilike.%${s}%,telegram_username.ilike.%${s}%`
    )
  }

  const rangeFrom = page * pageSize
  query = query.range(rangeFrom, rangeFrom + pageSize - 1)

  const { data, count, error } = await query
  return { data: (data as Client[]) ?? [], count: count ?? 0, error: error?.message ?? null }
}

export async function getClient(
  supabase: SupabaseClient,
  id: string
): Promise<Client | null> {
  const { data } = await supabase
    .from('clients')
    .select('id, first_name, last_name, phone, instagram_username, telegram_username, balance, credit_limit, balance_updated_at')
    .eq('id', id)
    .single()
  return (data as Client) ?? null
}

export async function searchClientsByPhone(
  supabase: SupabaseClient,
  phone: string,
  excludeId?: string
): Promise<{ id: string; first_name: string; last_name: string }[]> {
  let query = supabase
    .from('clients')
    .select('id, first_name, last_name')
    .eq('phone', phone)
    .limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data } = await query
  return (data ?? []) as { id: string; first_name: string; last_name: string }[]
}

export async function searchClientsByName(
  supabase: SupabaseClient,
  firstName: string,
  lastName: string,
  excludeId?: string
): Promise<{ id: string; phone: string | null }[]> {
  let query = supabase
    .from('clients')
    .select('id, phone')
    .ilike('first_name', firstName)
    .ilike('last_name', lastName)
    .limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data } = await query
  return (data ?? []) as { id: string; phone: string | null }[]
}

export async function insertClient(
  supabase: SupabaseClient,
  payload: { first_name: string; last_name: string; phone: string | null; instagram_username: string | null; telegram_username: string | null }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('clients').insert(payload)
  return { error: error?.message ?? null }
}

export async function updateClient(
  supabase: SupabaseClient,
  id: string,
  payload: { first_name: string; last_name: string; phone: string | null; instagram_username: string | null; telegram_username: string | null }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('clients').update(payload).eq('id', id)
  return { error: error?.message ?? null }
}
