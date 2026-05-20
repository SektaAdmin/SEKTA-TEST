'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import TrainingTypeModal from '@/components/TrainingTypeModal'
import type { TrainingType } from '@/types'
import styles from '../settings.module.css'

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
    if (error) setFetchError(error.message)
    else setTypes((data as TrainingType[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTypes() }, [fetchTypes])

  async function handleToggle(id: string, newValue: boolean) {
    setToggling(id)
    const { error } = await supabase.from('training_types').update({ is_active: newValue }).eq('id', id)
    if (error) toast.error('Не вдалося змінити статус')
    else setTypes(prev => prev.map(t => t.id === id ? { ...t, is_active: newValue } : t))
    setToggling(null)
  }

  function handleEdit(t: TrainingType) { setEditing(t); setShowModal(true) }
  function handleClose() { setShowModal(false); setEditing(null) }
  function handleSaved() { handleClose(); toast.success('Збережено'); fetchTypes() }

  const active = types.filter(t => t.is_active)
  const archived = types.filter(t => !t.is_active)

  return (
    <>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Типи тренувань</h1>
        <button className={styles.btnNew} onClick={() => { setEditing(null); setShowModal(true) }}>+ Додати тип</button>
      </div>

      <div className={styles.tabSection}>
        {loading ? (
          <div className={styles.loading}><span /><span /><span /></div>
        ) : fetchError ? (
          <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
        ) : active.length === 0 ? (
          <div className={styles.empty}>Активних типів немає</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Назва</th><th>Код</th><th>Статус</th><th></th></tr></thead>
              <tbody>
                {active.map(t => (
                  <tr key={t.id}>
                    <td className={styles.name}>{t.label}</td>
                    <td><span className={styles.typeBadge}>{t.code}</span></td>
                    <td><ToggleBtns id={t.id} active={t.is_active} toggling={toggling} onToggle={handleToggle} /></td>
                    <td><button className={styles.editBtn} onClick={() => handleEdit(t)}>Редагувати</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ArchiveSection label="Архів типів" count={archived.length} open={archiveOpen} onToggle={() => setArchiveOpen(o => !o)}>
          {archived.length === 0 ? null : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Назва</th><th>Код</th><th></th><th></th></tr></thead>
                <tbody>
                  {archived.map(t => (
                    <tr key={t.id} className={styles.archivedRow}>
                      <td className={styles.name}>{t.label}</td>
                      <td><span className={styles.typeBadge}>{t.code}</span></td>
                      <td>
                        <button className={styles.restoreBtn} onClick={() => handleToggle(t.id, true)} disabled={toggling === t.id}>
                          {toggling === t.id ? '...' : 'Відновити'}
                        </button>
                      </td>
                      <td><button className={styles.editBtn} onClick={() => handleEdit(t)}>Редагувати</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ArchiveSection>
      </div>

      {showModal && <TrainingTypeModal onClose={handleClose} onSaved={handleSaved} existing={editing} />}
    </>
  )
}
