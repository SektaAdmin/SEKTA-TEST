'use client'
import { supabase } from '@/lib/supabase'
import { useSupabaseList } from '@/lib/useSupabaseList'
import { listTrainingTypes } from '@/lib/queries/training-types'
import { useRealtime } from '@/lib/useRealtime'
import type { TrainingType } from '@/types'

export function useTrainingTypes() {
  const { data: trainingTypes, loading, fetchError, refetch } = useSupabaseList<TrainingType>(() =>
    listTrainingTypes(supabase).then(({ data, error }) => ({ data, error: error ? { message: error } : null }))
  )
  useRealtime(['training_types'], refetch)
  return { trainingTypes, loading, fetchError, refetch }
}
