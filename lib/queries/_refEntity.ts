import type { Db, Insert, Row } from '@/lib/queries/_db'
import type { Database } from '@/types/database.types'

type RefTable = keyof Database['public']['Tables']

/**
 * Фабрика CRUD-запитів для довідкових таблиць (halls/trainers/tickets/
 * training_types) — усі мають форму `{ id, …, is_active }` з м'яким видаленням.
 *
 * Колонки `select` і порядок сортування живуть в одному місці (тут, на виклику),
 * а не дублюються по сторінці/хуку/queries. Повертає набір типізованих функцій;
 * специфічні запити (Labels, кастомний insert) додавай поруч у файлі сутності.
 *
 * Перший generic — ім'я таблиці (літерал → строга типізація .from()/insert),
 * другий — доменний row-тип, який бачить споживач (за замовч. Row<TName>).
 *
 * @example
 *   const { list, listActive, toggle, insert } = refEntityQueries<'halls', Hall>(
 *     'halls', 'id, name, capacity, description, is_active', { orderBy: 'name' }
 *   )
 */
export function refEntityQueries<TName extends RefTable, T = Row<TName>>(
  table: TName,
  columns: string,
  opts: { orderBy: string; ascending?: boolean } = { orderBy: 'name' }
) {
  const { orderBy, ascending = true } = opts

  async function list(
    supabase: Db
  ): Promise<{ data: T[]; error: string | null }> {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending })
    return { data: (data as T[]) ?? [], error: error?.message ?? null }
  }

  async function listActive(
    supabase: Db
  ): Promise<{ data: T[]; error: string | null }> {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('is_active' as never, true)
      .order(orderBy, { ascending })
    return { data: (data as T[]) ?? [], error: error?.message ?? null }
  }

  // table — generic TName, тож supabase-js не може звузити overload .update/
  // .insert/.eq (їх аргумент стає union усіх таблиць → перетин = never). Тип
  // на МЕЖІ фабрики строгий (Insert<TName> на вході, T на виході); cast лише
  // на самих PostgREST-викликах, де generic-таблиця принципово не виводиться.
  async function toggle(
    supabase: Db,
    id: string,
    isActive: boolean
  ): Promise<{ error: string | null }> {
    const { error } = await supabase.from(table).update({ is_active: isActive } as never).eq('id' as never, id)
    return { error: error?.message ?? null }
  }

  async function insert(
    supabase: Db,
    payload: Insert<TName>
  ): Promise<{ error: string | null }> {
    const { error } = await supabase.from(table).insert(payload as never)
    return { error: error?.message ?? null }
  }

  return { list, listActive, toggle, insert }
}
