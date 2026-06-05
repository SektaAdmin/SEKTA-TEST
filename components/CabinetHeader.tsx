'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LogoutIcon } from './icons/navigation'
import styles from './CabinetHeader.module.css'

/**
 * Шапка особистого кабінету (тренер/клієнт): назва + кнопка виходу.
 * `backHref` — якщо задано, зліва зʼявляється кнопка «‹ назад» (для під-екранів
 * кабінету: /client/visits, /client/subscriptions, деталі запису).
 */
export default function CabinetHeader({
  title,
  subtitle,
  backHref,
}: {
  title: string
  subtitle?: string
  backHref?: string
}) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {backHref && (
          <Link href={backHref} className={styles.back} aria-label="Назад">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12.5 4 7 10l5.5 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        )}
        <div>
          <div className={styles.logo}>SEKTA</div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>
      <button type="button" className={styles.logout} onClick={handleLogout} aria-label="Вийти">
        <LogoutIcon />
        <span>Вийти</span>
      </button>
    </header>
  )
}
