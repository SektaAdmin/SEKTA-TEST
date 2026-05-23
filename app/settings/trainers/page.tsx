'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import TrainerModal from '@/components/TrainerModal'
import { MSG } from '@/lib/messages'
import type { Trainer } from '@/types'
import styles from '../settings.module.css'

const SETTINGS_TABS = [
  { href: '/settings/tickets', label: 'Абонементи' },
  { href: '/settings/trainers', label: 'Тренери' },
  { href: '/settings/halls', label: 'Зали' },
  { href: '/settings/training-types', label: 'Типи' },
]

function ToggleBtns({ id, active, toggling, onToggle }: {
  id: string; active: boolean; toggling: string | null; onToggle: (id: string, v: boolean) => void
}) {
  return (
    <div className={styles.toggleBtns}>
      <button
        className={`${styles.toggleBtn} ${styles.toggleTrue} ${active ? styles.toggleActiveTrue : ''}`}
        onClick={() => !active && onToggle(id, true)}
        disabled={toggling === id || active}
        aria-pressed={active}
      >TRUE</button>
      <button
        className={`${styles.toggleBtn} ${styles.toggleFalse} ${!active ? styles.toggleActiveFalse : ''}`}
        onClick={() => active && onToggle(id, false)}
        disabled={toggling === id || !active}
        aria-pressed={!active}
      >FALSE</button>
    </div>
  )
}

function ArchiveSection({ label, count, open, onToggle, children }: {
  label: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className={styles.archiveSection}>
      <button className={styles.archiveToggle} onClick={onToggle} aria-expanded={open}>
        <span className={`${styles.archiveChevron} ${open ? styles.archiveChevronOpen : ''}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2.5 4.5l3.5 3.5 3.5-3.5"/>
          </svg>
        </span>
        {label}
        <span className={styles.archiveCount}>{count}</span>
      </button>
      {open && (count === 0 ? <div className={styles.archiveEmpty}>Архів порожній</div> : children)}
    </div>
  )
}

export default function TrainersPage() {
  const pathname = usePathname()
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const fetchTrainers = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('trainers')
      .select('id, name, is_active, instagram_username, telegram_username')
      .order('name', { ascending: true })
    if (error) setFetchError(error.message)
    else setTrainers((data as Trainer[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTrainers() }, [fetchTrainers])

  async function handleToggle(id: string, newValue: boolean) {
    setToggling(id)
    const { error } = await supabase.from('trainers').update({ is_active: newValue }).eq('id', id)
    if (error) toast.error('Не вдалося змінити статус')
    else setTrainers(prev => prev.map(t => t.id === id ? { ...t, is_active: newValue } : t))
    setToggling(null)
  }

  const active = trainers.filter(t => t.is_active)
  const archived = trainers.filter(t => !t.is_active)

  return (
    <>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Тренери</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Додати тренера</button>
        <nav className={styles.mobileTabNav}>
          {SETTINGS_TABS.map(tab => (
            <a key={tab.href} href={tab.href} className={`${styles.mobileTabLink} ${pathname === tab.href ? styles.mobileTabLinkActive : ''}`}>{tab.label}</a>
          ))}
        </nav>
      </div>

      <div className={styles.tabSection}>
        {loading ? (
          <div className="loading-dots"><span /><span /><span /></div>
        ) : fetchError ? (
          <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
        ) : active.length === 0 ? (
          <div className={styles.empty}>
            <span>{MSG.empty.trainers}</span>
            <button className="btn-primary" onClick={() => setShowModal(true)}>+ Додати тренера</button>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Ім&apos;я</th><th>Instagram</th><th>Telegram</th><th>Статус</th></tr></thead>
              <tbody>
                {active.map(t => (
                  <tr key={t.id}>
                    <td className={styles.name}>{t.name}</td>
                    <td className={styles.handle}>{t.instagram_username ? <span>@{t.instagram_username}</span> : <span className={styles.dash}>—</span>}</td>
                    <td className={styles.handle}>{t.telegram_username ? <span>@{t.telegram_username}</span> : <span className={styles.dash}>—</span>}</td>
                    <td><ToggleBtns id={t.id} active={t.is_active} toggling={toggling} onToggle={handleToggle} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ArchiveSection label="Архів тренерів" count={archived.length} open={archiveOpen} onToggle={() => setArchiveOpen(o => !o)}>
          {archived.length === 0 ? null : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Ім&apos;я</th><th>Instagram</th><th>Telegram</th><th></th></tr></thead>
                <tbody>
                  {archived.map(t => (
                    <tr key={t.id} className={styles.archivedRow}>
                      <td className={styles.name}>{t.name}</td>
                      <td className={styles.handle}>{t.instagram_username ? <span>@{t.instagram_username}</span> : <span className={styles.dash}>—</span>}</td>
                      <td className={styles.handle}>{t.telegram_username ? <span>@{t.telegram_username}</span> : <span className={styles.dash}>—</span>}</td>
                      <td>
                        <button className={styles.restoreBtn} onClick={() => handleToggle(t.id, true)} disabled={toggling === t.id}>
                          {toggling === t.id ? '...' : 'Відновити'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ArchiveSection>
      </div>

      {showModal && (
        <TrainerModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); toast.success('Збережено'); fetchTrainers() }}
        />
      )}
    </>
  )
}
