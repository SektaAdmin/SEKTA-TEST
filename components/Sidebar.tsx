'use client'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SalesIcon, ClientsIcon, ScheduleIcon, TemplatesIcon, AccountingIcon, SettingsIcon, LogoutIcon } from './icons/navigation'
import styles from './Sidebar.module.css'

const nav = [
  { href: '/sales', label: 'Продажи', icon: <SalesIcon /> },
  { href: '/clients', label: 'Клієнти', icon: <ClientsIcon /> },
  { href: '/schedule', label: 'Розклад', icon: <ScheduleIcon /> },
  { href: '/schedule/templates', label: 'Шаблони', icon: <TemplatesIcon /> },
  { href: '/accounting', label: 'Звітність', icon: <AccountingIcon /> },
  { href: '/settings', label: 'Налаштування', icon: <SettingsIcon /> },
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
        <LogoutIcon />
        Вийти
      </button>
    </aside>
  )
}
