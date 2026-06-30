import type { Db } from '@/lib/queries/_db'
import type { Client } from '@/types'
import { sanitizePostgrestSearch } from './_escape'

/**
 * Будує PostgREST-фільтр для пошуку клієнта за вільним текстом.
 * Один токен → ilike по імені/прізвищу/телефону/нікнеймах.
 * Кілька токенів → перший+решта як ім'я+прізвище в обох порядках
 * (напр. «Діана К» знайде «Діана Кисільова», «Кисільова Діана» — теж).
 * Повертає null, якщо запит порожній після санітизації.
 */
function buildClientSearchFilter(q: string): string | null {
  const trimmed = sanitizePostgrestSearch(q)
  if (!trimmed) return null

  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    const p = parts[0]
    return `first_name.ilike.%${p}%,last_name.ilike.%${p}%,phone.ilike.%${p}%,instagram_username.ilike.%${p}%,telegram_username.ilike.%${p}%`
  }

  const a = parts[0]
  const b = parts.slice(1).join(' ')
  return `and(first_name.ilike.%${a}%,last_name.ilike.%${b}%),and(first_name.ilike.%${b}%,last_name.ilike.%${a}%)`
}

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
    .from('clients_with_contacts')
    .select('id, first_name, last_name, phone, instagram_username, telegram_username, balance', { count: 'exact' })
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  const filter = buildClientSearchFilter(search)
  if (filter) {
    query = query.or(filter)
  }

  const rangeFrom = page * pageSize
  query = query.range(rangeFrom, rangeFrom + pageSize - 1)

  const { data, count, error } = await query
  return { data: (data as Client[]) ?? [], count: count ?? 0, error: error?.message ?? null }
}

export async function searchClientsByPhone(
  supabase: Db,
  phone: string,
  excludeId?: string
): Promise<{ data: { id: string; first_name: string; last_name: string }[]; error: string | null }> {
  let query = supabase
    .from('clients_with_contacts')
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
    .from('clients_with_contacts')
    .select('id, phone')
    .ilike('first_name', firstName)
    .ilike('last_name', lastName)
    .limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query
  return { data: (data ?? []) as { id: string; phone: string | null }[], error: error?.message ?? null }
}

interface ClientPayload {
  first_name: string
  last_name: string
  phone: string | null
  instagram_username: string | null
  telegram_username: string | null
}

export async function insertClient(
  supabase: Db,
  payload: ClientPayload
): Promise<{ error: string | null }> {
  const { first_name, last_name, phone, instagram_username, telegram_username } = payload
  const { data, error } = await supabase
    .from('clients')
    .insert({ first_name, last_name })
    .select('id')
    .single()
  if (error) return { error: error.message }

  const { error: contactError } = await supabase
    .from('client_contacts')
    .insert({ client_id: data.id, phone, instagram_username, telegram_username })
  return { error: contactError?.message ?? null }
}

export async function updateClient(
  supabase: Db,
  id: string,
  payload: ClientPayload
): Promise<{ error: string | null }> {
  const { first_name, last_name, phone, instagram_username, telegram_username } = payload
  const { error } = await supabase
    .from('clients')
    .update({ first_name, last_name })
    .eq('id', id)
  if (error) return { error: error.message }

  // upsert: картка могла бути створена до появи client_contacts
  const { error: contactError } = await supabase
    .from('client_contacts')
    .upsert({ client_id: id, phone, instagram_username, telegram_username })
  return { error: contactError?.message ?? null }
}

/**
 * Пошук клієнтів для combobox: один токен → ilike по імені/прізвищу/телефону;
 * кілька токенів → ім'я+прізвище в обох порядках (Іван Петров / Петров Іван).
 * Повертає до 10 результатів. Помилки ковтаються (UI-пошук, не критичний).
 * Використовує той самий фільтр, що й /clients (buildClientSearchFilter).
 */
export async function searchClientsForCombobox(
  supabase: Db,
  q: string
): Promise<Client[]> {
  const filter = buildClientSearchFilter(q)
  if (!filter) return []

  const { data } = await supabase
    .from('clients_with_contacts')
    .select('id,first_name,last_name,phone')
    .or(filter)
    .order('last_name')
    .limit(10)
  return (data ?? []) as Client[]
}

/** Грошовий баланс клієнта (₴). null якщо не знайдено. */
export async function getClientBalance(
  supabase: Db,
  clientId: string
): Promise<number | null> {
  const { data } = await supabase.from('clients').select('balance').eq('id', clientId).single()
  return data?.balance ?? null
}
