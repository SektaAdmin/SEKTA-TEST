import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import { getMyTrainer } from '@/lib/queries/trainer-cabinet'
import CabinetHeader from '@/components/CabinetHeader'
import TrainerHome from './TrainerHome'
import styles from './trainer.module.css'

export const dynamic = 'force-dynamic'

export default async function TrainerCabinet() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'client') redirect('/client')

  const { data: trainer } = await getMyTrainer(supabase, user.id)

  if (!trainer) {
    return (
      <>
        <CabinetHeader title="Кабінет тренера" />
        <div className={styles.scroll}>
          <p className={styles.empty}>Профіль тренера не привʼязано до цього логіну. Зверніться до адміністратора.</p>
        </div>
      </>
    )
  }

  return (
    <>
      <CabinetHeader title={trainer.name} subtitle="Кабінет тренера" hideLogout />
      <div className={styles.scroll}>
        <TrainerHome
          trainerId={trainer.id}
          trainerName={trainer.name}
          telegramConnected={trainer.telegram_chat_id != null}
          telegramLinkToken={trainer.telegram_link_token}
        />
      </div>
    </>
  )
}
