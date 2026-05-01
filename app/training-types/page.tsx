'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import TrainingTypeModal from '@/components/TrainingTypeModal'
import type { TrainingType } from '@/types'
import styles from './training-types.module.css'

const supabase = createClient()

export default function TrainingTypesPage() {
  const [types, setTypes] = useState<TrainingType[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<TrainingType | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const fetchTypes = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('training_types')
      .select('id, code, label, is_active, sort_order, created_at')
      .order('sort_order', { ascending: true })
    if (error) {
      setFetchError(error.message)
    } else {
      setTypes((data as TrainingType[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTypes() }, [fetchTypes])

  async function handleToggle(id: string, newValue: boolean) {
    setToggling(id)
    const { error } = await supabase
      .from('training_types')
      .update({ is_active: newValue })
      .eq('id', id)
    if (error) {
      setFetchError(error.message)
    } else {
      setTypes(prev => prev.map(t => t.id === id ? { ...t, is_active: newValue } : t))
    }
    setToggling(null)
  }

  function handleEdit(t: TrainingType) {
    setEditing(t)
    setShowModal(true)
  }

  function handleModalClose() {
    setShowModal(false)
    setEditing(null)
  }

  function handleSaved() {
    setShowModal(false)
    setEditing(null)
    fetchTypes()
  }

  const active = types.filter(t => t.is_active)
  const archived = types.filter(t => !t.is_active)

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Типи тренувань</h1>
          <button className={styles.btnNew} onClick={() => { setEditing(null); setShowModal(true) }}>
            + Додати тип
          </button>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Завантаження...</div>
          ) : fetchError ? (
            <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
          ) : active.length === 0 ? (
            <div className={styles.empty}>Активних типів немає</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Назва</th>
                    <th>Код</th>
                    <th>Статус</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {active.map(t => (
                    <tr key={t.id}>
                      <td className={styles.label}>{t.label}</td>
                      <td><span className={styles.typeBadge}>{t.code}</span></td>
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
                      <td>
                        <button className={styles.editBtn} onClick={() => handleEdit(t)}>
                          Редагувати
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
              Архів типів
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
                        <th>Код</th>
                        <th></th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {archived.map(t => (
                        <tr key={t.id} className={styles.archivedRow}>
                          <td className={styles.label}>{t.label}</td>
                          <td><span className={styles.typeBadge}>{t.code}</span></td>
                          <td>
                            <button
                              className={styles.restoreBtn}
                              onClick={() => handleToggle(t.id, true)}
                              disabled={toggling === t.id}
                            >
                              {toggling === t.id ? '...' : 'Відновити'}
                            </button>
                          </td>
                          <td>
                            <button className={styles.editBtn} onClick={() => handleEdit(t)}>
                              Редагувати
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
        <TrainingTypeModal
          onClose={handleModalClose}
          onSaved={handleSaved}
          existing={editing}
        />
      )}
    </div>
  )
}
