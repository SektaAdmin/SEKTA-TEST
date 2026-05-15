'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { listClients } from '@/lib/queries/clients'
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

  const fetchClients = useCallback(async (
    q: string, p: number, size: number,
    signal?: { cancelled: boolean }
  ) => {
    setLoading(true)
    const { data, count } = await listClients(supabase, { search: q, page: p, pageSize: size })
    if (signal?.cancelled) return
    setClients(data)
    setTotal(count)
    setLoading(false)
  }, [])

  useEffect(() => {
    const signal = { cancelled: false }
    fetchClients(search, page, pageSize, signal)
    return () => { signal.cancelled = true }
  }, [search, page, pageSize, fetchClients])

  const refetch = () => fetchClients(search, page, pageSize)

  return { clients, total, loading, refetch }
}
