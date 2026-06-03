'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useRole } from '@/hooks/useRole'
import styles from './BottomNav.module.css'

const primaryNav = [
  { href: '/dashboard', label: 'Дашборд', icon: (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="2" width="5" height="5" rx="1"/>
      <rect x="9" y="2" width="5" height="5" rx="1"/>
      <rect x="2" y="9" width="5" height="5" rx="1"/>
      <rect x="9" y="9" width="5" height="5" rx="1"/>
    </svg>
  )},
  { href: '/sales', label: 'Продажі', icon: (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="2" width="12" height="12" rx="1.5"/>
      <line x1="2" y1="6.5" x2="14" y2="6.5"/>
      <line x1="6.5" y1="6.5" x2="6.5" y2="14"/>
    </svg>
  )},
  { href: '/clients', label: 'Клієнти', icon: (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="5.5" r="2.8"/>
      <path d="M2.5 13.5c0-3 2.46-5 5.5-5s5.5 2 5.5 5"/>
    </svg>
  )},
  { href: '/schedule', label: 'Розклад', icon: (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="3" width="12" height="11" rx="1.5"/>
      <line x1="2" y1="7" x2="14" y2="7"/>
      <line x1="5.5" y1="1.5" x2="5.5" y2="4.5"/>
      <line x1="10.5" y1="1.5" x2="10.5" y2="4.5"/>
    </svg>
  )},
]

// Пункти, доступні лише owner (зарплати). Для admin фільтруються.
const ownerOnlyMore = ['/settings/salary/rates', '/settings/salary/calculations']

const moreNav = [
  { href: '/accounting', label: 'Звіти' },
  { href: '/schedule/templates', label: 'Шаблони' },
  { href: '/journal', label: 'Журнал' },
  { href: '/settings/salary/rates', label: 'Ставки' },
  { href: '/settings/salary/calculations', label: 'Нарахування' },
  { href: '/settings', label: 'Налаштування' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const role = useRole()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const visibleMore = role === 'owner'
    ? moreNav
    : moreNav.filter(item => !ownerOnlyMore.includes(item.href))

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function isActive(href: string) {
    if (href === '/schedule') return pathname === href
    return pathname.startsWith(href)
  }

  const isMoreActive = visibleMore.some(item => pathname.startsWith(item.href))

  return (
    <>
      {drawerOpen && (
        <div className={styles.drawerOverlay} onClick={() => setDrawerOpen(false)}>
          <div className={styles.drawer} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>Ще</div>
            {visibleMore.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.drawerItem} ${pathname.startsWith(item.href) ? styles.drawerItemActive : ''}`}
                onClick={() => setDrawerOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className={styles.drawerDivider} />
            <button className={styles.drawerLogout} onClick={handleLogout}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3"/>
                <polyline points="11,11 14,8 11,5"/>
                <line x1="14" y1="8" x2="6" y2="8"/>
              </svg>
              Вийти
            </button>
          </div>
        </div>
      )}
      <nav className={styles.nav}>
        {primaryNav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.item} ${isActive(item.href) ? styles.active : ''}`}
          >
            <span className={styles.icon}>{item.icon}</span>
            <span className={styles.label}>{item.label}</span>
          </Link>
        ))}
        <button
          className={`${styles.item} ${styles.moreBtn} ${isMoreActive ? styles.active : ''}`}
          onClick={() => setDrawerOpen(v => !v)}
        >
          <span className={styles.icon}>
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="3.5" cy="8" r="1.2" fill="currentColor" stroke="none"/>
              <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>
              <circle cx="12.5" cy="8" r="1.2" fill="currentColor" stroke="none"/>
            </svg>
          </span>
          <span className={styles.label}>Ще</span>
        </button>
      </nav>
    </>
  )
}
