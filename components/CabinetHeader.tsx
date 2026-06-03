'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LogoutIcon } from './icons/navigation'
import styles from './CabinetHeader.module.css'

/** Шапка особистого кабінету (тренер/клієнт): назва + кнопка виходу. */
export default function CabinetHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className={styles.header}>
      <div>
        <div className={styles.logo}>SEKTA</div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      <button type="button" className={styles.logout} onClick={handleLogout} aria-label="Вийти">
        <LogoutIcon />
        <span>Вийти</span>
      </button>
    </header>
  )
}
