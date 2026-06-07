import { redirect, notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import {
  getMyClient,
  getMyEnrollmentDetail,
  getBaseTicketPrice,
  listMySessionBalances,
  calcSessionBalanceAfter,
} from '@/lib/queries/client-cabinet-data'
import { listTrainingTypeLabels } from '@/lib/queries/training-types'
import CabinetHeader from '@/components/CabinetHeader'
import VisitDetail from './VisitDetail'
import styles from '../../client.module.css'

export const dynamic = 'force-dynamic'

export default async function VisitDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'trainer') redirect('/trainer')

  // typeLabels ні від чого не залежить — стартуємо одразу, паралельно всьому.
  const typeLabelsP = listTrainingTypeLabels(supabase)

  const { data: client } = await getMyClient(supabase, user.id)
  if (!client) redirect('/client')

  // enrollment і sessionBalances залежать лише від client.id (не один від
  // одного) — тягнемо паралельно, а не послідовно.
  const [{ data: enrollment }, { data: sessionBalances }] = await Promise.all([
    getMyEnrollmentDetail(supabase, client.id, params.id),
    listMySessionBalances(supabase, client.id),
  ])
  if (!enrollment) notFound()

  const ticketType = enrollment.classes.ticket_type
  const startsAt = enrollment.classes.starts_at
  const rawBalance = sessionBalances.find(s => s.ticket_type === ticketType)?.sessions_balance ?? 0

  const [{ data: basePrice }, { data: typeLabels }, { data: sessionBalance }] = await Promise.all([
    getBaseTicketPrice(supabase, ticketType),
    typeLabelsP,
    calcSessionBalanceAfter(supabase, client.id, ticketType, rawBalance, startsAt),
  ])
  const isPast = new Date(enrollment.classes.starts_at).getTime() <= Date.now()

  return (
    <>
      <CabinetHeader title={isPast ? 'Минулий запис' : 'Майбутній запис'} backHref="/client/visits" hideLogout />
      <div className={styles.scroll}>
        <VisitDetail
          enrollment={enrollment}
          basePrice={basePrice}
          sessionBalance={sessionBalance}
          typeLabels={typeLabels}
          isPast={isPast}
        />
      </div>
    </>
  )
}
