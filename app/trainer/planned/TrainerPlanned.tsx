'use client'
import { useRouter } from 'next/navigation'
import PlannedView from '@/components/planned/PlannedView'
import styles from './planned.module.css'

export default function TrainerPlanned({ trainerId }: { trainerId: string }) {
  const router = useRouter()
  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => router.push('/trainer')} aria-label="Меню">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 2L4 7l5 5" />
          </svg>
          <span>Меню</span>
        </button>
        <span className={styles.topbarTitle}>Заплановане</span>
        <span className={styles.topbarSpacer} />
      </div>
      <div className={styles.scroll}>
        <PlannedView isStaff={false} viewerTrainerId={trainerId} compact />
      </div>
    </div>
  )
}
