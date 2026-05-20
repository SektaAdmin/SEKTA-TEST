'use client'
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

let channelCounter = 0

export function useRealtime(tables: string[], onChange: () => void) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const channelNameRef = useRef(`realtime:${[...tables].sort().join(',')}:${++channelCounter}`)

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel>
    let debounceTimer: ReturnType<typeof setTimeout>

    async function subscribe() {
      // Realtime postgres_changes with RLS requires the JWT access token
      // to be set on the channel before subscribing, otherwise Supabase
      // silently drops all events for RLS-protected tables.
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      channel = supabase.channel(channelNameRef.current, {
        config: {
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        },
      })

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
      clearTimeout(debounceTimer)
      if (channel) supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
