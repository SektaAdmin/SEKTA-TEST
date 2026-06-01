'use client'
import { useRefEntity } from '@/hooks/useRefEntity'
import { listTickets, toggleTicket } from '@/lib/queries/tickets'
import type { Ticket } from '@/types'

export function useTickets() {
  const { data, ...rest } = useRefEntity<Ticket>('tickets', listTickets, toggleTicket)
  return { tickets: data, ...rest }
}
