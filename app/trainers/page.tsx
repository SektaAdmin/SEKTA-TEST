'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import TrainerModal from '@/components/TrainerModal'
import type { Trainer } from '@/types'
import styles from './trainers.module.css'

const supabase = createClient()

export default function TrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const fetchTrainers = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('trainers')
      .select('id, name, is_active, instagram_username, telegram_username')
      .order('name', { ascending: true })
    setTrainers((data as Trainer[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTrainers() }, [fetchTrainers])

  async function handleToggle(id: string, newValue: boolean) {
    setToggling(id)
    await supabase.from('trainers').update({ is_active: newValue }).eq('id', id)
    setTrainers(prev =>
      prev.map(t => t.id === id ? { ...t, is_active: newValue } : t)
    )
    setToggling(null)
  }

  function handleSaved() {
    setShowModal(false)
    fetchTrainers()
  }

  const active = trainers.filter(t => t.is_active)
  const archived = trainers.filter(t => !t.is_active)

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Тренери</h1>
          <button className={styles.btnNew} onClick={() => setShowModal(true)}>
            + Додати тренера
          </button>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Завантаження...</div>
          ) : active.length === 0 ? (
            <div className={styles.empty}>Активних тренерів немає</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Ім&apos;я</th>
                    <th>Instagram</th>
                    <th>Telegram</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map(t => (
                    <tr key={t.id}>
                      <td className={styles.name}>{t.name}</td>
                      <td className={styles.handle}>
                        {t.instagram_username
                          ? <span>@{t.instagram_username}</span>
                          : <span className={styles.empty2}>—</span>}
                      </td>
                      <td className={styles.handle}>
                        {t.telegram_username
                          ? <span>@{t.telegram_username}</span>
                          : <span className={styles.empty2}>—</span>}
                      </td>
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
              Архів тренерів
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
                        <th>Ім&apos;я</th>
                        <th>Instagram</th>
                        <th>Telegram</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {archived.map(t => (
                        <tr key={t.id} className={styles.archivedRow}>
                          <td className={styles.name}>{t.name}</td>
                          <td className={styles.handle}>
                            {t.instagram_username
                              ? <span>@{t.instagram_username}</span>
                              : <span className={styles.empty2}>—</span>}
                          </td>
                          <td className={styles.handle}>
                            {t.telegram_username
                              ? <span>@{t.telegram_username}</span>
                              : <span className={styles.empty2}>—</span>}
                          </td>
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
        <TrainerModal
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
