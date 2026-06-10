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

// Чи піде запис у резерв за даними class_availability RPC.
// Дзеркало логіки RPC client_enroll: місць немає АБО черга вже є → waitlist
// (новий клієнт не перестрибує тих, хто вже чекає). Тримати синхронно з RPC.
export function goesToWaitlist(a: { active_count: number; waitlist_count: number; capacity: number | null } | undefined): boolean {
  if (!a) return false
  if (a.waitlist_count > 0) return true
  return a.capacity != null && a.active_count >= a.capacity
}

export function clientFillPct(clientCount: number, capacity: number | null | undefined): string {
  if (capacity == null) return '0%'
  return `${Math.min((clientCount / capacity) * 100, 100)}%`
}
