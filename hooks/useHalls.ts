'use client'
import { supabase } from '@/lib/supabase'
import { useSupabaseList } from '@/lib/useSupabaseList'
import { listHalls } from '@/lib/queries/halls'
import type { Hall } from '@/types'

export function useHalls() {
  const { data: halls, loading, fetchError, refetch } = useSupabaseList<Hall>(() =>
    listHalls(supabase).then(({ data, error }) => ({ data, error: error ? { message: error } : null }))
  )
  return { halls, loading, fetchError, refetch }
}
