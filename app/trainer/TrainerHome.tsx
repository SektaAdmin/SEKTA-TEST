'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOutAndRedirect } from '@/lib/auth/signOut'
import { avatarColor } from '@/lib/avatarColor'
import { ScheduleIcon, JournalIcon, ArrowRightIcon, LogoutIcon } from '@/components/icons/navigation'
import styles from './trainer.module.css'

type Props = {
  trainerId: string
  trainerName: string
}

export default function TrainerHome({ trainerName }: Props) {
  const router = useRouter()
  const initial = (trainerName.trim()[0] || '?').toUpperCase()

  return (
    <>
      <section className={styles.profileCard}>
        <div className={styles.avatar} style={{ background: avatarColor(trainerName) }}>{initial}</div>
        <div className={styles.profileInfo}>
          <div className={styles.profileName}>{trainerName}</div>
          <p className={styles.hint}>Тренер</p>
        </div>
      </section>

      <nav className={styles.menu}>
        <Link href="/trainer/schedule" prefetch className={styles.menuItem}>
          <span className={styles.menuIcon}><ScheduleIcon /></span>
          <span className={styles.menuLabel}>Розклад</span>
          <ArrowRightIcon className={styles.menuArrow} />
        </Link>
        <Link href="/trainer/my" prefetch className={styles.menuItem}>
          <span className={styles.menuIcon}><JournalIcon /></span>
          <span className={styles.menuLabel}>Мої заняття</span>
          <ArrowRightIcon className={styles.menuArrow} />
        </Link>
        <button type="button" className={`${styles.menuItem} ${styles.menuLogout}`} onClick={() => signOutAndRedirect(router)}>
          <span className={styles.menuIcon}><LogoutIcon /></span>
          <span className={styles.menuLabel}>Вийти</span>
        </button>
      </nav>
    </>
  )
}
