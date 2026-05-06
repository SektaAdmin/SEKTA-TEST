'use client'
import { supabase } from '@/lib/supabase'
import { useSupabaseList } from '@/lib/useSupabaseList'
import type { TrainingType } from '@/types'

export function useTrainingTypes() {
  const { data: trainingTypes, loading, fetchError, refetch } = useSupabaseList<TrainingType>(() =>
    supabase
      .from('training_types')
      .select('id, code, label, is_active, sort_order, created_at')
      .order('sort_order', { ascending: true }) as any
  )
  return { trainingTypes, loading, fetchError, refetch }
}
