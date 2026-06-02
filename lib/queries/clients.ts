import type { Db } from '@/lib/queries/_db'
import type { Client } from '@/types'
import { sanitizePostgrestSearch } from './_escape'

export interface ListClientsParams {
  search: string
  page: number
  pageSize: number
}

export async function listClients(
  supabase: Db,
  { search, page, pageSize }: ListClientsParams
): Promise<{ data: Client[]; count: number; error: string | null }> {
  let query = supabase
    .from('clients')
    .select('id, first_name, last_name, phone, instagram_username, telegram_username, balance', { count: 'exact' })
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  if (search.trim()) {
    const s = sanitizePostgrestSearch(search)
    if (s) {
      query = query.or(
        `first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,instagram_username.ilike.%${s}%,telegram_username.ilike.%${s}%`
      )
    }
  }

  const rangeFrom = page * pageSize
  query = query.range(rangeFrom, rangeFrom + pageSize - 1)

  const { data, count, error } = await query
  return { data: (data as Client[]) ?? [], count: count ?? 0, error: error?.message ?? null }
}

export async function getClient(
  supabase: Db,
  id: string
): Promise<{ data: Client | null; error: string | null }> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, first_name, last_name, phone, instagram_username, telegram_username, balance, credit_limit, balance_updated_at')
    .eq('id', id)
    .maybeSingle()
  return { data: (data as Client) ?? null, error: error?.message ?? null }
}

export async function searchClientsByPhone(
  supabase: Db,
  phone: string,
  excludeId?: string
): Promise<{ data: { id: string; first_name: string; last_name: string }[]; error: string | null }> {
  let query = supabase
    .from('clients')
    .select('id, first_name, last_name')
    .eq('phone', phone)
    .limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query
  return { data: (data ?? []) as { id: string; first_name: string; last_name: string }[], error: error?.message ?? null }
}

export async function searchClientsByName(
  supabase: Db,
  firstName: string,
  lastName: string,
  excludeId?: string
): Promise<{ data: { id: string; phone: string | null }[]; error: string | null }> {
  let query = supabase
    .from('clients')
    .select('id, phone')
    .ilike('first_name', firstName)
    .ilike('last_name', lastName)
    .limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query
  return { data: (data ?? []) as { id: string; phone: string | null }[], error: error?.message ?? null }
}

export async function insertClient(
  supabase: Db,
  payload: { first_name: string; last_name: string; phone: string | null; instagram_username: string | null; telegram_username: string | null }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('clients').insert(payload)
  return { error: error?.message ?? null }
}

export async function updateClient(
  supabase: Db,
  id: string,
  payload: { first_name: string; last_name: string; phone: string | null; instagram_username: string | null; telegram_username: string | null }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('clients').update(payload).eq('id', id)
  return { error: error?.message ?? null }
}

/**
 * Пошук клієнтів для combobox: один токен → ilike по імені/прізвищу/телефону;
 * два токени → ім'я+прізвище в обох порядках (Іван Петров / Петров Іван), dedup.
 * Повертає до 10 результатів. Помилки ковтаються (UI-пошук, не критичний).
 */
export async function searchClientsForCombobox(
  supabase: Db,
  q: string
): Promise<Client[]> {
  const trimmed = sanitizePostgrestSearch(q)
  if (!trimmed) return []

  const parts = trimmed.split(/\s+/)

  if (parts.length === 1) {
    const p = parts[0]
    const { data } = await supabase
      .from('clients')
      .select('id,first_name,last_name,phone')
      .or(`first_name.ilike.%${p}%,last_name.ilike.%${p}%,phone.ilike.%${p}%`)
      .order('last_name')
      .limit(10)
    return (data ?? []) as Client[]
  }

  const [a, b] = parts
  const [r1, r2] = await Promise.all([
    supabase.from('clients').select('id,first_name,last_name,phone').ilike('first_name', `%${a}%`).ilike('last_name', `%${b}%`).order('last_name').limit(10),
    supabase.from('clients').select('id,first_name,last_name,phone').ilike('first_name', `%${b}%`).ilike('last_name', `%${a}%`).order('last_name').limit(10),
  ])
  const seen = new Set<string>()
  return [...(r1.data ?? []), ...(r2.data ?? [])].filter(c => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  }) as Client[]
}

/** Грошовий баланс клієнта (₴). null якщо не знайдено. */
export async function getClientBalance(
  supabase: Db,
  clientId: string
): Promise<number | null> {
  const { data } = await supabase.from('clients').select('balance').eq('id', clientId).single()
  return data?.balance ?? null
}
