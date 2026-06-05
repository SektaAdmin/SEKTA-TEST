'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LogoutIcon } from './icons/navigation'
import styles from './CabinetHeader.module.css'

/**
 * Шапка особистого кабінету (тренер/клієнт).
 * - Головна (без backHref): лого SEKTA + опційний `address` (адреса студії) +
 *   `title`/`subtitle`.
 * - Під-екран (з backHref): кнопка «‹ назад» + `title` (назва екрана), без лого
 *   й адреси (як у референсі Altegio).
 */
export default function CabinetHeader({
  title,
  subtitle,
  address,
  backHref,
  hideLogout,
}: {
  title: string
  subtitle?: string
  address?: string
  backHref?: string
  hideLogout?: boolean
}) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // «Назад» — нативна історія (миттєво з клієнт-кешу роутера), а не Link на
  // backHref (той рендерив би force-dynamic-сторінку з нуля на сервері). Якщо
  // історії в межах застосунку немає (прямий захід/закладка/refresh) — fallback
  // на backHref через push. Ознака «прийшли зсередини» — referrer того ж origin.
  function handleBack() {
    if (!backHref) return
    const sameOrigin =
      typeof document !== 'undefined' &&
      document.referrer &&
      new URL(document.referrer).origin === window.location.origin
    if (sameOrigin && window.history.length > 1) {
      router.back()
    } else {
      router.push(backHref)
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {backHref && (
          <button type="button" onClick={handleBack} className={styles.back} aria-label="Назад">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12.5 4 7 10l5.5 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <div>
          {!backHref && <div className={styles.logo}>SEKTA</div>}
          <h1 className={styles.title}>{title}</h1>
          {address && <p className={styles.address}>{address}</p>}
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>
      {!hideLogout && (
        <button type="button" className={styles.logout} onClick={handleLogout} aria-label="Вийти">
          <LogoutIcon />
          <span>Вийти</span>
        </button>
      )}
    </header>
  )
}
