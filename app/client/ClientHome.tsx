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
            <path d="M12 21c5-2.2 8.5-3.6 10.5-4.4 5-2 6-2.3 6.7-2.3.2 0 .5 0 .7.2.2.2.2.4.2.6v.5l-1.7 8c-.1.5-.4.6-.7.6-.3 0-.6-.2-.9-.4l-2.4-1.8-1.2 1.1c-.2.2-.3.2-.6.2l.2-2.5 5.3-4.8c.2-.2 0-.3-.3-.1l-6.5 4.1-2.8-.9c-.6-.2-.6-.6.2-.9z" strokeWidth="0" fill="currentColor"/>
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
