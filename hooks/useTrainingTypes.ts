'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { TrainingType } from '@/types'

const supabase = createClient()

export function useTrainingTypes() {
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchTrainingTypes = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('training_types')
      .select('id, code, label, is_active, sort_order, created_at')
      .order('sort_order', { ascending: true })
    if (error) {
      setFetchError(error.message)
    } else {
      setTrainingTypes((data as TrainingType[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTrainingTypes() }, [fetchTrainingTypes])

  return { trainingTypes, loading, fetchError, refetch: fetchTrainingTypes }
}
