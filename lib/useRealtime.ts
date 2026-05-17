'use client'
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export function useRealtime(tables: string[], onChange: () => void) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const channelName = `realtime:${[...tables].sort().join(',')}`
    const channel = supabase.channel(channelName)

    for (const table of tables) {
      channel.on(
        'postgres_changes' as const,
        { event: '*', schema: 'public', table },
        () => onChangeRef.current()
      )
    }

    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(',')])
}
