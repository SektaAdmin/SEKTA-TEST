'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Hall } from '@/types'

export function useHalls() {
  const [halls, setHalls] = useState<Hall[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchHalls = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('halls')
      .select('id, name, capacity, description, is_active')
      .order('name', { ascending: true })
    if (error) {
      setFetchError(error.message)
    } else {
      setHalls((data as Hall[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchHalls() }, [fetchHalls])

  return { halls, loading, fetchError, refetch: fetchHalls }
}
