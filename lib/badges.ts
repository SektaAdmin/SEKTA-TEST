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
// Безособові форми (узгоджено): однаковий тон в адмінці і кабінеті, без роду
// (як «Клієнт записаний» у Altegio/YClients, не «Записалась»). Для розшифровки
// cancelled (рано/пізно, хто скасував) — `enrollmentBadge` нижче.

type EnrollmentStatus =
  | 'enrolled'
  | 'attended'
  | 'cancelled'
  | 'noshow'
  | 'waitlist'

const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  enrolled:  'Заброньовано',
  attended:  'Відвідано',
  cancelled: 'Скасовано',
  noshow:    'Не відвідано',
  waitlist:  'У резерві',
}

const ENROLLMENT_STATUS_CLASS: Record<EnrollmentStatus, string> = {
  enrolled:  'badge badge-enrolled',
  attended:  'badge badge-attended',
  cancelled: 'badge badge-cancelled',
  noshow:    'badge badge-noshow',
  waitlist:  'badge badge-waitlist',
}

const ENROLLMENT_STATUS_ICON: Record<EnrollmentStatus, LucideIcon> = {
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

/* ── Зведений бейдж запису (label + tone) ───────────────────────────
 * Єдина точка розшифровки `cancelled` (раніше 3 розкидані версії з різними
 * наборами джерел). Текст статусу — єдиний безособовий словник вище; різниця
 * між перспективами лише в ДЖЕРЕЛІ скасування (хто скасував):
 *  - admin (журнал, ClassDetailModal): суфікс «· студія/адмін/клієнт/авто».
 *  - client (кабінет): без джерела (клієнту не показуємо хто саме).
 * «Рано/пізно» — похідне від sessions_used (поле БД, інв.#2): >0 → «Скасовано
 * (пізно)» (клієнт бачить факт штрафу). `tone` — нейтральний візуальний ключ;
 * місце виклику мапить його на свій клас (глобальний `badge badge-*` через
 * `enrollmentBadgeClass`, або власний CSS-Module — кабінет клієнта).
 * НЕ зливати з cancellation.ts: тут факт (sessions_used>0), там прогноз. */

export type EnrollmentBadgeTone =
  | 'enrolled'
  | 'attended'
  | 'cancelled'
  | 'late'
  | 'noshow'
  | 'waitlist'

export type EnrollmentBadgeInput = {
  status: string
  cancellation_source?: string | null
  sessions_used?: number | null
}

const CANCEL_SOURCE_SUFFIX_ADMIN: Record<string, string> = {
  class_cancelled: 'студія',
  self:            'клієнт',
  staff_manual:    'адмін',
  auto_close:      'авто',
}

// Короткий суфікс джерела скасування для admin-перспективи (без «· »).
// Дає змогу місцю рендерити суфікс окремим приглушеним span (ClassDetailModal).
export function cancelSourceSuffix(source: string | null | undefined): string | null {
  return source ? (CANCEL_SOURCE_SUFFIX_ADMIN[source] ?? null) : null
}

export function enrollmentBadge(
  e: EnrollmentBadgeInput,
  perspective: 'admin' | 'client',
): { label: string; tone: EnrollmentBadgeTone } {
  const { status } = e
  const isLate = (e.sessions_used ?? 0) > 0

  if (status === 'cancelled') {
    const tone: EnrollmentBadgeTone = isLate ? 'late' : 'cancelled'
    const base = isLate
      ? `${ENROLLMENT_STATUS_LABELS.cancelled} (пізно)`
      : ENROLLMENT_STATUS_LABELS.cancelled
    if (perspective === 'admin') {
      const suffix = cancelSourceSuffix(e.cancellation_source)
      return { label: suffix ? `${base} · ${suffix}` : base, tone }
    }
    return { label: base, tone } // client — без джерела
  }

  const tone: EnrollmentBadgeTone =
    status === 'enrolled'  ? 'enrolled'  :
    status === 'waitlist'  ? 'waitlist'  :
    status === 'attended'  ? 'attended'  :
    status === 'noshow'    ? 'noshow'    : 'cancelled'
  return { label: enrollmentStatusLabel(status), tone }
}

// Tone → глобальний `badge badge-*` (admin-місця, глобальна CSS-система).
// `late` ділить колір зі `cancelled` (попередження-штраф).
const ENROLLMENT_TONE_CLASS: Record<EnrollmentBadgeTone, string> = {
  enrolled:  'badge badge-enrolled',
  attended:  'badge badge-attended',
  cancelled: 'badge badge-cancelled',
  late:      'badge badge-cancelled',
  noshow:    'badge badge-noshow',
  waitlist:  'badge badge-waitlist',
}

export function enrollmentBadgeClass(tone: EnrollmentBadgeTone): string {
  return ENROLLMENT_TONE_CLASS[tone]
}

/* ── Метод оплати ───────────────────────────────────────────────── */

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash:          'Готівка',
  fop:           'ФОП',
  personal_card: 'Картка',
  deposit:       'Депозит',
}

const PAYMENT_CLASS: Record<PaymentMethod, string> = {
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

/* ── Типи транзакцій балансу (balance_transactions.transaction_type) ── */
// Відомі типи: purchase / deposit_topup / admin_adjustment (+ історичні
// deduction / refund / adjustment). Невідомий → код як є.
const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  purchase:         'Покупка',
  deposit_topup:    'Поповнення',
  deduction:        'Списання',
  refund:           'Повернення',
  adjustment:       'Коригування',
  admin_adjustment: 'Коригування',
}

export function transactionTypeLabel(type: string): string {
  return TRANSACTION_TYPE_LABELS[type] ?? type
}

/* ── Короткі ярлики типів тренувань ─────────────────────────────── */
// Скорочені підписи для щільних таблиць (звіти тренерів, ставки).
// Це НЕ training_types.label з БД — це навмисно стислі форми.
// Для повних людських назв (dropdown, дисплеї) читати label з БД через RefsContext.

const TICKET_TYPE_SHORT_LABELS: Record<string, string> = {
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

// Людські назви типів у називному відмінку для клієнтського кабінету.
// НЕ training_types.label (там бренд-назви типу «Exotic» — для адмінів).
export const TICKET_TYPE_NOMINATIVE_LABELS: Record<string, string> = {
  group:           'Групове тренування',
  individual:      'Індивідуальне тренування',
  individualduo:   'Індивідуальне Duo',
  individualtrio:  'Індивідуальне Trio',
  hallrental:      'Оренда залу',
  smallhallrental: 'Оренда залу (Малий)',
  pylonrental:     'Оренда пілону',
  selftraining:    'Самостійне тренування',
}

export function ticketTypeNominativeLabel(type: string): string {
  return TICKET_TYPE_NOMINATIVE_LABELS[type] ?? type
}

// Назва типу в родовому відмінку для конструкції «Залишок: ___» (кабінет клієнта).
// Узагальнені формули, НЕ training_types.label (там бренд-назви типу «Exotic»).
// Невідомий код → fallback (передається label з БД у нижньому регістрі).
const TICKET_TYPE_GENITIVE_LABELS: Record<string, string> = {
  group:           'групових тренувань',
  individual:      'індивідуальних тренувань',
  individualduo:   'індивідуальних Duo',
  individualtrio:  'індивідуальних Trio',
  selftraining:    'самостійних тренувань',
  hallrental:      'оренд залу',
  smallhallrental: 'оренд малого залу',
  pylonrental:     'оренд пілону',
  striprental:     'оренд стрипів',
}

export function ticketTypeGenitiveLabel(type: string, fallback: string): string {
  return TICKET_TYPE_GENITIVE_LABELS[type] ?? fallback
}

// Коди-абревіатури типу абонемента (1–2 латинські літери) — для overview-режиму
// розкладу на мобільному (всі зали одночасно у вузьких колонках). Латиниця навмисно:
// працює як технічна мітка-значок поряд із кольором, не як текст для читання, тому
// не порушує «UI лише українською». Невідомий тип (новий з training_types) → 1-ша
// літера коду великими.
const TICKET_TYPE_ABBR: Record<string, string> = {
  group:           'G',
  individual:      'I',
  individualduo:   'ID',
  individualtrio:  'IT',
  hallrental:      'H',
  smallhallrental: 'SH',
  pylonrental:     'P',
  striprental:     'S',
}

export function ticketTypeAbbr(type: string): string {
  return TICKET_TYPE_ABBR[type] ?? (type ? type[0].toUpperCase() : '?')
}
