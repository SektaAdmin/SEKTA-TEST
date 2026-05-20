'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { listSales } from '@/lib/queries/sales'
import { useRealtime } from '@/lib/useRealtime'
import type { Sale } from '@/types'

export const PAGE_SIZES = [20, 50, 100] as const
export type PageSize = typeof PAGE_SIZES[number]

interface UseSalesParams {
  page: number
  pageSize: PageSize
  search: string
  dateFrom: string
  dateTo: string
}

export function useSales({ page, pageSize, search, dateFrom, dateTo }: UseSalesParams) {
  const [sales, setSales] = useState<Sale[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchSales = useCallback(async (
    p: number, size: number, q: string, from: string, to: string,
    abortSignal?: AbortSignal
  ) => {
    setLoading(true)
    setFetchError(null)
    const { data, count, error } = await listSales(supabase, { page: p, pageSize: size, search: q, dateFrom: from, dateTo: to })
    if (abortSignal?.aborted) return
    if (error) {
      setFetchError(error)
    } else {
      setSales(data)
      setTotal(count)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchSales(page, pageSize, search, dateFrom, dateTo, controller.signal)
    return () => controller.abort()
  }, [page, pageSize, search, dateFrom, dateTo, fetchSales])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        fetchSales(page, pageSize, search, dateFrom, dateTo)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchSales, page, pageSize, search, dateFrom, dateTo])

  const refetch = () => fetchSales(page, pageSize, search, dateFrom, dateTo)

  useRealtime(['sales'], refetch)

  return { sales, total, loading, fetchError, refetch }
}
