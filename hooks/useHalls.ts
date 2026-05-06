'use client'
import { supabase } from '@/lib/supabase'
import { useSupabaseList } from '@/lib/useSupabaseList'
import type { Hall } from '@/types'

export function useHalls() {
  const { data: halls, loading, fetchError, refetch } = useSupabaseList<Hall>(() =>
    supabase
      .from('halls')
      .select('id, name, capacity, description, is_active')
      .order('name', { ascending: true }) as any
  )
  return { halls, loading, fetchError, refetch }
}
