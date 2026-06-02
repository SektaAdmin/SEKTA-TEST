import type { SupabaseClient } from '@supabase/supabase-js'

/* Запити, специфічні для операційного дашборду (/dashboard).
   Решта блоків збирається з існуючих queries (enrollments.ts, trainer-rates.ts).
   Гроші — integer ₴, НЕ ділити на 100. */

/** ФОП-виручка за день (для звірки з банк-випискою). */
export async function getFopTotalForDate(
  supabase: SupabaseClient,
  date: string
): Promise<{ data: number; error: string | null }> {
  const { data, error } = await supabase
    .from('sales')
    .select('price_paid')
    .eq('payment_method', 'fop')
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59.999`)

  const total = ((data ?? []) as { price_paid: number }[])
    .reduce((s, r) => s + Number(r.price_paid), 0)

  return { data: total, error: error?.message ?? null }
}

export type HallBusyInterval = {
  hall: string
  trainer: string | null
  title: string | null
  startMin: number   // хвилини від 00:00 (локально)
  endMin: number
  startsAt: string   // ISO
  durationMin: number
}

/** Зайняті інтервали по залах на дату — для розрахунку вільних вікон. */
export async function listHallBusyIntervalsForDate(
  supabase: SupabaseClient,
  date: string
): Promise<{ data: HallBusyInterval[]; error: string | null }> {
  const dayStart = new Date(`${date}T00:00:00`).toISOString()
  const dayEnd = new Date(`${date}T23:59:59.999`).toISOString()

  type ClassRow = {
    starts_at: string
    duration_min: number
    title: string | null
    halls: { name: string } | null
    trainers: { name: string } | null
  }

  const { data, error } = await supabase
    .from('classes')
    .select('starts_at, duration_min, title, halls(name), trainers(name)')
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd)
    .eq('is_cancelled', false)
    .order('starts_at', { ascending: true })
    .returns<ClassRow[]>()

  const intervals: HallBusyInterval[] = (data ?? [])
    .filter(c => c.halls?.name)
    .map(c => {
      const d = new Date(c.starts_at)
      const startMin = d.getHours() * 60 + d.getMinutes()
      return {
        hall: c.halls!.name,
        trainer: c.trainers?.name ?? null,
        title: c.title,
        startMin,
        endMin: startMin + c.duration_min,
        startsAt: c.starts_at,
        durationMin: c.duration_min,
      }
    })

  return { data: intervals, error: error?.message ?? null }
}
