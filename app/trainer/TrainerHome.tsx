'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
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
  const [disconnecting, setDisconnecting] = useState(false)

  async function handleDisconnect() {
    if (disconnecting) return
    setDisconnecting(true)
    try {
      const res = await fetch('/api/telegram/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error('failed')
      toast.success('Сповіщення в Telegram вимкнено')
      router.refresh() // перечитати серверні props → картка стане «Підключити»
    } catch {
      toast.error('Не вдалося відключити. Спробуйте пізніше.')
      setDisconnecting(false)
    }
  }

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
          <div className={styles.tgConnectedWrap}>
            <span className={styles.tgConnected}>Підключено ✅</span>
            <button
              type="button"
              className={styles.tgDisconnectBtn}
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? 'Відключення…' : 'Відключити'}
            </button>
          </div>
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
