import type { Db } from '@/lib/queries/_db'
import { callRpc } from '@/lib/rpc'

/**
 * Запис клієнта на заняття з його кабінету (RPC client_enroll — логіка/гейти в БД:
 * є оплачені заняття потрібного типу, без конфлікту, не в мінус). Машинні коди
 * помилок (`no_sessions`/`conflict`/`duplicate`) лишаємо як є — людський текст
 * формує компонент.
 */
export async function clientEnroll(
  supabase: Db,
  classId: string
): Promise<{ success: boolean; enrollmentId: string | null; error: string | null }> {
  const { row, success, error } = await callRpc<{
    success: boolean; error_message: string | null; enrollment_id: string | null
  }>(() => supabase.rpc('client_enroll', { p_class_id: classId }))
  if (!success) return { success: false, enrollmentId: null, error }
  return { success: true, enrollmentId: row?.enrollment_id ?? null, error: null }
}

/**
 * Відміна клієнтом свого запису (RPC client_cancel → делегує в change_enrollment_status).
 * `charged` = чи списано сесію (після дедлайну). Фронт показує попередження ДО виклику.
 */
export async function clientCancel(
  supabase: Db,
  enrollmentId: string
): Promise<{ success: boolean; charged: boolean; error: string | null }> {
  const { row, success, error } = await callRpc<{
    success: boolean; error_message: string | null; charged: boolean
  }>(() => supabase.rpc('client_cancel', { p_enrollment_id: enrollmentId }))
  if (!success) return { success: false, charged: false, error }
  return { success: true, charged: row?.charged ?? false, error: null }
}
