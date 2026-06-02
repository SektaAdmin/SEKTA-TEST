'use client'
import { supabase } from '@/lib/supabase'
import { listSales } from '@/lib/queries/sales'
import { useListQuery } from '@/hooks/useListQuery'
import type { Sale } from '@/types'

export const PAGE_SIZES = [20, 50, 100] as const
export type PageSize = typeof PAGE_SIZES[number]

interface UseSalesParams {
  page: number
  pageSize: PageSize
  search: string
  dateFrom: string
  dateTo: string
  trainerId: string
}

export function useSales({ page, pageSize, search, dateFrom, dateTo, trainerId }: UseSalesParams) {
  const { data: sales, total, loading, error, refetch } = useListQuery<Sale>(
    () => listSales(supabase, { page, pageSize, search, dateFrom, dateTo, trainerId }),
    [page, pageSize, search, dateFrom, dateTo, trainerId],
    { realtime: ['sales'], refetchOnVisible: true }
  )
  return { sales, total, loading, fetchError: error, refetch }
}
