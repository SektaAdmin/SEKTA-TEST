import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Уніфікована розпаковка TABLE-RPC.
 *
 * Усі бізнес-RPC повертають `TABLE(success boolean, error_message text, ...)` —
 * один рядок у `data[0]`. Помилка бізнес-логіки приходить як `success=false`
 * (НЕ як SQL-error). Цей хелпер зводить обидва канали (SQL-error + success=false)
 * до одного `{ row, success, error }`.
 *
 * Виклик дає сирий `row`, щоб caller витяг свої поля (charged, restored_count, …)
 * і за потреби підмінив дефолтне повідомлення (`fallback`).
 *
 * @example
 *   const { row, success, error } = await callRpc<{ success: boolean; charged: boolean }>(
 *     () => supabase.rpc('change_enrollment_status', params)
 *   )
 *   if (!success) return { success: false, charged: false, error }
 *   return { success: true, charged: row?.charged ?? false, error: null }
 */
export async function callRpc<R extends { success?: boolean; error_message?: string | null }>(
  fn: () => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
  fallback = 'Помилка'
): Promise<{ row: R | null; success: boolean; error: string | null }> {
  const { data, error } = await fn()
  const row = (data as R[] | null)?.[0] ?? null
  // Невдача = SQL-error, або немає рядка, або success явно false.
  if (error || !row || row.success === false) {
    return { row, success: false, error: row?.error_message ?? error?.message ?? fallback }
  }
  return { row, success: true, error: null }
}
