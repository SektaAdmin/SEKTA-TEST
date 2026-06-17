import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import { getMyTrainer } from '@/lib/queries/trainer-cabinet'
import TrainerSchedule from './TrainerSchedule'

export const dynamic = 'force-dynamic'

export default async function TrainerSchedulePage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'client') redirect('/client')

  // owner/admin не мають trainer-профілю — для них viewerTrainerId буде null (staff режим)
  let viewerTrainerId: string | null = null
  if (role === 'trainer') {
    const { data: trainer } = await getMyTrainer(supabase, user.id)
    if (!trainer) redirect('/trainer')
    viewerTrainerId = trainer.id
  }

  return <TrainerSchedule viewerTrainerId={viewerTrainerId} />
}
