import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrainingType } from '@/types'

export async function listTrainingTypes(
  supabase: SupabaseClient
): Promise<{ data: TrainingType[]; error: string | null }> {
  const { data, error } = await supabase
    .from('training_types')
    .select('id, code, label, is_active, sort_order, created_at')
    .order('sort_order', { ascending: true })
  return { data: (data as TrainingType[]) ?? [], error: error?.message ?? null }
}

export async function listActiveTrainingTypes(
  supabase: SupabaseClient
): Promise<{ data: TrainingType[]; error: string | null }> {
  const { data, error } = await supabase
    .from('training_types')
    .select('id, code, label, is_active, sort_order, created_at')
    .eq('is_active', true)
    .order('sort_order')
  return { data: (data as TrainingType[]) ?? [], error: error?.message ?? null }
}

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
  const { error } = await supabase.from('training_types').insert(payload)
  return { error: error?.message ?? null }
}

export async function updateTrainingType(
  supabase: SupabaseClient,
  id: string,
  label: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('training_types').update({ label }).eq('id', id)
  return { error: error?.message ?? null }
}

export async function toggleTrainingType(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('training_types').update({ is_active: isActive }).eq('id', id)
  return { error: error?.message ?? null }
}
