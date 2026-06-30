import type { Db } from '@/lib/queries/_db'
import type { QueryData } from '@supabase/supabase-js'

// Лог змін enrollment (аудит + аутбокс нотифікацій) для сторінки /audit.
// Тренера-власника й актора-тренера резолвимо через RefsContext (тренери в кеші),
// тому embed лише на clients (імʼя) і classes (тип/час/зал).

const AUDIT_EVENT_SELECT =
  'id, created_at, event_type, old_status, new_status, actor_role, owner_trainer_id, actor_trainer_id, is_self_owner, notify, delivered, message_text, clients(first_name, last_name), classes(ticket_type, starts_at, hall_id, is_cancelled)' as const

function auditEventsQuery(supabase: Db) {
  return supabase
    .from('enrollment_events')
    .select(AUDIT_EVENT_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
}

export type AuditEventRow = QueryData<ReturnType<typeof auditEventsQuery>>[number]

/** '' = всі; 'delivered'/'pending' стосуються лише notify-рядків. */
export type DeliveredFilter = '' | 'delivered' | 'pending'

export interface ListEnrollmentEventsParams {
  page: number
  pageSize: number
  dateFrom?: string
  dateTo?: string
  trainerId?: string // owner_trainer_id
  clientId?: string
  actorRole?: string
  eventType?: string
  delivered?: DeliveredFilter
}

export async function listEnrollmentEvents(
  supabase: Db,
  { page, pageSize, dateFrom, dateTo, trainerId, clientId, actorRole, eventType, delivered }: ListEnrollmentEventsParams
): Promise<{ data: AuditEventRow[]; count: number; error: string | null }> {
  let query = auditEventsQuery(supabase)

  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) query = query.lte('created_at', dateTo)
  if (trainerId) query = query.eq('owner_trainer_id', trainerId)
  if (clientId) query = query.eq('client_id', clientId)
  if (actorRole) query = query.eq('actor_role', actorRole)
  if (eventType) query = query.eq('event_type', eventType)
  if (delivered === 'delivered') query = query.eq('notify', true).eq('delivered', true)
  else if (delivered === 'pending') query = query.eq('notify', true).eq('delivered', false)

  const from = page * pageSize
  const { data, count, error } = await query.range(from, from + pageSize - 1)

  return { data: (data ?? []) as AuditEventRow[], count: count ?? 0, error: error?.message ?? null }
}
