'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { listTrainers, toggleTrainer } from '@/lib/queries/trainers'
import type { Trainer } from '@/types'

export function useTrainers() {
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const fetchTrainers = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await listTrainers(supabase)
    if (error) {
      setFetchError(error)
    } else {
      setTrainers(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTrainers() }, [fetchTrainers])

  const ensureTrainers = useCallback(async () => {
    if (trainers.length > 0) return
    await fetchTrainers()
  }, [trainers.length, fetchTrainers])

  async function toggle(id: string, newValue: boolean) {
    setToggling(id)
    const { error } = await toggleTrainer(supabase, id, newValue)
    if (error) {
      setFetchError(error)
    } else {
      setTrainers(prev => prev.map(t => t.id === id ? { ...t, is_active: newValue } : t))
    }
    setToggling(null)
  }

  return { trainers, loading, fetchError, toggling, toggle, refetch: fetchTrainers, ensureTrainers }
}
