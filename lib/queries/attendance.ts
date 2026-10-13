import type { Db } from '@/lib/queries/_db'
import type { Database } from '@/types/database.types'

/* Відвідуваність (/attendance, /trainer/attendance) — RPC attendance_overview.
   Тренеру RPC сама підставляє current_trainer_id() (переданий trainerId ігнорується). */

export type AttendanceRow = Database['public']['Functions']['attendance_overview']['Returns'][number]

export async function getAttendanceOverview(
  supabase: Db,
  params: { trainerId?: string; periodDays: number }
): Promise<{ data: AttendanceRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('attendance_overview', {
    // undefined (не null) — інакше PostgREST шукає перевантаження з явним NULL.
    p_trainer_id: params.trainerId || undefined,
    p_period_days: params.periodDays,
  })
  return { data: data ?? [], error: error?.message ?? null }
}
