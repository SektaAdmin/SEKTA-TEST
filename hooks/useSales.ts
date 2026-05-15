'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { listSales } from '@/lib/queries/sales'
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
    signal?: { cancelled: boolean }
  ) => {
    setLoading(true)
    setFetchError(null)
    const { data, count, error } = await listSales(supabase, { page: p, pageSize: size, search: q, dateFrom: from, dateTo: to })
    if (signal?.cancelled) return
    if (error) {
      setFetchError(error)
    } else {
      setSales(data)
      setTotal(count)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const signal = { cancelled: false }
    fetchSales(page, pageSize, search, dateFrom, dateTo, signal)
    return () => { signal.cancelled = true }
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

  return { sales, total, loading, fetchError, refetch }
}
