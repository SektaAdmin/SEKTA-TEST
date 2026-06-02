'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRealtime } from '@/lib/useRealtime'

/**
 * Хук для одного асинхронного значення (НЕ списку): тримає data/loading/error,
 * гасить застарілі відповіді, опційно перепідтягує на realtime-події.
 *
 * Споріднений з `useListQuery`, але для single-value фетчів (агрегати дашборду,
 * один об'єкт). Якщо потрібен список з пагінацією — бери `useListQuery`.
 *
 * fetcher замикає актуальні deps і повертає `{ data, error }`. `data` лишається
 * `null` поки не прийшла перша успішна відповідь.
 *
 * @example
 *   const { data: t, loading, error } = useAsync(
 *     () => getMoneyTotalsForDate(supabase, date),
 *     [date],
 *     { realtime: ['sales', 'studio_expenses'] }
 *   )
 */
export function useAsync<T>(
  fetcher: (signal: AbortSignal) => Promise<{ data: T; error: string | null }>,
  deps: React.DependencyList,
  opts: { realtime?: string[] } = {}
) {
  const { realtime } = opts

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const run = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError(null)
    const res = await fetcherRef.current(signal)
    if (signal.aborted) return
    if (res.error) {
      setError(res.error)
      setData(null)
    } else {
      setData(res.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    run(controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const refetch = useCallback(() => {
    run(new AbortController().signal)
  }, [run])

  useRealtime(realtime ?? [], refetch)

  return { data, loading, error, refetch }
}
