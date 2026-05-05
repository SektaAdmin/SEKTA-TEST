'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Trainer } from '@/types'

const supabase = createClient()

export function useTrainers() {
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const fetchTrainers = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('trainers')
      .select('id, name, is_active, instagram_username, telegram_username')
      .order('name', { ascending: true })
    if (error) {
      setFetchError(error.message)
    } else {
      setTrainers((data as Trainer[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTrainers() }, [fetchTrainers])

  async function toggle(id: string, newValue: boolean) {
    setToggling(id)
    const { error } = await supabase.from('trainers').update({ is_active: newValue }).eq('id', id)
    if (error) {
      setFetchError(error.message)
    } else {
      setTrainers(prev => prev.map(t => t.id === id ? { ...t, is_active: newValue } : t))
    }
    setToggling(null)
  }

  return { trainers, loading, fetchError, toggling, toggle, refetch: fetchTrainers }
}
