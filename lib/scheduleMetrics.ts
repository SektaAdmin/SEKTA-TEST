type EnrollmentStatus = 'enrolled' | 'attended' | 'cancelled' | 'noshow' | 'waitlist'

const ACTIVE_STATUSES: EnrollmentStatus[] = ['enrolled', 'attended', 'noshow']

/**
 * Ефективний баланс сесій клієнта з урахуванням ЦЬОГО заняття — як в обліку
 * адміна: записаний клієнт уже «коштує» сесію, тож баланс показуємо так, ніби
 * заняття списане.
 * - sessions_used > 0  → вже списано, баланс актуальний → як є
 * - enrolled            → ще попереду, слот його → віднімаємо вартість («як буде»)
 * - waitlist            → ще не підтверджено, сесія не його → як є
 * - cancelled/noshow без списання → сесія не йде → як є
 * Вартість = довжина hours_attended (1/2 для 2-год занять) або 1.
 */
export function effectiveSessionBalance(
  rawBalance: number,
  status: string,
  sessionsUsed: number,
  hours: number[] | null,
): number {
  if (sessionsUsed > 0) return rawBalance
  if (status === 'enrolled') {
    const cost = hours && hours.length > 0 ? hours.length : 1
    return rawBalance - cost
  }
  return rawBalance
}

export function getActiveCount(enrollments: { status: string }[]): number {
  return enrollments.filter(e => (ACTIVE_STATUSES as string[]).includes(e.status)).length
}

export function getWaitlistCount(enrollments: { status: string }[]): number {
  return enrollments.filter(e => e.status === 'waitlist').length
}

export function isFull(enrollments: { status: string }[], capacity: number | null | undefined): boolean {
  return capacity != null && getActiveCount(enrollments) >= capacity
}

export function isAlmost(enrollments: { status: string }[], capacity: number | null | undefined): boolean {
  if (capacity == null) return false
  const active = getActiveCount(enrollments)
  return active < capacity && active >= capacity * 0.8
}

export function fillPct(enrollments: { status: string }[], capacity: number | null | undefined): string {
  if (capacity == null) return '0%'
  return `${Math.min((getActiveCount(enrollments) / capacity) * 100, 100)}%`
}

// Для шаблонів і HallWeekGrid (підрахунок постійників, не enrollments)
export function getOverCapacityCount(clientCount: number, capacity: number | null | undefined): number {
  if (capacity == null || clientCount <= capacity) return 0
  return clientCount - capacity
}

export function isClientCountFull(clientCount: number, capacity: number | null | undefined): boolean {
  return capacity != null && clientCount >= capacity
}

export function isClientCountAlmost(clientCount: number, capacity: number | null | undefined): boolean {
  if (capacity == null) return false
  return clientCount < capacity && clientCount >= capacity * 0.8
}

export function clientFillPct(clientCount: number, capacity: number | null | undefined): string {
  if (capacity == null) return '0%'
  return `${Math.min((clientCount / capacity) * 100, 100)}%`
}
