type EnrollmentStatus = 'enrolled' | 'attended' | 'cancelled' | 'noshow' | 'waitlist'

// «Займає місце для нового запису» — узгоджено з тригером capacity (20260506),
// RPC class_availability і listEnrolledCountsForDate (усі рахують enrolled+attended).
// noshow НЕ рахується: заняття минуло / клієнт не прийде, місце для запису вільне.
const ACTIVE_STATUSES: EnrollmentStatus[] = ['enrolled', 'attended']

export function getActiveCount(enrollments: { status: string }[]): number {
  return enrollments.filter(e => (ACTIVE_STATUSES as string[]).includes(e.status)).length
}

export function getWaitlistCount(enrollments: { status: string }[]): number {
  return enrollments.filter(e => e.status === 'waitlist').length
}

export function isFull(enrollments: { status: string }[], capacity: number | null | undefined): boolean {
  return capacity != null && getActiveCount(enrollments) >= capacity
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
