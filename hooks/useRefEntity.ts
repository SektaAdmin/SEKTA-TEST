'use client'
import { useState, useEffect, useCallback } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useRealtime } from '@/lib/useRealtime'

type ListFn<T> = (supabase: SupabaseClient) => Promise<{ data: T[]; error: string | null }>
type ToggleFn = (supabase: SupabaseClient, id: string, isActive: boolean) => Promise<{ error: string | null }>

/**
 * Єдиний хук для довідкових сутностей з м'яким видаленням (halls/trainers/
 * tickets/training_types). Замінив 4 розбіжні хуки (раніше частина на старому
 * useSupabaseList, частина руками). Контракт: `{ data, loading, fetchError, toggling, toggle, refetch }`.
 *
 * `table` — для realtime-підписки (JWT обов'язковий для RLS-таблиць).
 *
 * @example
 *   const { data: halls, refetch } = useRefEntity('halls', listHalls, toggleHall)
 */
export function useRefEntity<T extends { id: string; is_active?: boolean }>(
  table: string,
  listFn: ListFn<T>,
  toggleFn: ToggleFn
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data: rows, error } = await listFn(supabase)
    if (error) setFetchError(error)
    else setData(rows)
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { refetch() }, [refetch])

  const toggle = useCallback(async (id: string, newValue: boolean) => {
    setToggling(id)
    const { error } = await toggleFn(supabase, id, newValue)
    if (error) setFetchError(error)
    else setData(prev => prev.map(r => r.id === id ? { ...r, is_active: newValue } : r))
    setToggling(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useRealtime([table], refetch)

  return { data, loading, fetchError, toggling, toggle, refetch }
}
