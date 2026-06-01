import type { SupabaseClient } from '@supabase/supabase-js'
import type { Hall } from '@/types'

export async function listHalls(
  supabase: SupabaseClient
): Promise<{ data: Hall[]; error: string | null }> {
  const { data, error } = await supabase
    .from('halls')
    .select('id, name, capacity, description, is_active')
    .order('name', { ascending: true })
  return { data: (data as Hall[]) ?? [], error: error?.message ?? null }
}

export async function listActiveHalls(
  supabase: SupabaseClient
): Promise<{ data: Hall[]; error: string | null }> {
  const { data, error } = await supabase
    .from('halls')
    .select('id, name, capacity, description, is_active')
    .eq('is_active', true)
    .order('name')
  return { data: (data as Hall[]) ?? [], error: error?.message ?? null }
}

export async function toggleHall(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('halls').update({ is_active: isActive }).eq('id', id)
  return { error: error?.message ?? null }
}

export async function insertHall(
  supabase: SupabaseClient,
  payload: { name: string; capacity: number; description: string | null; is_active: boolean }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('halls').insert(payload)
  return { error: error?.message ?? null }
}
