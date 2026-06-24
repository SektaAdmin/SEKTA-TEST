import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import {
  getMyClient,
  listMySessionBalances,
  listBookableClasses,
  getClassAvailability,
  listMyUpcomingEnrollments,
} from '@/lib/queries/client-cabinet-data'
import { listTrainingTypeLabels } from '@/lib/queries/training-types'
import ClientSchedule from './ClientSchedule'

export const dynamic = 'force-dynamic'

export default async function ClientSchedulePage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'trainer') redirect('/trainer')

  const { data: client } = await getMyClient(supabase, user.id)
  if (!client) redirect('/client')

  // Вікно «сьогодні + 30 днів»: від початку сьогоднішнього дня до кінця 30-го.
  const from = new Date(); from.setHours(0, 0, 0, 0)
  const to = new Date(from); to.setDate(to.getDate() + 31) // +31 щоб включити весь 30-й день
  const fromISO = from.toISOString()
  const toISO = to.toISOString()

  const [{ data: typeLabels }, { data: sessionBalances }, { data: classes }, { data: upcoming }] =
    await Promise.all([
      listTrainingTypeLabels(supabase),
      listMySessionBalances(supabase, client.id),
      listBookableClasses(supabase, fromISO, toISO),
      listMyUpcomingEnrollments(supabase, client.id, fromISO),
    ])

  // Заповненість — окремим запитом по вже отриманих class_id (для тексту «у резерв»).
  const { data: availability } = await getClassAvailability(supabase, classes.map(c => c.id))

  const balanceByType = Object.fromEntries(
    sessionBalances.map(b => [b.ticket_type, b.sessions_balance])
  )

  // class_id → статус активного запису (вже записаний/у черзі — без дубля).
  const initialEnrolled: Record<string, 'enrolled' | 'waitlist'> = {}
  for (const e of upcoming) {
    const cid = e.classes?.id
    if (cid && (e.status === 'enrolled' || e.status === 'waitlist')) {
      initialEnrolled[cid] = e.status
    }
  }

  return (
    <ClientSchedule
      clientId={client.id}
      fromISO={fromISO}
      toISO={toISO}
      typeLabels={typeLabels}
      initialBalanceByType={balanceByType}
      availability={availability}
      initialEnrolled={initialEnrolled}
      initialClasses={classes}
    />
  )
}
