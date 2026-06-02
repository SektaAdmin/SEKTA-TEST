'use client'
import { supabase } from '@/lib/supabase'
import { listSeriesTemplates } from '@/lib/queries/classes'
import { useListQuery } from '@/hooks/useListQuery'
import type { ClassSeries } from '@/types'

export function useSeriesTemplates() {
  const { data: templates, loading, error, refetch } = useListQuery<ClassSeries>(
    () => listSeriesTemplates(supabase),
    [],
    { realtime: ['class_series', 'series_clients'] }
  )
  return { templates, loading, fetchError: error, refetch }
}
