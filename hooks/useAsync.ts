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
 * `initialData` — server-prefetch: стартує з ними без loading і пропускає перший
 * fetch (дані вже в HTML). `refetchOnVisible` — перепідтягнути при поверненні до
 * екрана (visibilitychange). Обидва — як у `useListQuery`.
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
  opts: { realtime?: string[]; refetchOnVisible?: boolean; initialData?: T } = {}
) {
  const { realtime, refetchOnVisible, initialData } = opts

  const [data, setData] = useState<T | null>(initialData ?? null)
  // Є initialData (server-prefetch) — стартуємо без loading і пропускаємо
  // перший fetch: дані вже в HTML. Аналогічно useListQuery.
  const [loading, setLoading] = useState(initialData === undefined)
  const [error, setError] = useState<string | null>(null)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const skipNextFetchRef = useRef(initialData !== undefined)

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
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false
      return
    }
    const controller = new AbortController()
    run(controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const refetch = useCallback(() => {
    run(new AbortController().signal)
  }, [run])

  useEffect(() => {
    if (!refetchOnVisible) return
    function onVisible() {
      if (document.visibilityState === 'visible') refetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refetchOnVisible, refetch])

  useRealtime(realtime ?? [], refetch)

  return { data, loading, error, refetch }
}
