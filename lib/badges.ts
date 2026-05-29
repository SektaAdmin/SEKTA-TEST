// Єдиний словник лейблів та CSS-класів для бейджів.
// Не дублювати STATUS_LABELS / PAYMENT_LABELS у компонентах — імпортувати звідси.
//
// CSS-класи визначені глобально в globals.css (@layer utilities).
// Функції повертають повний className-рядок: "badge badge-cash".
// Використання: <span className={paymentClass(method)}>
// Лейбли — текст українською (дієслова для статусів).

import { Clock, CheckCircle2, XCircle, X, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PaymentMethod } from '@/types'

/* ── Статус запису клієнта на заняття ───────────────────────────── */
// Дієслова: описують дію клієнта. waitlist = «Черга» (зал повний).

export type EnrollmentStatus =
  | 'enrolled'
  | 'attended'
  | 'cancelled'
  | 'noshow'
  | 'waitlist'

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  enrolled:  'Записалась',
  attended:  'Відвідала',
  cancelled: 'Скасувала',
  noshow:    'Не прийшла',
  waitlist:  'Черга',
}

export const ENROLLMENT_STATUS_CLASS: Record<EnrollmentStatus, string> = {
  enrolled:  'badge badge-enrolled',
  attended:  'badge badge-attended',
  cancelled: 'badge badge-cancelled',
  noshow:    'badge badge-noshow',
  waitlist:  'badge badge-waitlist',
}

export const ENROLLMENT_STATUS_ICON: Record<EnrollmentStatus, LucideIcon> = {
  enrolled:  Clock,
  attended:  CheckCircle2,
  cancelled: X,
  noshow:    XCircle,
  waitlist:  Users,
}

export function enrollmentStatusLabel(status: string): string {
  return ENROLLMENT_STATUS_LABELS[status as EnrollmentStatus] ?? status
}

export function enrollmentStatusClass(status: string): string {
  return ENROLLMENT_STATUS_CLASS[status as EnrollmentStatus] ?? ''
}

export function enrollmentStatusIcon(status: string): LucideIcon | null {
  return ENROLLMENT_STATUS_ICON[status as EnrollmentStatus] ?? null
}

/* ── Метод оплати ───────────────────────────────────────────────── */

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash:          'Готівка',
  fop:           'ФОП',
  personal_card: 'Картка',
  deposit:       'Депозит',
}

export const PAYMENT_CLASS: Record<PaymentMethod, string> = {
  cash:          'badge badge-cash',
  fop:           'badge badge-fop',
  personal_card: 'badge badge-card',
  deposit:       'badge badge-deposit',
}

export function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method as PaymentMethod] ?? method
}

export function paymentClass(method: string): string {
  return PAYMENT_CLASS[method as PaymentMethod] ?? ''
}

/* ── Короткі ярлики типів тренувань ─────────────────────────────── */
// Скорочені підписи для щільних таблиць (звіти тренерів, ставки).
// Це НЕ training_types.label з БД — це навмисно стислі форми.
// Для повних людських назв (dropdown, дисплеї) читати label з БД через RefsContext.

export const TICKET_TYPE_SHORT_LABELS: Record<string, string> = {
  group:           'Груп',
  individual:      'Індив',
  individualduo:   'Дует',
  individualtrio:  'Тріо',
  hallrental:      'Оренда залу',
  smallhallrental: 'Мал. зал',
  pylonrental:     'Пілон',
  striprental:     'Стріп',
}

export function ticketTypeShortLabel(type: string): string {
  return TICKET_TYPE_SHORT_LABELS[type] ?? type
}
