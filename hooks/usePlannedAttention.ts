'use client'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/useAsync'
import { listPlannedRegister, type PlannedRegisterRow } from '@/lib/queries/planned'

/** Записи «Запланованого», що потребують уваги адміна (Sidebar-лічильник, дашборд). */
export function usePlannedAttention(enabled = true): { rows: PlannedRegisterRow[]; loading: boolean } {
  const { data, loading } = useAsync(
    () => enabled
      ? listPlannedRegister(supabase).then(r => ({ data: r.data.filter(x => x.status === 'attention'), error: r.error }))
      : Promise.resolve({ data: [] as PlannedRegisterRow[], error: null }),
    [enabled],
    { refetchOnVisible: true }
  )
  return { rows: data ?? [], loading }
}
