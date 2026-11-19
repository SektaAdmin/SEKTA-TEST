import type { TrainerSalaryDetailRow } from '@/lib/queries/trainer-rates'
import { formatDate } from '@/lib/formatters'
import { isoToYMD, DOW_LABELS_SHORT } from '@/lib/dateUtils'

// Спільне для розрахунку ЗП: /settings/salary/calculations (власник) і /trainer/salary (тренер).

export type DayGroup = {
  dateKey: string         // YYYY-MM-DD
  dateLabel: string       // "пт 22.05.2026"
  classes: TrainerSalaryDetailRow[]
  totalByType: Record<string, number>  // ticket_type → total clients
  totalTrainer: number
}

/** Групує рядки calcTrainerSalaryDetail по днях, від нових до старих. */
export function buildDayGroups(rows: TrainerSalaryDetailRow[]): DayGroup[] {
  const map = new Map<string, DayGroup>()
  for (const r of rows) {
    const dateKey = isoToYMD(r.starts_at)
    if (!map.has(dateKey)) {
      const d = new Date(r.starts_at)
      const dow = DOW_LABELS_SHORT[d.getDay()]
      map.set(dateKey, {
        dateKey,
        dateLabel: `${dow} ${formatDate(r.starts_at)}`,
        classes: [],
        totalByType: {},
        totalTrainer: 0,
      })
    }
    const group = map.get(dateKey)!
    group.classes.push(r)
    group.totalByType[r.ticket_type] = (group.totalByType[r.ticket_type] ?? 0) + r.total_clients
    group.totalTrainer += r.total_trainer
  }
  return Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey))
}

/**
 * «До виплати» — формула 1:1 для власника й тренера:
 *   нараховано за період − виплачено за період − готівка на руках ЗАРАЗ (за весь час).
 *
 * Чому готівка за весь час, а не за період:
 *  - зарахування готівки як ЗП (виплата cash, cash_holder = тренер) нейтральне в будь-який день:
 *    «виплачено» +X, «на руках» −X. Раніше готівка рахувалась за період по payment_date,
 *    а виплати — по періоду, тож зарахування після кінця тижня зсувало суму між тижнями;
 *  - надлишок готівки (зібрав більше, ніж заробив) лишається «на руках» і сам віднімається
 *    наступного періоду, а не губиться.
 * Умова коректності: готівку, яку тренер забрав собі, фіксуємо виплатою (кнопка «Зарахувати готівку»).
 * Від'ємний результат = на руках більше, ніж до виплати (UI показує 0 + підказку).
 */
export function salaryToPay(accrued: number, paidPeriod: number, cashOnHandTotal: number): number {
  return accrued - paidPeriod - cashOnHandTotal
}

/** Скільки готівки з рук тренера можна зарахувати як ЗП за період: min(на руках, нараховано − виплачено). */
export function cashCoverable(accrued: number, paidPeriod: number, cashOnHandTotal: number): number {
  return Math.max(0, Math.min(cashOnHandTotal, accrued - paidPeriod))
}

/** Відмінювання «заняття»: 1/2-4→заняття, 0/5+/11-14→занять (патерн pluralHours). */
export function pluralClasses(n: number): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 >= 1 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'заняття'
  return 'занять'
}
