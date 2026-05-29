'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import HallModal from '@/components/HallModal'
import { MSG } from '@/lib/messages'
import type { Hall } from '@/types'
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

export default function HallsPage() {
  const pathname = usePathname()
  const [halls, setHalls] = useState<Hall[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const fetchHalls = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('halls')
      .select('id, name, capacity, description, is_active')
      .order('name', { ascending: true })
    if (error) setFetchError(error.message)
    else setHalls((data as Hall[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchHalls() }, [fetchHalls])

  async function handleToggle(id: string, newValue: boolean) {
    setToggling(id)
    const { error } = await supabase.from('halls').update({ is_active: newValue }).eq('id', id)
    if (error) toast.error('Не вдалося змінити статус')
    else setHalls(prev => prev.map(h => h.id === id ? { ...h, is_active: newValue } : h))
    setToggling(null)
  }

  const active = halls.filter(h => h.is_active)
  const archived = halls.filter(h => !h.is_active)

  return (
    <>
      <div className={styles.topbar}>
        <h1 className="page-title">Зали</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Додати зал</button>
      </div>
      <nav className={styles.tabNav}>
        {SETTINGS_TABS.map(tab => (
          <a key={tab.href} href={tab.href} className={`${styles.tabNavLink} ${pathname === tab.href ? styles.tabNavLinkActive : ''}`}>{tab.label}</a>
        ))}
      </nav>

      <div className={`${styles.tabSection} page-content`}>
        {loading ? (
          <div className="loading-dots"><span /><span /><span /></div>
        ) : fetchError ? (
          <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
        ) : active.length === 0 ? (
          <div className={styles.empty}>
            <span>{MSG.empty.halls}</span>
            <button className="btn-primary" onClick={() => setShowModal(true)}>+ Додати зал</button>
          </div>
        ) : (
          <>
            <div className={styles.tableDesktop}>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Назва</th><th>Місткість</th><th>Опис</th><th>Статус</th></tr></thead>
                  <tbody>
                    {active.map(h => (
                      <tr key={h.id}>
                        <td className={styles.name}>{h.name}</td>
                        <td className={styles.mono}>{h.capacity} осіб</td>
                        <td className={styles.description}>{h.description ?? '—'}</td>
                        <td><ToggleBtns id={h.id} active={h.is_active} toggling={toggling} onToggle={handleToggle} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={styles.cardList}>
              {active.map(h => (
                <div key={h.id} className={styles.settingCard}>
                  <div className={styles.cardRow}>
                    <span className={styles.name}>{h.name}</span>
                    <div className={styles.cardActions}>
                      <ToggleBtns id={h.id} active={h.is_active} toggling={toggling} onToggle={handleToggle} />
                    </div>
                  </div>
                  <div className={styles.cardMeta}>
                    <span>{h.capacity} осіб</span>
                    {h.description && <span>{h.description}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <ArchiveSection label="Архів залів" count={archived.length} open={archiveOpen} onToggle={() => setArchiveOpen(o => !o)}>
          {archived.length === 0 ? null : (
            <>
              <div className={styles.tableDesktop}>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Назва</th><th>Місткість</th><th>Опис</th><th></th></tr></thead>
                    <tbody>
                      {archived.map(h => (
                        <tr key={h.id} className={styles.archivedRow}>
                          <td className={styles.name}>{h.name}</td>
                          <td className={styles.mono}>{h.capacity} осіб</td>
                          <td className={styles.description}>{h.description ?? '—'}</td>
                          <td>
                            <button className={styles.restoreBtn} onClick={() => handleToggle(h.id, true)} disabled={toggling === h.id}>
                              {toggling === h.id ? '...' : 'Відновити'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className={styles.cardList}>
                {archived.map(h => (
                  <div key={h.id} className={styles.settingCard} style={{ opacity: 0.65 }}>
                    <div className={styles.cardRow}>
                      <span className={styles.name}>{h.name}</span>
                      <button className={styles.restoreBtn} onClick={() => handleToggle(h.id, true)} disabled={toggling === h.id}>
                        {toggling === h.id ? '...' : 'Відновити'}
                      </button>
                    </div>
                    <div className={styles.cardMeta}>
                      <span>{h.capacity} осіб</span>
                      {h.description && <span>{h.description}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </ArchiveSection>
      </div>

      {showModal && (
        <HallModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); toast.success('Збережено'); fetchHalls() }}
        />
      )}
    </>
  )
}
