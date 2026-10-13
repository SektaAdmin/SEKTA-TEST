import type { AttendanceRow } from '@/lib/queries/attendance'

/* Класифікація рядків attendance_overview для екрана «Відвідуваність».
   Пороги «давно не ходить»: ≥14 днів — попередження, ≥30 — тривога. */

export const ABSENCE_WARN_DAYS = 14
export const ABSENCE_ALERT_DAYS = 30

export type AbsenceLevel = 'ok' | 'warn' | 'alert'

/** null days = жодного візиту в скоупі → тривога. */
export function absenceLevel(days: number | null): AbsenceLevel {
  if (days == null || days >= ABSENCE_ALERT_DAYS) return 'alert'
  if (days >= ABSENCE_WARN_DAYS) return 'warn'
  return 'ok'
}

export function absenceLabel(days: number | null): string {
  if (days == null) return 'не було'
  if (days === 0) return 'сьогодні'
  return `${days} дн. тому`
}

/** «Зникли»: давно не ходить і не записаний наперед. Постійникам generate_week
 *  створює майбутні записи автоматично, тож для них майбутній запис нічого не
 *  означає — достатньо давності візиту. */
export function isLeaving(r: AttendanceRow): boolean {
  if (absenceLevel(r.days_since) === 'ok') return false
  return r.is_regular || !r.next_enrollment_at
}

/** Частка пропусків постійника за період (0..1); 0 якщо занять не було. */
export function missRate(r: AttendanceRow): number {
  return r.planned_regular > 0 ? r.missed_regular / r.planned_regular : 0
}

export function clientFullName(r: Pick<AttendanceRow, 'first_name' | 'last_name'>): string {
  return [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Клієнт'
}

export type AttendanceTab = 'leaving' | 'missing' | 'all'

export function filterAttendance(rows: AttendanceRow[], tab: AttendanceTab, search: string): AttendanceRow[] {
  const q = search.trim().toLowerCase()
  let out = q ? rows.filter(r => clientFullName(r).toLowerCase().includes(q)) : rows
  if (tab === 'leaving') {
    out = out.filter(isLeaving)
    return [...out].sort((a, b) => (b.days_since ?? 9999) - (a.days_since ?? 9999))
  }
  if (tab === 'missing') {
    out = out.filter(r => r.is_regular && r.missed_regular > 0)
    return [...out].sort((a, b) => missRate(b) - missRate(a) || b.missed_regular - a.missed_regular)
  }
  return [...out].sort((a, b) => clientFullName(a).localeCompare(clientFullName(b), 'uk'))
}
