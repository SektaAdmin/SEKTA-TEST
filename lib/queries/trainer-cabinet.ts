import type { Db } from '@/lib/queries/_db'
import type { QueryData } from '@supabase/supabase-js'

/** trainers-картка, привʼязана до поточного auth-user (кабінет тренера). */
export async function getMyTrainer(
  supabase: Db,
  userId: string
): Promise<{ data: { id: string; name: string } | null; error: string | null }> {
  const { data, error } = await supabase
    .from('trainers')
    .select('id, name')
    .eq('user_id', userId)
    .maybeSingle()
  return { data, error: error?.message ?? null }
}

const TRAINER_CLASSES_SELECT =
  'id, ticket_type, title, starts_at, duration_min, capacity, is_cancelled, choreo_stage, halls(name)' as const

function trainerUpcomingQuery(supabase: Db, trainerId: string, fromISO: string) {
  return supabase
    .from('classes')
    .select(TRAINER_CLASSES_SELECT)
    .eq('trainer_id', trainerId)
    .gte('starts_at', fromISO)
    .order('starts_at', { ascending: true })
}

export type TrainerClassRow = QueryData<ReturnType<typeof trainerUpcomingQuery>>[number]

/** Майбутні заняття тренера (від початку поточного дня). */
export async function listMyUpcomingClasses(
  supabase: Db,
  trainerId: string,
  fromISO: string
): Promise<{ data: TrainerClassRow[]; error: string | null }> {
  const { data, error } = await trainerUpcomingQuery(supabase, trainerId, fromISO)
  return { data: data ?? [], error: error?.message ?? null }
}

/** Минулі заняття тренера (до початку поточного дня), сортування від нових. */
export async function listMyPastClasses(
  supabase: Db,
  trainerId: string,
  beforeISO: string
): Promise<{ data: TrainerClassRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('classes')
    .select(TRAINER_CLASSES_SELECT)
    .eq('trainer_id', trainerId)
    .lt('starts_at', beforeISO)
    .order('starts_at', { ascending: false })
    .limit(50)
  return { data: (data as TrainerClassRow[]) ?? [], error: error?.message ?? null }
}
