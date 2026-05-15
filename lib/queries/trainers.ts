import type { SupabaseClient } from '@supabase/supabase-js'
import type { Trainer } from '@/types'

export async function listTrainers(
  supabase: SupabaseClient
): Promise<{ data: Trainer[]; error: string | null }> {
  const { data, error } = await supabase
    .from('trainers')
    .select('id, name, is_active, instagram_username, telegram_username')
    .order('name', { ascending: true })
  return { data: (data as Trainer[]) ?? [], error: error?.message ?? null }
}

export async function listActiveTrainers(
  supabase: SupabaseClient
): Promise<Trainer[]> {
  const { data } = await supabase
    .from('trainers')
    .select('id, name, is_active, instagram_username, telegram_username')
    .eq('is_active', true)
    .order('name')
  return (data as Trainer[]) ?? []
}

export async function toggleTrainer(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trainers').update({ is_active: isActive }).eq('id', id)
  return { error: error?.message ?? null }
}

export async function insertTrainer(
  supabase: SupabaseClient,
  payload: { name: string; instagram_username: string | null; telegram_username: string | null; is_active: boolean }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trainers').insert(payload)
  return { error: error?.message ?? null }
}
