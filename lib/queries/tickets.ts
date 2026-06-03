import type { Db } from '@/lib/queries/_db'
import type { Ticket } from '@/types'
import { refEntityQueries } from './_refEntity'

const q = refEntityQueries<'tickets', Ticket>(
  'tickets',
  'id, name, ticket_type, sessions, price, is_active',
  { orderBy: 'name' }
)

export const listTickets = q.list
export const toggleTicket = q.toggle

export async function insertTicket(
  supabase: Db,
  payload: { name: string; ticket_type: string; sessions: number; price: number; is_active: boolean }
): Promise<{ error: string | null }> {
  return q.insert(supabase, payload)
}
