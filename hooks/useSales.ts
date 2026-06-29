'use client'
import { supabase } from '@/lib/supabase'
import { listSalesFeedPage, type SalesFeedRow } from '@/lib/queries/sales'
import { useListQuery } from '@/hooks/useListQuery'

export const PAGE_SIZES = [20, 50, 100] as const
export type PageSize = typeof PAGE_SIZES[number]

interface UseSalesFeedParams {
  tab: 'all' | 'sales' | 'expenses'
  page: number
  pageSize: PageSize
  search: string
  dateFrom: string
  dateTo: string
  trainerId: string
  expenseMethod: string
}

/**
 * Уніфікований пагінований feed /sales (sales + studio_expenses) через
 * sales_feed_page RPC: БД віддає рівно pageSize рядків поточної сторінки +
 * total_count. Жодного клієнтського злиття/сортування тисяч рядків.
 */
export function useSalesFeed({ tab, page, pageSize, search, dateFrom, dateTo, trainerId, expenseMethod }: UseSalesFeedParams) {
  const { data, total, loading, error, refetch } = useListQuery<SalesFeedRow>(
    async () => {
      const { rows, count, error } = await listSalesFeedPage(supabase, {
        tab, search, dateFrom, dateTo, trainerId, expenseMethod, page, pageSize,
      })
      return { data: rows, count, error }
    },
    [tab, page, pageSize, search, dateFrom, dateTo, trainerId, expenseMethod],
    { realtime: ['sales', 'studio_expenses'], refetchOnVisible: true }
  )
  return { feed: data, total, loading, fetchError: error, refetch }
}
