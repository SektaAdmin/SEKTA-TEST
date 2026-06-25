'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOutAndRedirect } from '@/lib/auth/signOut'
import { avatarColor } from '@/lib/avatarColor'
import { ScheduleIcon, JournalIcon, ClientsIcon, ArrowRightIcon, LogoutIcon } from '@/components/icons/navigation'
import styles from './trainer.module.css'

type Props = {
  trainerId: string
  trainerName: string
  telegramConnected: boolean
  telegramLinkToken: string
}

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME

export default function TrainerHome({ trainerName, telegramConnected, telegramLinkToken }: Props) {
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

      <section className={styles.tgCard}>
        <div className={styles.tgInfo}>
          <div className={styles.tgTitle}>Сповіщення в Telegram</div>
          <p className={styles.tgHint}>
            {telegramConnected
              ? 'Надсилаємо записи й скасування на ваші заняття.'
              : 'Отримуйте записи й скасування на ваші заняття.'}
          </p>
        </div>
        {telegramConnected ? (
          <span className={styles.tgConnected}>Підключено ✅</span>
        ) : BOT_USERNAME ? (
          <a
            className={styles.tgConnectBtn}
            href={`https://t.me/${BOT_USERNAME}?start=${telegramLinkToken}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Підключити
          </a>
        ) : null}
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
        <Link href="/trainer/clients" prefetch className={styles.menuItem}>
          <span className={styles.menuIcon}><ClientsIcon /></span>
          <span className={styles.menuLabel}>Клієнти</span>
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
