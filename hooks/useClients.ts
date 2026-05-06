'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
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

  const fetchClients = useCallback(async (q: string, p: number, size: number) => {
    setLoading(true)

    let query = supabase
      .from('clients')
      .select('id, first_name, last_name, phone, instagram_username, telegram_username, balance', { count: 'exact' })
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })

    if (q.trim()) {
      const s = q.trim()
      query = query.or(
        `first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,instagram_username.ilike.%${s}%,telegram_username.ilike.%${s}%`
      )
    }

    const rangeFrom = p * size
    query = query.range(rangeFrom, rangeFrom + size - 1)

    const { data, count } = await query
    setClients((data as Client[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchClients(search, page, pageSize)
  }, [search, page, pageSize, fetchClients])

  const refetch = () => fetchClients(search, page, pageSize)

  return { clients, total, loading, refetch }
}
