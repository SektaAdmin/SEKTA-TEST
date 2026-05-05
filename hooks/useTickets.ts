'use client'
import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Ticket } from '@/types'

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([])

  const ensureTickets = useCallback(async () => {
    if (tickets.length > 0) return
    const { data } = await supabase
      .from('tickets')
      .select('id,name,ticket_type,sessions,price')
      .eq('is_active', true)
      .order('name')
    setTickets(data ?? [])
  }, [tickets.length])

  return { tickets, ensureTickets }
}
