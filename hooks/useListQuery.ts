'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRealtime } from '@/lib/useRealtime'

/**
 * Єдиний хук для «список з фільтрами/пагінацією»: тримає триаду
 * data/loading/error, гасить застарілі відповіді (AbortController),
 * опційно перепідтягує дані на realtime-події і при поверненні вкладки.
 *
 * Замінив ручні useState+useEffect-триади у useSales / clients / journal /
 * дашборд-блоках. Для довідкових сутностей з toggle лишається `useRefEntity`.
 *
 * Контракт fetcher: замикає актуальні залежності й повертає
 * `{ data, count?, error }`. Хук НЕ знає про supabase — передавай готову
 * query-функцію з `lib/queries/*`.
 *
 * `deps` — як для useEffect: при зміні буде новий fetch (старий — abort).
 * `total` = `count` з останньої відповіді (0, якщо fetcher його не повертає).
 *
 * `initialData` — server-prefetch (дані, передані зі Server Component як проп):
 * хук стартує з ними БЕЗ loading і пропускає перший fetch при монтуванні (дані
 * вже в HTML — нема дубль-запиту). Наступні зміни deps / refetch / visible
 * фетчать як зазвичай. Без опції — поведінка незмінна (loading=true + fetch).
 *
 * @example
 *   const { data: sales, total, loading, error, refetch } = useListQuery(
 *     () => listSales(supabase, { page, pageSize, search, dateFrom, dateTo, trainerId }),
 *     [page, pageSize, search, dateFrom, dateTo, trainerId],
 *     { realtime: ['sales'], refetchOnVisible: true }
 *   )
 */
export function useListQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<{ data: T[]; count?: number; error: string | null }>,
  deps: React.DependencyList,
  opts: { realtime?: string[]; refetchOnVisible?: boolean; initialData?: T[] } = {}
) {
  const { realtime, refetchOnVisible, initialData } = opts

  const [data, setData] = useState<T[]>(initialData ?? [])
  const [total, setTotal] = useState(0)
  // Якщо є initialData (server-prefetch) — стартуємо без loading і без fetch
  // при монтуванні: дані вже в HTML. Перший fetch — лише по deps-зміні/refetch.
  const [loading, setLoading] = useState(initialData === undefined)
  const [error, setError] = useState<string | null>(null)

  // Тримаємо актуальний fetcher у ref, щоб refetch/listeners не залежали від
  // його ідентичності — інакше кожен рендер пересоздавав би підписки.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  // Пропускаємо лише ПЕРШИЙ ефект, коли є initialData (дані вже є). Наступні
  // зміни deps мусять фетчити. Ref, а не state — щоб не тригерити ре-рендер.
  const skipNextFetchRef = useRef(initialData !== undefined)

  const run = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError(null)
    const res = await fetcherRef.current(signal)
    if (signal.aborted) return
    if (res.error) {
      setError(res.error)
    } else {
      setData(res.data)
      setTotal(res.count ?? 0)
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

  /** Ручний перезапит поточних deps (після мутації). Не abort-иться. */
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

  return { data, total, loading, error, refetch }
}
