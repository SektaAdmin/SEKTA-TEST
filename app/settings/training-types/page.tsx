'use client'
import { useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import TrainingTypeModal from '@/components/TrainingTypeModal'
import { useRefEntity } from '@/hooks/useRefEntity'
import { listTrainingTypes, toggleTrainingType, reorderTrainingTypes } from '@/lib/queries/training-types'
import { supabase } from '@/lib/supabase'
import { MSG } from '@/lib/messages'
import styles from '../settings.module.css'
import dndStyles from './training-types.module.css'
import type { TrainingType } from '@/types'

const SETTINGS_TABS = [
  { href: '/settings/tickets', label: 'Абонементи' },
  { href: '/settings/trainers', label: 'Тренери' },
  { href: '/settings/halls', label: 'Зали' },
  { href: '/settings/training-types', label: 'Типи' },
]

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5]

function TrainingTypesSkeleton() {
  return (
    <div role="status" aria-label="Завантаження...">
      <div className={styles.tableDesktop}>
        <div className="data-table-wrap">
          <table className="data-table" aria-hidden="true">
            <thead>
              <tr>
                <th className={dndStyles.handleCol}></th>
                <th>Назва</th>
                <th>Коротка</th>
                <th>Код</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {SKELETON_ROWS.map(i => (
                <tr key={i}>
                  <td className={dndStyles.handle}>⠿</td>
                  <td><div className={`skeleton-bone ${styles.skelName}`} style={{ width: `${70 - (i % 3) * 8}%` }} /></td>
                  <td><div className="skeleton-bone" style={{ width: 60 }} /></td>
                  <td><div className="skeleton-bone" style={{ width: 50 }} /></td>
                  <td><div className={`skeleton-bone ${styles.skelToggle}`} /></td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.cardList}>
        {SKELETON_ROWS.slice(0, 4).map(i => (
          <div key={i} className={styles.settingCard}>
            <div className={styles.cardRow}>
              <div className="skeleton-bone" style={{ width: `${45 - (i % 3) * 6}%` }} />
              <div className={`skeleton-bone ${styles.skelToggle}`} />
            </div>
            <div className={styles.cardMeta}>
              <div className={`skeleton-bone ${styles.skelCardMeta}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TrainingTypesPage() {
  const pathname = usePathname()
  const { data, loading, fetchError, toggling, toggle, refetch } = useRefEntity<TrainingType>(
    'training_types', listTrainingTypes, toggleTrainingType
  )
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<TrainingType | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Drag state
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const active = data.filter(r => r.is_active)
  const archived = data.filter(r => !r.is_active)

  const openAdd = () => { setEditing(null); setShowModal(true) }
  const openEdit = (row: TrainingType) => { setEditing(row); setShowModal(true) }
  const onClose = () => { setShowModal(false); setEditing(null) }
  const onSaved = () => { onClose(); toast.success(MSG.toast.saved); refetch() }

  function onDragStart(idx: number) {
    dragIdx.current = idx
  }

  function onDragEnter(idx: number) {
    setDragOver(idx)
  }

  async function onDrop(dropIdx: number) {
    const fromIdx = dragIdx.current
    dragIdx.current = null
    setDragOver(null)
    if (fromIdx === null || fromIdx === dropIdx) return

    const reordered = [...active]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(dropIdx, 0, moved)

    const ids = reordered.map(r => r.id)
    const orders = reordered.map((_, i) => (i + 1) * 10)

    setSaving(true)
    const { error } = await reorderTrainingTypes(supabase, ids, orders)
    setSaving(false)
    if (error) { toast.error('Не вдалось зберегти порядок'); return }
    refetch()
  }

  function onDragEnd() {
    dragIdx.current = null
    setDragOver(null)
  }

  return (
    <>
      <div className="page-head">
        <div className={styles.topbar}>
          <h1 className="page-title">Типи тренувань</h1>
          <button className="btn-primary" onClick={openAdd}>+ Додати тип</button>
        </div>
        <nav className={styles.tabNav}>
          {SETTINGS_TABS.map(tab => (
            <a key={tab.href} href={tab.href} className={`${styles.tabNavLink} ${pathname === tab.href ? styles.tabNavLinkActive : ''}`}>
              {tab.label}
            </a>
          ))}
        </nav>
      </div>

      <div className={`page-body ${styles.tabSection}`}>
        {loading ? (
          <TrainingTypesSkeleton />
        ) : fetchError ? (
          <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
        ) : active.length === 0 ? (
          <div className={styles.empty}>
            <span>{MSG.empty.trainingTypes}</span>
            <button className="btn-primary" onClick={openAdd}>+ Додати тип</button>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className={styles.tableDesktop}>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className={dndStyles.handleCol}></th>
                      <th>Назва</th>
                      <th>Коротка</th>
                      <th>Код</th>
                      <th>Статус</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((row, idx) => (
                      <tr
                        key={row.id}
                        draggable
                        onDragStart={() => onDragStart(idx)}
                        onDragEnter={() => onDragEnter(idx)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => onDrop(idx)}
                        onDragEnd={onDragEnd}
                        className={dragOver === idx ? dndStyles.dragOver : undefined}
                      >
                        <td className={dndStyles.handle} title="Перетягнути">⠿</td>
                        <td className={styles.name}>{row.label}</td>
                        <td>{row.short_label ?? <span className={styles.dash}>—</span>}</td>
                        <td><span className="badge badge-type">{row.code}</span></td>
                        <td>
                          <div className={styles.toggleBtns}>
                            <button
                              className={`${styles.toggleBtn} ${styles.toggleTrue} ${row.is_active ? styles.toggleActiveTrue : ''}`}
                              onClick={() => !row.is_active && toggle(row.id, true)}
                              disabled={toggling === row.id || !!row.is_active}
                            >TRUE</button>
                            <button
                              className={`${styles.toggleBtn} ${styles.toggleFalse} ${!row.is_active ? styles.toggleActiveFalse : ''}`}
                              onClick={() => row.is_active && toggle(row.id, false)}
                              disabled={toggling === row.id || !row.is_active}
                            >FALSE</button>
                          </div>
                        </td>
                        <td>
                          <button className={styles.editBtn} onClick={() => openEdit(row)}>Редагувати</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {saving && <div className={dndStyles.saving}>Збереження...</div>}
            </div>

            {/* Mobile */}
            <div className={styles.cardList}>
              {active.map((row, idx) => (
                <div
                  key={row.id}
                  className={`${styles.settingCard} ${dragOver === idx ? dndStyles.dragOver : ''}`}
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragEnter={() => onDragEnter(idx)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(idx)}
                  onDragEnd={onDragEnd}
                >
                  <div className={styles.cardRow}>
                    <span className={dndStyles.handleMobile}>⠿</span>
                    <span className={styles.name}>{row.label}</span>
                    <div className={styles.cardActions}>
                      <button className={styles.editBtn} onClick={() => openEdit(row)}>Редагувати</button>
                      <div className={styles.toggleBtns}>
                        <button
                          className={`${styles.toggleBtn} ${styles.toggleTrue} ${row.is_active ? styles.toggleActiveTrue : ''}`}
                          onClick={() => !row.is_active && toggle(row.id, true)}
                          disabled={toggling === row.id || !!row.is_active}
                        >TRUE</button>
                        <button
                          className={`${styles.toggleBtn} ${styles.toggleFalse} ${!row.is_active ? styles.toggleActiveFalse : ''}`}
                          onClick={() => row.is_active && toggle(row.id, false)}
                          disabled={toggling === row.id || !row.is_active}
                        >FALSE</button>
                      </div>
                    </div>
                  </div>
                  <div className={styles.cardMeta}>
                    <span className="badge badge-type">{row.code}</span>
                  </div>
                </div>
              ))}
              {saving && <div className={dndStyles.saving}>Збереження...</div>}
            </div>
          </>
        )}

        {/* Архів */}
        <div className={styles.archiveSection}>
          <button className={styles.archiveToggle} onClick={() => setArchiveOpen(o => !o)} aria-expanded={archiveOpen}>
            <span className={`${styles.archiveChevron} ${archiveOpen ? styles.archiveChevronOpen : ''}`}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2.5 4.5l3.5 3.5 3.5-3.5"/>
              </svg>
            </span>
            Архів типів
            <span className="count-chip">{archived.length}</span>
          </button>
          {archiveOpen && archived.length > 0 && (
            <>
              <div className={styles.tableDesktop}>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Назва</th><th>Код</th><th></th></tr></thead>
                    <tbody>
                      {archived.map(row => (
                        <tr key={row.id} className={styles.archivedRow}>
                          <td className={styles.name}>{row.label}</td>
                          <td><span className="badge badge-type">{row.code}</span></td>
                          <td>
                            <button className={styles.restoreBtn} onClick={() => toggle(row.id, true)} disabled={toggling === row.id}>
                              {toggling === row.id ? '...' : 'Відновити'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className={styles.cardList}>
                {archived.map(row => (
                  <div key={row.id} className={styles.settingCard} style={{ opacity: 0.65 }}>
                    <div className={styles.cardRow}>
                      <span className={styles.name}>{row.label}</span>
                      <button className={styles.restoreBtn} onClick={() => toggle(row.id, true)} disabled={toggling === row.id}>
                        {toggling === row.id ? '...' : 'Відновити'}
                      </button>
                    </div>
                    <div className={styles.cardMeta}>
                      <span className="badge badge-type">{row.code}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {showModal && (
        <TrainingTypeModal onClose={onClose} onSaved={onSaved} existing={editing} />
      )}
    </>
  )
}
