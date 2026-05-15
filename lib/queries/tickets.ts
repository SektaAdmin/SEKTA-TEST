import type { SupabaseClient } from '@supabase/supabase-js'
import type { Ticket } from '@/types'

export async function listTickets(
  supabase: SupabaseClient
): Promise<{ data: Ticket[]; error: string | null }> {
  const { data, error } = await supabase
    .from('tickets')
    .select('id, name, ticket_type, sessions, price, is_active')
    .order('name', { ascending: true })
  return { data: (data as Ticket[]) ?? [], error: error?.message ?? null }
}

export async function toggleTicket(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('tickets').update({ is_active: isActive }).eq('id', id)
  return { error: error?.message ?? null }
}

export async function insertTicket(
  supabase: SupabaseClient,
  payload: { name: string; ticket_type: string; sessions: number; price: number; is_active: boolean }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('tickets').insert(payload)
  return { error: error?.message ?? null }
}
