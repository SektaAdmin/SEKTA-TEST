import type { Db } from '@/lib/queries/_db'
import type { TrainingType } from '@/types'
import { refEntityQueries } from './_refEntity'

const q = refEntityQueries<'training_types', TrainingType>(
  'training_types',
  'id, code, label, is_active, sort_order, created_at',
  { orderBy: 'sort_order' }
)

export const listTrainingTypes = q.list
export const listActiveTrainingTypes = q.listActive
export const toggleTrainingType = q.toggle

export async function listTrainingTypeLabels(
  supabase: Db
): Promise<{ data: Record<string, string>; error: string | null }> {
  const { data, error } = await supabase
    .from('training_types')
    .select('code, label')
  const map: Record<string, string> = {}
  for (const t of (data ?? []) as { code: string; label: string }[]) map[t.code] = t.label
  return { data: map, error: error?.message ?? null }
}

export async function insertTrainingType(
  supabase: Db,
  payload: { code: string; label: string }
): Promise<{ error: string | null }> {
  return q.insert(supabase, payload)
}

export async function updateTrainingType(
  supabase: Db,
  id: string,
  label: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('training_types').update({ label }).eq('id', id)
  return { error: error?.message ?? null }
}

export async function reorderTrainingTypes(
  supabase: Db,
  ids: string[],
  orders: number[]
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_training_type_sort_orders', {
    p_ids: ids,
    p_orders: orders,
  })
  return { error: error?.message ?? null }
}
