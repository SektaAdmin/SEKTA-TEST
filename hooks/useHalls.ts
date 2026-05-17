'use client'
import { supabase } from '@/lib/supabase'
import { useSupabaseList } from '@/lib/useSupabaseList'
import { listHalls } from '@/lib/queries/halls'
import { useRealtime } from '@/lib/useRealtime'
import type { Hall } from '@/types'

export function useHalls() {
  const { data: halls, loading, fetchError, refetch } = useSupabaseList<Hall>(() =>
    listHalls(supabase).then(({ data, error }) => ({ data, error: error ? { message: error } : null }))
  )
  useRealtime(['halls'], refetch)
  return { halls, loading, fetchError, refetch }
}
