'use client'
<<<<<<< HEAD
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
=======
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Ticket } from '@/types'

const supabase = createClient()

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('tickets')
      .select('id, name, ticket_type, sessions, price, is_active')
      .order('name', { ascending: true })
    if (error) {
      setFetchError(error.message)
    } else {
      setTickets((data as Ticket[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  async function toggle(id: string, newValue: boolean) {
    setToggling(id)
    const { error } = await supabase.from('tickets').update({ is_active: newValue }).eq('id', id)
    if (error) {
      setFetchError(error.message)
    } else {
      setTickets(prev => prev.map(t => t.id === id ? { ...t, is_active: newValue } : t))
    }
    setToggling(null)
  }

  return { tickets, loading, fetchError, toggling, toggle, refetch: fetchTickets }
>>>>>>> ec0caa22057a2670095a5e3877fe9f98ecc07f42
}
