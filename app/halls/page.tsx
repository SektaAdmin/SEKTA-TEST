'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import HallModal from '@/components/HallModal'
import type { Hall } from '@/types'
import styles from './halls.module.css'


export default function HallsPage() {
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
    if (error) {
      setFetchError(error.message)
    } else {
      setHalls((data as Hall[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchHalls() }, [fetchHalls])

  async function handleToggle(id: string, newValue: boolean) {
    setToggling(id)
    const { error } = await supabase.from('halls').update({ is_active: newValue }).eq('id', id)
    if (error) {
      toast.error('Не вдалося змінити статус')
    } else {
      setHalls(prev =>
        prev.map(h => h.id === id ? { ...h, is_active: newValue } : h)
      )
    }
    setToggling(null)
  }

  function handleSaved() {
    setShowModal(false)
    toast.success('Збережено')
    fetchHalls()
  }

  const active = halls.filter(h => h.is_active)
  const archived = halls.filter(h => !h.is_active)

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Зали</h1>
          <button className={styles.btnNew} onClick={() => setShowModal(true)}>
            + Додати зал
          </button>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}><span /><span /><span /></div>
          ) : fetchError ? (
            <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
          ) : active.length === 0 ? (
            <div className={styles.empty}>
              <span>Активних залів немає</span>
              <button className={styles.btnNew} onClick={() => setShowModal(true)}>+ Додати зал</button>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Назва</th>
                    <th>Місткість</th>
                    <th>Опис</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map(h => (
                    <tr key={h.id}>
                      <td className={styles.name}>{h.name}</td>
                      <td className={styles.mono}>{h.capacity} осіб</td>
                      <td className={styles.description}>{h.description ?? '—'}</td>
                      <td>
                        <div className={styles.toggleBtns}>
                          <button
                            className={`${styles.toggleBtn} ${styles.toggleTrue} ${h.is_active ? styles.toggleActiveTrue : ''}`}
                            onClick={() => !h.is_active && handleToggle(h.id, true)}
                            disabled={toggling === h.id || h.is_active}
                            aria-pressed={h.is_active}
                          >
                            TRUE
                          </button>
                          <button
                            className={`${styles.toggleBtn} ${styles.toggleFalse} ${!h.is_active ? styles.toggleActiveFalse : ''}`}
                            onClick={() => h.is_active && handleToggle(h.id, false)}
                            disabled={toggling === h.id || !h.is_active}
                            aria-pressed={!h.is_active}
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
              Архів залів
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
                        <th>Місткість</th>
                        <th>Опис</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {archived.map(h => (
                        <tr key={h.id} className={styles.archivedRow}>
                          <td className={styles.name}>{h.name}</td>
                          <td className={styles.mono}>{h.capacity} осіб</td>
                          <td className={styles.description}>{h.description ?? '—'}</td>
                          <td>
                            <button
                              className={styles.restoreBtn}
                              onClick={() => handleToggle(h.id, true)}
                              disabled={toggling === h.id}
                            >
                              {toggling === h.id ? '...' : 'Відновити'}
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
        <HallModal
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
