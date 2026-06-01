import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Фабрика CRUD-запитів для довідкових таблиць (halls/trainers/tickets/
 * training_types) — усі мають форму `{ id, …, is_active }` з м'яким видаленням.
 *
 * Колонки `select` і порядок сортування живуть в одному місці (тут, на виклику),
 * а не дублюються по сторінці/хуку/queries. Повертає набір типізованих функцій;
 * специфічні запити (Labels, кастомний insert) додавай поруч у файлі сутності.
 *
 * @example
 *   const { list, listActive, toggle, insert } = refEntityQueries<Hall>(
 *     'halls', 'id, name, capacity, description, is_active', { orderBy: 'name' }
 *   )
 */
export function refEntityQueries<T>(
  table: string,
  columns: string,
  opts: { orderBy: string; ascending?: boolean } = { orderBy: 'name' }
) {
  const { orderBy, ascending = true } = opts

  async function list(
    supabase: SupabaseClient
  ): Promise<{ data: T[]; error: string | null }> {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending })
    return { data: (data as T[]) ?? [], error: error?.message ?? null }
  }

  async function listActive(
    supabase: SupabaseClient
  ): Promise<{ data: T[]; error: string | null }> {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('is_active', true)
      .order(orderBy, { ascending })
    return { data: (data as T[]) ?? [], error: error?.message ?? null }
  }

  async function toggle(
    supabase: SupabaseClient,
    id: string,
    isActive: boolean
  ): Promise<{ error: string | null }> {
    const { error } = await supabase.from(table).update({ is_active: isActive }).eq('id', id)
    return { error: error?.message ?? null }
  }

  async function insert(
    supabase: SupabaseClient,
    payload: Record<string, unknown>
  ): Promise<{ error: string | null }> {
    const { error } = await supabase.from(table).insert(payload)
    return { error: error?.message ?? null }
  }

  return { list, listActive, toggle, insert }
}
