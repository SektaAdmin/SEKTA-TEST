'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ClassSeries } from '@/types'

export function useSeriesTemplates() {
  const [templates, setTemplates] = useState<ClassSeries[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('class_series')
      .select('*, trainers(name), halls(name), series_clients(count)')
      .eq('type', 'template')
      .order('day_of_week')
      .order('time_of_day')
    if (error) {
      setFetchError(error.message)
    } else {
      setTemplates((data as ClassSeries[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  return { templates, loading, fetchError, refetch: fetchTemplates }
}
