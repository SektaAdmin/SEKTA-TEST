'use client'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import styles from './Sidebar.module.css'

const nav = [
  { href: '/calendar', label: 'Календар', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="2.5" width="12" height="11" rx="1.5"/>
      <line x1="5" y1="1" x2="5" y2="4"/>
      <line x1="11" y1="1" x2="11" y2="4"/>
      <line x1="2" y1="6.5" x2="14" y2="6.5"/>
      <rect x="4.5" y="8.5" width="2" height="2" rx="0.3"/>
      <rect x="9" y="8.5" width="2" height="2" rx="0.3"/>
    </svg>
  )},
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
  { href: '/tickets', label: 'Абонементи', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="3.5" width="12" height="9" rx="1.5"/>
      <line x1="5" y1="7.5" x2="11" y2="7.5"/>
      <line x1="5" y1="10" x2="8.5" y2="10"/>
    </svg>
  )},
  { href: '/trainers', label: 'Тренери', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="5.5" cy="5.5" r="2.5"/>
      <path d="M1 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/>
      <path d="M11 7.5l1.5 1.5L15 6"/>
    </svg>
  )},
  { href: '/halls', label: 'Зали', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1" y="5" width="14" height="9" rx="1.5"/>
      <path d="M5 14V9h6v5"/>
      <line x1="1" y1="8" x2="15" y2="8"/>
      <path d="M6 5V3.5a2 2 0 014 0V5"/>
    </svg>
  )},
  { href: '/schedules', label: 'Розклад', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="2.5" width="12" height="11" rx="1.5"/>
      <line x1="5" y1="1" x2="5" y2="4"/>
      <line x1="11" y1="1" x2="11" y2="4"/>
      <line x1="2" y1="6.5" x2="14" y2="6.5"/>
      <rect x="4.5" y="8.5" width="2" height="2" rx="0.3"/>
      <rect x="9" y="8.5" width="2" height="2" rx="0.3"/>
    </svg>
  )},
  { href: '/regular-enrollments', label: 'Постійники', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="5.5" cy="5" r="2.2"/>
      <path d="M1 13c0-2.2 2-3.8 4.5-3.8s4.5 1.6 4.5 3.8"/>
      <path d="M11 7.5l1.2 1.2L14.5 6"/>
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
      <nav className={styles.nav}>
        {nav.map(item => (
          <a
            key={item.href}
            href={item.href}
            className={`${styles.item} ${pathname.startsWith(item.href) ? styles.active : ''}`}
          >
            <span className={styles.icon}>{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
      <button className={styles.logout} onClick={handleLogout}>
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
