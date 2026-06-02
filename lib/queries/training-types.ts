import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrainingType } from '@/types'
import { refEntityQueries } from './_refEntity'

const q = refEntityQueries<TrainingType>(
  'training_types',
  'id, code, label, is_active, sort_order, created_at',
  { orderBy: 'sort_order' }
)

export const listTrainingTypes = q.list
export const listActiveTrainingTypes = q.listActive
export const toggleTrainingType = q.toggle

export async function listTrainingTypeLabels(
  supabase: SupabaseClient
): Promise<{ data: Record<string, string>; error: string | null }> {
  const { data, error } = await supabase
    .from('training_types')
    .select('code, label')
  const map: Record<string, string> = {}
  for (const t of (data ?? []) as { code: string; label: string }[]) map[t.code] = t.label
  return { data: map, error: error?.message ?? null }
}

export async function insertTrainingType(
  supabase: SupabaseClient,
  payload: { code: string; label: string }
): Promise<{ error: string | null }> {
  return q.insert(supabase, payload)
}

export async function updateTrainingType(
  supabase: SupabaseClient,
  id: string,
  label: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('training_types').update({ label }).eq('id', id)
  return { error: error?.message ?? null }
}
