'use client'
import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Trainer } from '@/types'

export function useTrainers() {
  const [trainers, setTrainers] = useState<Trainer[]>([])

  const ensureTrainers = useCallback(async () => {
    if (trainers.length > 0) return
    const { data } = await supabase
      .from('trainers')
      .select('id,name')
      .eq('is_active', true)
      .order('name')
    setTrainers(data ?? [])
  }, [trainers.length])

  return { trainers, ensureTrainers }
}
