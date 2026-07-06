import type { SlotFinderClass } from '@/lib/queries/classes'

/* Чиста логіка матриці «Підбір слота»: зал × година → статус.
   Вся часова математика — у ЛОКАЛЬНОМУ часі (як уся сітка /schedule);
   межі доби для fetch — kyivDayUtcBounds на рівні запиту. */

export const SLOT_MIN_HOUR = 8
export const SLOT_MAX_HOUR = 22

export type SlotStatus = 'free' | 'hall_busy' | 'trainer_busy' | 'selftraining' | 'past'

const SELF_TRAINING = 'selftraining'

function minutesOfDay(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

export function computeSlotMatrix(params: {
  classes: SlotFinderClass[]
  hallIds: string[]
  durationMin: number
  trainerId: string | null
  isToday: boolean
  now?: Date
}): { hours: number[]; matrix: Map<string, Map<number, SlotStatus>> } {
  const { classes, hallIds, durationMin, trainerId, isToday } = params
  const now = params.now ?? new Date()

  // Слот має закінчитись до кінця робочого дня (22:00): 90 хв о 21:00 — не пропонуємо.
  const lastStart = SLOT_MAX_HOUR - Math.ceil(durationMin / 60)
  const hours: number[] = []
  for (let h = SLOT_MIN_HOUR; h <= lastStart; h++) hours.push(h)

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const matrix = new Map<string, Map<number, SlotStatus>>()

  for (const hallId of hallIds) {
    const row = new Map<number, SlotStatus>()
    for (const h of hours) {
      const candStart = h * 60
      const candEnd = candStart + durationMin

      // Минуле сьогодні — глухий кут незалежно від зайнятості.
      if (isToday && candStart <= nowMin) {
        row.set(h, 'past')
        continue
      }

      let status: SlotStatus = 'free'
      let hasSelfTraining = false

      for (const cls of classes) {
        const clsStart = minutesOfDay(cls.starts_at)
        if (!overlaps(candStart, candEnd, clsStart, clsStart + cls.duration_min)) continue
        if (cls.hall_id === hallId) {
          if (cls.ticket_type === SELF_TRAINING) {
            hasSelfTraining = true
          } else {
            status = 'hall_busy'
            break
          }
        }
        // Заняття без залу теж тримає тренера зайнятим.
        if (trainerId && cls.trainer_id === trainerId) status = 'trainer_busy'
      }

      if (status === 'free' && hasSelfTraining) status = 'selftraining'
      row.set(h, status)
    }
    matrix.set(hallId, row)
  }

  return { hours, matrix }
}
