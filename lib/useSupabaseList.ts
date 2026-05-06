'use client'
import { useState, useEffect, useCallback } from 'react'

type QueryFn<T> = () => Promise<{ data: T[] | null; error: { message: string } | null }>

export function useSupabaseList<T>(queryFn: QueryFn<T>) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data: result, error } = await queryFn()
    if (error) {
      setFetchError(error.message)
    } else {
      setData(result ?? [])
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, fetchError, refetch: fetch }
}
