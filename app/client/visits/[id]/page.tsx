import { redirect, notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import {
  getMyClient,
  getMyEnrollmentDetail,
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

  const { data: enrollment } = await getMyEnrollmentDetail(supabase, client.id, params.id)
  if (!enrollment) notFound()

  const [{ data: typeLabels }] = await Promise.all([typeLabelsP])
  const isPast = new Date(enrollment.classes.starts_at).getTime() <= Date.now()

  return (
    <>
      <CabinetHeader title={isPast ? 'Минулий запис' : 'Майбутній запис'} backHref="/client/visits" hideLogout />
      <div className={styles.scroll}>
        <VisitDetail
          enrollment={enrollment}
          typeLabels={typeLabels}
          isPast={isPast}
        />
      </div>
    </>
  )
}
