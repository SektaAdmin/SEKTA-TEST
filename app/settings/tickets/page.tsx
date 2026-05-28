'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import TicketModal from '@/components/TicketModal'
import { useTickets } from '@/hooks/useTickets'
import { useRefs } from '@/contexts/RefsContext'
import { formatMoney } from '@/lib/formatters'
import { MSG } from '@/lib/messages'
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

export default function TicketsPage() {
  const pathname = usePathname()
  const { tickets, loading, fetchError, toggling, toggle, refetch } = useTickets()
  const { trainingTypes } = useRefs()
  const [showModal, setShowModal] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const typeLabel = (code: string) =>
    trainingTypes.find(t => t.code === code)?.label ?? code

  function handleSaved() {
    setShowModal(false)
    refetch()
    toast.success('Збережено')
  }

  const active = tickets.filter(t => t.is_active)
  const archived = tickets.filter(t => !t.is_active)

  return (
    <>
      <div className={styles.topbar}>
        <h1 className="page-title">Абонементи</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Додати абонемент</button>
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
            <span>{MSG.empty.tickets}</span>
            <button className="btn-primary" onClick={() => setShowModal(true)}>+ Додати абонемент</button>
          </div>
        ) : (
          <>
            <div className={styles.tableDesktop}>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr>
                    <th>Назва</th><th>Тип</th><th>Занять</th><th>Ціна</th><th>Статус</th>
                  </tr></thead>
                  <tbody>
                    {active.map(t => (
                      <tr key={t.id}>
                        <td className={styles.name}>{t.name}</td>
                        <td><span className={styles.typeBadge}>{typeLabel(t.ticket_type)}</span></td>
                        <td className={styles.mono}>{t.sessions}</td>
                        <td className={styles.mono}>{formatMoney(t.price)}</td>
                        <td><ToggleBtns id={t.id} active={t.is_active} toggling={toggling} onToggle={toggle} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={styles.cardList}>
              {active.map(t => (
                <div key={t.id} className={styles.settingCard}>
                  <div className={styles.cardRow}>
                    <span className={styles.name}>{t.name}</span>
                    <div className={styles.cardActions}>
                      <ToggleBtns id={t.id} active={t.is_active} toggling={toggling} onToggle={toggle} />
                    </div>
                  </div>
                  <div className={styles.cardMeta}>
                    <span><span className={styles.typeBadge}>{typeLabel(t.ticket_type)}</span></span>
                    <span>{t.sessions} занять</span>
                    <span>{formatMoney(t.price)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <ArchiveSection label="Архів абонементів" count={archived.length} open={archiveOpen} onToggle={() => setArchiveOpen(o => !o)}>
          {archived.length === 0 ? null : (
            <>
              <div className={styles.tableDesktop}>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Назва</th><th>Тип</th><th>Занять</th><th>Ціна</th><th></th></tr></thead>
                    <tbody>
                      {archived.map(t => (
                        <tr key={t.id} className={styles.archivedRow}>
                          <td className={styles.name}>{t.name}</td>
                          <td><span className={styles.typeBadge}>{typeLabel(t.ticket_type)}</span></td>
                          <td className={styles.mono}>{t.sessions}</td>
                          <td className={styles.mono}>{formatMoney(t.price)}</td>
                          <td>
                            <button className={styles.restoreBtn} onClick={() => toggle(t.id, true)} disabled={toggling === t.id}>
                              {toggling === t.id ? '...' : 'Відновити'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className={styles.cardList}>
                {archived.map(t => (
                  <div key={t.id} className={styles.settingCard} style={{ opacity: 0.65 }}>
                    <div className={styles.cardRow}>
                      <span className={styles.name}>{t.name}</span>
                      <button className={styles.restoreBtn} onClick={() => toggle(t.id, true)} disabled={toggling === t.id}>
                        {toggling === t.id ? '...' : 'Відновити'}
                      </button>
                    </div>
                    <div className={styles.cardMeta}>
                      <span><span className={styles.typeBadge}>{typeLabel(t.ticket_type)}</span></span>
                      <span>{t.sessions} занять</span>
                      <span>{formatMoney(t.price)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </ArchiveSection>
      </div>

      {showModal && <TicketModal onClose={() => setShowModal(false)} onSaved={handleSaved} />}
    </>
  )
}
