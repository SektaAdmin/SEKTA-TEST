'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ScheduleIcon, SalesIcon, ArrowRightIcon, LogoutIcon } from '@/components/icons/navigation'
import StudioContactIcons from '@/components/StudioContactIcons'
import styles from './client.module.css'

type Contacts = {
  phone: string | null
  instagram_username: string | null
  telegram_username: string | null
} | null

type Props = {
  name: string
  email: string | null
  contacts: Contacts
}

/** Головна кабінету клієнта — меню-лаунчер (профіль + розділи + вихід). */
export default function ClientHome({ name, email, contacts }: Props) {
  const router = useRouter()
  const initial = (name.trim()[0] || '?').toUpperCase()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <section className={styles.profileCard}>
        <div className={styles.avatar}>{initial}</div>
        <div className={styles.profileInfo}>
          <div className={styles.profileName}>{name || 'Клієнт'}</div>
          {email && <div className={styles.profileContact}>{email}</div>}
          {contacts?.phone && <div className={styles.profileContact}>{contacts.phone}</div>}
        </div>
      </section>
      <p className={styles.profileHintHome}>Щоб змінити дані, зверніться до адміністрації студії.</p>

      <nav className={styles.menu}>
        {/* prefetch — Next тягне роут заздалегідь, тап відкривається миттєво. */}
        <Link href="/client/visits" prefetch className={styles.menuItem}>
          <span className={styles.menuIcon}><ScheduleIcon /></span>
          <span className={styles.menuLabel}>Мої візити</span>
          <ArrowRightIcon className={styles.menuArrow} />
        </Link>
        <Link href="/client/subscriptions" prefetch className={styles.menuItem}>
          <span className={styles.menuIcon}><SalesIcon /></span>
          <span className={styles.menuLabel}>Абонементи</span>
          <ArrowRightIcon className={styles.menuArrow} />
        </Link>
        <button type="button" className={`${styles.menuItem} ${styles.menuLogout}`} onClick={handleLogout}>
          <span className={styles.menuIcon}><LogoutIcon /></span>
          <span className={styles.menuLabel}>Вийти</span>
        </button>
      </nav>

      <div className={`${styles.sectionLabel} ${styles.sectionLabelCenter}`}>Контакти</div>
      <StudioContactIcons styles={styles} />
    </>
  )
}
