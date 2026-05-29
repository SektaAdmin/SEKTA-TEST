'use client'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { SalesIcon, ClientsIcon, ScheduleIcon, TemplatesIcon, AccountingIcon, SettingsIcon, LogoutIcon, JournalIcon } from './icons/navigation'
import styles from './Sidebar.module.css'

const nav = [
  { href: '/sales', label: 'Продажи', icon: <SalesIcon /> },
  { href: '/clients', label: 'Клієнти', icon: <ClientsIcon /> },
  { href: '/schedule', label: 'Розклад', icon: <ScheduleIcon /> },
  { href: '/schedule/templates', label: 'Шаблони', icon: <TemplatesIcon /> },
  { href: '/journal', label: 'Журнал', icon: <JournalIcon /> },
  { href: '/accounting', label: 'Звітність', icon: <AccountingIcon /> },
]

const settingsSubNav = [
  { href: '/settings/tickets', label: 'Абонементи' },
  { href: '/settings/trainers', label: 'Тренери' },
  { href: '/settings/halls', label: 'Зали' },
  { href: '/settings/training-types', label: 'Типи тренувань' },
]

const salarySubNav = [
  { href: '/settings/salary/rates', label: 'Ставки' },
  { href: '/settings/salary/calculations', label: 'Нарахування' },
]

function Chevron({ open }: { open: boolean }) {
  return (
    <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 3.5l3 3 3-3"/>
      </svg>
    </span>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const isInSettings = pathname.startsWith('/settings')
  const isInSalary = pathname.startsWith('/settings/salary')
  const [settingsOpen, setSettingsOpen] = useState(isInSettings)
  const [salaryOpen, setSalaryOpen] = useState(isInSalary)

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

        <button
          type="button"
          className={styles.item}
          onClick={() => setSettingsOpen(o => !o)}
          aria-expanded={settingsOpen}
        >
          <span className={styles.icon} aria-hidden="true"><SettingsIcon /></span>
          Налаштування
          <Chevron open={settingsOpen} />
        </button>

        {settingsOpen && (
          <ul className={styles.subNav}>
            {settingsSubNav.map(item => {
              const isActive = pathname === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${styles.subItem} ${isActive ? styles.subItemActive : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}

            <li>
              <button
                type="button"
                className={`${styles.subItem} ${styles.subItemBtn} ${isInSalary ? styles.subItemActive : ''}`}
                onClick={() => setSalaryOpen(o => !o)}
                aria-expanded={salaryOpen}
              >
                Зарплати
                <Chevron open={salaryOpen} />
              </button>
              {salaryOpen && (
                <ul className={styles.subSubNav}>
                  {salarySubNav.map(item => {
                    const isActive = pathname === item.href
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`${styles.subSubItem} ${isActive ? styles.subItemActive : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          {item.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          </ul>
        )}
      </nav>
      <button type="button" className={styles.logout} onClick={handleLogout} aria-label="Вийти з системи">
        <LogoutIcon />
        Вийти
      </button>
    </aside>
  )
}
