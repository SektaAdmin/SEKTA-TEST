'use client'
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

let channelCounter = 0

export function useRealtime(tables: string[], onChange: () => void) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Unique channel name per hook instance prevents singleton client from
  // returning an already-subscribed channel when multiple components watch
  // the same tables, and prevents cleanup of one from killing the other.
  const channelNameRef = useRef(`realtime:${[...tables].sort().join(',')}:${++channelCounter}`)

  useEffect(() => {
    const channel = supabase.channel(channelNameRef.current)

    for (const table of tables) {
      channel.on(
        'postgres_changes' as const,
        { event: '*', schema: 'public', table },
        (payload: unknown) => {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Realtime] event on ${channelNameRef.current}`, payload)
          }
          onChangeRef.current()
        }
      )
    }

    channel.subscribe((status: string) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Realtime] ${channelNameRef.current} → ${status}`)
      }
    })
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
