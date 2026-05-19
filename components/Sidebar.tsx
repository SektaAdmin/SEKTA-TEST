'use client'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import styles from './Sidebar.module.css'

const nav = [
  { href: '/sales', label: 'Продажи', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="2" width="12" height="12" rx="1.5"/>
      <line x1="2" y1="6.5" x2="14" y2="6.5"/>
      <line x1="6.5" y1="6.5" x2="6.5" y2="14"/>
    </svg>
  )},
  { href: '/clients', label: 'Клієнти', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="5.5" r="2.8"/>
      <path d="M2.5 13.5c0-3 2.46-5 5.5-5s5.5 2 5.5 5"/>
    </svg>
  )},
  { href: '/schedule', label: 'Розклад', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="3" width="12" height="11" rx="1.5"/>
      <line x1="2" y1="7" x2="14" y2="7"/>
      <line x1="5.5" y1="1.5" x2="5.5" y2="4.5"/>
      <line x1="10.5" y1="1.5" x2="10.5" y2="4.5"/>
    </svg>
  )},
  { href: '/schedule/templates', label: 'Шаблони', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="2" width="12" height="12" rx="1.5"/>
      <line x1="5" y1="6" x2="11" y2="6"/>
      <line x1="5" y1="9" x2="9" y2="9"/>
      <line x1="11" y1="9" x2="11" y2="13"/>
      <line x1="9" y1="11" x2="13" y2="11"/>
    </svg>
  )},
  { href: '/accounting', label: 'Звітність', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <line x1="3" y1="12" x2="3" y2="7"/>
      <line x1="7" y1="12" x2="7" y2="4"/>
      <line x1="11" y1="12" x2="11" y2="9"/>
      <line x1="1" y1="12" x2="15" y2="12"/>
    </svg>
  )},
  { href: '/settings', label: 'Налаштування', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="2.2"/>
      <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M12.6 3.4l-.9.9M4.3 11.7l-.9.9"/>
    </svg>
  )},
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>SEKTA</div>
      <nav className={styles.nav} aria-label="Основна навігація">
        {nav.map(item => {
          const isActive = item.href === '/schedule'
            ? pathname === '/schedule' || pathname.startsWith('/schedule/')
            : pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.item} ${isActive ? styles.active : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={styles.icon} aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
      <button type="button" className={styles.logout} onClick={handleLogout} aria-label="Вийти з системи">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3"/>
          <polyline points="11,11 14,8 11,5"/>
          <line x1="14" y1="8" x2="6" y2="8"/>
        </svg>
        Вийти
      </button>
    </aside>
  )
}
