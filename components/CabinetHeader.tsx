'use client'
import { useRouter } from 'next/navigation'
import { signOutAndRedirect } from '@/lib/auth/signOut'
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

  // «Назад» — router.back() для миттєвого переходу з кешу Next.js Router.
  // Якщо сторінку відкрили напряму (закладка/refresh/прямий URL) — back() нічого
  // не робить. Fallback: через 150ms перевіряємо чи URL змінився; якщо ні —
  // push на backHref.
  function handleBack() {
    if (!backHref) return
    const urlBefore = window.location.href
    router.back()
    setTimeout(() => {
      if (window.location.href === urlBefore) {
        router.push(backHref)
      }
    }, 150)
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {backHref && (
          <button type="button" onClick={handleBack} className={styles.back} aria-label="Назад">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" focusable="false">
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
        <button type="button" className={styles.logout} onClick={() => signOutAndRedirect(router)} aria-label="Вийти">
          <LogoutIcon />
          <span>Вийти</span>
        </button>
      )}
    </header>
  )
}
