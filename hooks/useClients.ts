'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { listClients } from '@/lib/queries/clients'
import { useRealtime } from '@/lib/useRealtime'
import type { Client } from '@/types'

export const PAGE_SIZES = [20, 50, 100] as const
export type PageSize = typeof PAGE_SIZES[number]

interface UseClientsParams {
  search: string
  page: number
  pageSize: PageSize
}

export function useClients({ search, page, pageSize }: UseClientsParams) {
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchClients = useCallback(async (
    q: string, p: number, size: number,
    abortSignal?: AbortSignal
  ) => {
    setLoading(true)
    setFetchError(null)
    const { data, count, error } = await listClients(supabase, { search: q, page: p, pageSize: size })
    if (abortSignal?.aborted) return
    if (error) {
      setFetchError(typeof error === 'string' ? error : 'Помилка завантаження')
    } else {
      setClients(data)
      setTotal(count)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchClients(search, page, pageSize, controller.signal)
    return () => controller.abort()
  }, [search, page, pageSize, fetchClients])

  const refetch = () => fetchClients(search, page, pageSize)

  useRealtime(['clients', 'sales'], refetch)

  return { clients, total, loading, fetchError, refetch }
}
