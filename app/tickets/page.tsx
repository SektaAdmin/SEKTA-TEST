'use client'
import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import TicketModal from '@/components/features/TicketModal'
import { useTickets } from '@/hooks/useTickets'
import { useTrainingTypes } from '@/hooks/useTrainingTypes'
import styles from './tickets.module.css'

export default function TicketsPage() {
  const { tickets, loading, fetchError, toggling, toggle, refetch } = useTickets()
  const { trainingTypes } = useTrainingTypes()
  const [showModal, setShowModal] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  function handleToggle(id: string, newValue: boolean) {
    toggle(id, newValue)
  }

  function handleSaved() {
    setShowModal(false)
    refetch()
  }

  const active = tickets.filter(t => t.is_active)
  const archived = tickets.filter(t => !t.is_active)

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Абонементи</h1>
          <button className={styles.btnNew} onClick={() => setShowModal(true)}>
            + Додати абонемент
          </button>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Завантаження...</div>
          ) : fetchError ? (
            <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
          ) : active.length === 0 ? (
            <div className={styles.empty}>Активних абонементів немає</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Назва</th>
                    <th>Тип</th>
                    <th>Занять</th>
                    <th>Ціна</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map(t => (
                    <tr key={t.id}>
                      <td className={styles.name}>{t.name}</td>
                      <td>
                        <span className={styles.typeBadge}>
                          {t.ticket_type}
                        </span>
                      </td>
                      <td className={styles.mono}>{t.sessions}</td>
                      <td className={styles.mono}>{t.price.toLocaleString('uk-UA')} ₴</td>
                      <td>
                        <div className={styles.toggleBtns}>
                          <button
                            className={`${styles.toggleBtn} ${styles.toggleTrue} ${t.is_active ? styles.toggleActiveTrue : ''}`}
                            onClick={() => !t.is_active && handleToggle(t.id, true)}
                            disabled={toggling === t.id || t.is_active}
                            aria-pressed={t.is_active}
                          >
                            TRUE
                          </button>
                          <button
                            className={`${styles.toggleBtn} ${styles.toggleFalse} ${!t.is_active ? styles.toggleActiveFalse : ''}`}
                            onClick={() => t.is_active && handleToggle(t.id, false)}
                            disabled={toggling === t.id || !t.is_active}
                            aria-pressed={!t.is_active}
                          >
                            FALSE
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Archive section */}
          <div className={styles.archiveSection}>
            <button
              className={styles.archiveToggle}
              onClick={() => setArchiveOpen(o => !o)}
              aria-expanded={archiveOpen}
            >
              <span className={`${styles.archiveChevron} ${archiveOpen ? styles.archiveChevronOpen : ''}`}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2.5 4.5l3.5 3.5 3.5-3.5"/>
                </svg>
              </span>
              Архів абонементів
              <span className={styles.archiveCount}>{archived.length}</span>
            </button>

            {archiveOpen && (
              archived.length === 0 ? (
                <div className={styles.archiveEmpty}>Архів порожній</div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Назва</th>
                        <th>Тип</th>
                        <th>Занять</th>
                        <th>Ціна</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {archived.map(t => (
                        <tr key={t.id} className={styles.archivedRow}>
                          <td className={styles.name}>{t.name}</td>
                          <td>
                            <span className={styles.typeBadge}>
                              {t.ticket_type}
                            </span>
                          </td>
                          <td className={styles.mono}>{t.sessions}</td>
                          <td className={styles.mono}>{t.price.toLocaleString('uk-UA')} ₴</td>
                          <td>
                            <button
                              className={styles.restoreBtn}
                              onClick={() => handleToggle(t.id, true)}
                              disabled={toggling === t.id}
                            >
                              {toggling === t.id ? '...' : 'Відновити'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </div>
      </main>

      {showModal && (
        <TicketModal
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
          trainingTypes={trainingTypes.filter(t => t.is_active)}
        />
      )}
    </div>
  )
}
