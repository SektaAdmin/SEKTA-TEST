'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
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
    p: number, size: number, q: string, from: string, to: string
  ) => {
    setLoading(true)
    setFetchError(null)

    let clientIds: string[] | null = null

    if (q.trim()) {
      const s = q.trim()
      const parts = s.split(/\s+/)
      let cq = supabase.from('clients').select('id')
      if (parts.length === 1) {
        cq = cq.or(`first_name.ilike.%${parts[0]}%,last_name.ilike.%${parts[0]}%`)
      } else {
        const [a, b] = parts
        cq = cq.or(
          `first_name.ilike.%${a}%,last_name.ilike.%${b}%,` +
          `first_name.ilike.%${b}%,last_name.ilike.%${a}%`
        )
      }
      const { data: matched } = await cq.limit(200)
      clientIds = (matched ?? []).map((c: { id: string }) => c.id)
      if (clientIds.length === 0) {
        setSales([]); setTotal(0); setLoading(false); return
      }
    }

    const rangeFrom = p * size
    let query = supabase
      .from('sales')
      .select(`
        id, created_at, client_id, ticket_id, trainer_id,
        ticket_name, ticket_price, ticket_type, sessions, price_paid, amount_given,
        payment_method, notes,
        clients(first_name, last_name),
        tickets(name),
        trainers(name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(rangeFrom, rangeFrom + size - 1)

    if (clientIds !== null) query = query.in('client_id', clientIds)
    if (from) query = query.gte('created_at', `${from}T00:00:00`)
    if (to)   query = query.lte('created_at', `${to}T23:59:59`)

    const { data, count, error } = await query
    if (error) {
      setFetchError(error.message)
    } else {
      setSales((data as unknown as Sale[]) ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSales(page, pageSize, search, dateFrom, dateTo)
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
