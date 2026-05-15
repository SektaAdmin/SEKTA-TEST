'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { listSeriesTemplates } from '@/lib/queries/classes'
import type { ClassSeries } from '@/types'

export function useSeriesTemplates() {
  const [templates, setTemplates] = useState<ClassSeries[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await listSeriesTemplates(supabase)
    if (error) {
      setFetchError(error)
    } else {
      setTemplates(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  return { templates, loading, fetchError, refetch: fetchTemplates }
}
