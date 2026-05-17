'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { listTickets, toggleTicket } from '@/lib/queries/tickets'
import { useRealtime } from '@/lib/useRealtime'
import type { Ticket } from '@/types'

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await listTickets(supabase)
    if (error) {
      setFetchError(error)
    } else {
      setTickets(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  const ensureTickets = useCallback(async () => {
    if (tickets.length > 0) return
    await fetchTickets()
  }, [tickets.length, fetchTickets])

  async function toggle(id: string, newValue: boolean) {
    setToggling(id)
    const { error } = await toggleTicket(supabase, id, newValue)
    if (error) {
      setFetchError(error)
    } else {
      setTickets(prev => prev.map(t => t.id === id ? { ...t, is_active: newValue } : t))
    }
    setToggling(null)
  }

  useRealtime(['tickets'], fetchTickets)

  return { tickets, loading, fetchError, toggling, toggle, refetch: fetchTickets, ensureTickets }
}
