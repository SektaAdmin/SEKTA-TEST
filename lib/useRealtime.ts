'use client'
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

let channelCounter = 0

export function useRealtime(tables: string[], onChange: () => void) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const channelNameRef = useRef(`realtime:${[...tables].sort().join(',')}:${++channelCounter}`)

  useEffect(() => {
    if (tables.length === 0) return // нема таблиць — нема підписки (idle-канал не створюємо)

    let channel: ReturnType<typeof supabase.channel>
    let debounceTimer: ReturnType<typeof setTimeout>

    let cancelled = false

    async function subscribe() {
      // Realtime postgres_changes with RLS requires the JWT access token
      // to be set on the realtime socket before subscribing, otherwise Supabase
      // silently drops all events for RLS-protected tables.
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      // React Strict Mode подвійний ефект: cleanup може прийти до await-у.
      if (cancelled) return
      if (token) supabase.realtime.setAuth(token)

      channel = supabase.channel(channelNameRef.current)

      for (const table of tables) {
        channel.on(
          'postgres_changes' as const,
          { event: '*', schema: 'public', table },
          () => {
            clearTimeout(debounceTimer)
            debounceTimer = setTimeout(() => onChangeRef.current(), 300)
          }
        )
      }

      channel.subscribe()
    }

    subscribe()

    return () => {
      cancelled = true
      clearTimeout(debounceTimer)
      if (channel) supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
