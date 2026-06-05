'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ScheduleIcon, SalesIcon, ArrowRightIcon, LogoutIcon } from '@/components/icons/navigation'
import { STUDIO_TELEGRAM_URL, STUDIO_INSTAGRAM_URL, STUDIO } from '@/lib/studio'
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
        <Link href="/client/visits" className={styles.menuItem}>
          <span className={styles.menuIcon}><ScheduleIcon /></span>
          <span className={styles.menuLabel}>Мої візити</span>
          <ArrowRightIcon className={styles.menuArrow} />
        </Link>
        <Link href="/client/subscriptions" className={styles.menuItem}>
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
      <div className={styles.contactIcons}>
        <a className={styles.contactIcon} href={STUDIO_TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="22" cy="22" r="19"/>
            <path d="M12 23 L32 14.5 L27 31.5 L22 26.5 L18 29 L19.5 24 L27 17.5" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
            <line x1="22" y1="26.5" x2="27" y2="17.5" strokeLinecap="round"/>
          </svg>
          <span className={styles.contactIconLabel}>Telegram</span>
        </a>
        <a className={styles.contactIcon} href={STUDIO_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="22" cy="22" r="19"/>
            <rect x="14" y="14" width="16" height="16" rx="4.5" strokeWidth="1.4"/>
            <circle cx="22" cy="22" r="4" strokeWidth="1.4"/>
            <circle cx="27" cy="17" r="1" fill="currentColor" stroke="none"/>
          </svg>
          <span className={styles.contactIconLabel}>Instagram</span>
        </a>
      </div>
    </>
  )
}
