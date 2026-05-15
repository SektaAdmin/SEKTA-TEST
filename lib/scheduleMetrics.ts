type EnrollmentStatus = 'enrolled' | 'attended' | 'cancelled' | 'noshow' | 'waitlist'

const ACTIVE_STATUSES: EnrollmentStatus[] = ['enrolled', 'attended', 'noshow']

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
