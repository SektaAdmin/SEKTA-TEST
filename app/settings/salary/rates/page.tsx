'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  listTrainerRatesAll,
  addTrainerRate,
  archiveTrainerRate,
  restoreTrainerRate,
  type TrainerRate,
} from '@/lib/queries/trainer-rates'
import { listActiveTrainers } from '@/lib/queries/trainers'
import { listActiveHalls } from '@/lib/queries/halls'
import { useRefs } from '@/contexts/RefsContext'
import type { Trainer, Hall } from '@/types'
import { formatMoney, formatDate } from '@/lib/formatters'
import { toYMD } from '@/lib/dateUtils'
import ss from '@/app/settings/settings.module.css'
import styles from './rates.module.css'

const SALARY_TABS = [
  { href: '/settings/salary/rates', label: 'Ставки' },
  { href: '/settings/salary/calculations', label: 'Нарахування' },
]

type ModalState =
  | { open: false }
  | { open: true; editRate: TrainerRate | null }

type ConfirmState =
  | { open: false }
  | { open: true; rate: TrainerRate }

export default function SalaryRatesPage() {
  const pathname = usePathname()
  const { trainingTypes } = useRefs()
  const [activeRates, setActiveRates] = useState<TrainerRate[]>([])
  const [archivedRates, setArchivedRates] = useState<TrainerRate[]>([])
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [halls, setHalls] = useState<Hall[]>([])
  const [loading, setLoading] = useState(true)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [confirm, setConfirm] = useState<ConfirmState>({ open: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formTrainerId, setFormTrainerId] = useState<string>('')
  const [formTicketType, setFormTicketType] = useState('')
  const [formHallId, setFormHallId] = useState<string>('')
  const [formTrainerRate, setFormTrainerRate] = useState('')
  const [formStudioRate, setFormStudioRate] = useState('')
  const [formValidFrom, setFormValidFrom] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [all, tr, hl] = await Promise.all([
      listTrainerRatesAll(supabase),
      listActiveTrainers(supabase),
      listActiveHalls(supabase),
    ])
    setActiveRates(all.filter(r => r.valid_to === null))
    setArchivedRates(all.filter(r => r.valid_to !== null))
    setTrainers(tr)
    setHalls(hl)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function openAdd() {
    setFormTrainerId('')
    setFormTicketType('')
    setFormHallId('')
    setFormTrainerRate('')
    setFormStudioRate('')
    setFormValidFrom(toYMD(new Date()))
    setError(null)
    setModal({ open: true, editRate: null })
  }

  function openEdit(rate: TrainerRate) {
    setFormTrainerId(rate.trainer_id ?? '')
    setFormTicketType(rate.ticket_type)
    setFormHallId(rate.hall_id ?? '')
    setFormTrainerRate(String(rate.trainer_rate))
    setFormStudioRate(String(rate.studio_rate))
    setFormValidFrom(toYMD(new Date()))
    setError(null)
    setModal({ open: true, editRate: rate })
  }

  async function handleSave() {
    const tr = parseFloat(formTrainerRate)
    const sr = parseFloat(formStudioRate)
    if (!formTicketType) { setError('Оберіть тип заняття'); return }
    if (isNaN(tr) || tr < 0) { setError('Введіть коректну ставку тренера'); return }
    if (isNaN(sr) || sr < 0) { setError('Введіть коректну ставку студії'); return }
    if (!formValidFrom) { setError('Вкажіть дату початку дії'); return }
    setSaving(true)
    setError(null)
    // addTrainerRate auto-archives existing active rate for same key
    const { error: err } = await addTrainerRate(supabase, {
      trainer_id: formTrainerId || null,
      ticket_type: formTicketType,
      hall_id: formHallId || null,
      trainer_rate: tr,
      studio_rate: sr,
      valid_from: formValidFrom,
    })
    setSaving(false)
    if (err) { setError(err); return }
    setModal({ open: false })
    fetchData()
  }

  function askArchive(rate: TrainerRate) {
    setConfirm({ open: true, rate })
  }

  async function handleArchiveConfirmed() {
    if (!confirm.open) return
    const today = toYMD(new Date())
    await archiveTrainerRate(supabase, confirm.rate.id, today)
    setConfirm({ open: false })
    fetchData()
  }

  async function handleRestore(id: string) {
    await restoreTrainerRate(supabase, id)
    fetchData()
  }

  function trainerLabel(r: TrainerRate) {
    return r.trainer_id ? (r.trainer_name ?? '—') : 'Глобальна'
  }

  function hallLabel(r: TrainerRate) {
    return r.hall_id ? (r.hall_name ?? '—') : 'Будь-який'
  }

  const isEditing = modal.open && modal.editRate !== null

  return (
    <>
      <div className="page-head">
        <div className={ss.topbar}>
          <h1 className="page-title">Ставки тренерів</h1>
          <button className="btn-primary" onClick={openAdd}>+ Додати ставку</button>
        </div>
        <nav className={ss.tabNav} aria-label="Зарплати">
          {SALARY_TABS.map(t => (
            <a
              key={t.href}
              href={t.href}
              className={`${ss.tabNavLink} ${pathname === t.href ? ss.tabNavLinkActive : ''}`}
            >{t.label}</a>
          ))}
        </nav>
      </div>

      <div className="page-body">
        {loading ? (
          <div className={styles.empty}>Завантаження...</div>
        ) : (
          <div className={styles.content}>
            {/* Active rates table */}
            {activeRates.length === 0 ? (
              <div className={styles.empty}>Ставок немає. Додайте першу ставку.</div>
            ) : (
              <>
                {/* Desktop */}
                <div className={`data-table-wrap ${styles.tableDesktop}`}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Тип заняття</th>
                        <th>Зал</th>
                        <th>Тренер</th>
                        <th className={styles.numCol}>Ставка тренера</th>
                        <th className={styles.numCol}>Ставка студії</th>
                        <th>Діє з</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeRates.map(r => (
                        <tr key={r.id}>
                          <td><span className={styles.typeChip}>{r.ticket_type}</span></td>
                          <td className={styles.grayCell}>{hallLabel(r)}</td>
                          <td className={r.trainer_id ? '' : styles.globalCell}>{trainerLabel(r)}</td>
                          <td className={styles.rateCell}>{formatMoney(r.trainer_rate)}/год</td>
                          <td className={styles.rateCell}>{formatMoney(r.studio_rate)}/год</td>
                          <td className={styles.dateCell}>{formatDate(r.valid_from)}</td>
                          <td className={styles.actionCell}>
                            <button className={ss.editBtn} onClick={() => openEdit(r)}>Редагувати</button>
                            {' '}
                            <button
                              className={styles.archiveBtn}
                              onClick={() => askArchive(r)}
                              title="Архівувати ставку"
                            >Архівувати</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className={styles.cardList}>
                  {activeRates.map(r => (
                    <div key={r.id} className={styles.card}>
                      <div className={styles.cardRow}>
                        <span className={styles.typeChip}>{r.ticket_type}</span>
                        <div className={styles.cardActions}>
                          <button className={ss.editBtn} onClick={() => openEdit(r)}>Ред.</button>
                          <button className={styles.archiveBtn} onClick={() => askArchive(r)}>Архів</button>
                        </div>
                      </div>
                      <div className={styles.cardMeta}>
                        <span className={r.trainer_id ? '' : styles.globalCell}>{trainerLabel(r)}</span>
                        <span className={styles.dot}>·</span>
                        <span>{hallLabel(r)}</span>
                      </div>
                      <div className={styles.cardRates}>
                        <span>Тренер: <strong>{formatMoney(r.trainer_rate)}</strong>/год</span>
                        <span>Студія: <strong>{formatMoney(r.studio_rate)}</strong>/год</span>
                      </div>
                      <div className={styles.cardMeta}>
                        <span>З {formatDate(r.valid_from)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Archive */}
            <div className={ss.archiveSection}>
              <button className={ss.archiveToggle} onClick={() => setArchiveOpen(o => !o)} aria-expanded={archiveOpen}>
                <span className={`${ss.archiveChevron} ${archiveOpen ? ss.archiveChevronOpen : ''}`}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2.5 4.5l3.5 3.5 3.5-3.5"/>
                  </svg>
                </span>
                Архів ставок
                <span className={ss.archiveCount}>{archivedRates.length}</span>
              </button>

              {archiveOpen && (
                archivedRates.length === 0
                  ? <div className={ss.archiveEmpty}>Архів порожній</div>
                  : <>
                    <div className={`data-table-wrap ${styles.tableDesktop}`}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Тип</th>
                            <th>Зал</th>
                            <th>Тренер</th>
                            <th className={styles.numCol}>Ставка тренера</th>
                            <th className={styles.numCol}>Ставка студії</th>
                            <th>Діяла</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {archivedRates.map(r => (
                            <tr key={r.id} className={ss.archivedRow}>
                              <td><span className={styles.typeChip}>{r.ticket_type}</span></td>
                              <td className={styles.grayCell}>{hallLabel(r)}</td>
                              <td className={r.trainer_id ? '' : styles.globalCell}>{trainerLabel(r)}</td>
                              <td className={styles.rateCell}>{formatMoney(r.trainer_rate)}/год</td>
                              <td className={styles.rateCell}>{formatMoney(r.studio_rate)}/год</td>
                              <td className={styles.dateCell}>
                                {formatDate(r.valid_from)} – {r.valid_to ? formatDate(r.valid_to) : '…'}
                              </td>
                              <td className={styles.actionCell}>
                                <button className={ss.restoreBtn} onClick={() => handleRestore(r.id)}>Відновити</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.cardList}>
                      {archivedRates.map(r => (
                        <div key={r.id} className={`${styles.card} ${styles.archivedCard}`}>
                          <div className={styles.cardRow}>
                            <span className={styles.typeChip}>{r.ticket_type}</span>
                            <button className={ss.restoreBtn} onClick={() => handleRestore(r.id)}>Відновити</button>
                          </div>
                          <div className={styles.cardMeta}>
                            <span>{trainerLabel(r)}</span>
                            <span className={styles.dot}>·</span>
                            <span>{hallLabel(r)}</span>
                          </div>
                          <div className={styles.cardRates}>
                            <span>Тренер: <strong>{formatMoney(r.trainer_rate)}</strong>/год</span>
                            <span>Студія: <strong>{formatMoney(r.studio_rate)}</strong>/год</span>
                          </div>
                          <div className={styles.cardMeta}>
                            <span>{formatDate(r.valid_from)} – {r.valid_to ? formatDate(r.valid_to) : '…'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Archive confirm dialog */}
      {confirm.open && (
        <div className={styles.overlay} onClick={() => setConfirm({ open: false })}>
          <div className={styles.confirmDialog} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Архівувати ставку?</h2>
              <button className={styles.closeBtn} onClick={() => setConfirm({ open: false })}>×</button>
            </div>
            <div className={styles.confirmBody}>
              <p className={styles.confirmText}>
                Ставка буде закрита сьогоднішньою датою. Нові розрахунки ЗП після сьогодні не використовуватимуть цю ставку.
              </p>
              <div className={styles.confirmMeta}>
                <span className={styles.typeChip}>{confirm.rate.ticket_type}</span>
                <span className={styles.grayCell}>{trainerLabel(confirm.rate)}</span>
                {confirm.rate.hall_id && <span className={styles.grayCell}>· {hallLabel(confirm.rate)}</span>}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setConfirm({ open: false })}>Скасувати</button>
              <button className={styles.dangerBtn} onClick={handleArchiveConfirmed}>Архівувати</button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {modal.open && (
        <div className={styles.overlay} onClick={() => setModal({ open: false })}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{isEditing ? 'Редагувати ставку' : 'Додати ставку'}</h2>
              <button className={styles.closeBtn} onClick={() => setModal({ open: false })}>×</button>
            </div>
            <div className={styles.modalBody}>
              {isEditing && (
                <p className={styles.confirmText}>
                  Поточна ставка буде архівована, нова набуде чинності з обраної дати.
                </p>
              )}

              <label className={styles.label}>Тип заняття</label>
              <select
                className={styles.select}
                value={formTicketType}
                onChange={e => setFormTicketType(e.target.value)}
                disabled={isEditing}
              >
                <option value="">— Оберіть —</option>
                {trainingTypes.map(t => (
                  <option key={t.code} value={t.code}>{t.label} ({t.code})</option>
                ))}
              </select>

              <label className={styles.label}>Тренер</label>
              <select
                className={styles.select}
                value={formTrainerId}
                onChange={e => setFormTrainerId(e.target.value)}
                disabled={isEditing}
              >
                <option value="">Глобальна (для всіх)</option>
                {trainers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              <label className={styles.label}>Зал (необов'язково)</label>
              <select
                className={styles.select}
                value={formHallId}
                onChange={e => setFormHallId(e.target.value)}
                disabled={isEditing}
              >
                <option value="">Будь-який зал</option>
                {halls.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>

              <div className={styles.rateRow}>
                <div className={styles.rateField}>
                  <label className={styles.label}>Ставка тренера ₴/год</label>
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    step="10"
                    value={formTrainerRate}
                    onChange={e => setFormTrainerRate(e.target.value)}
                    placeholder="напр. 90"
                  />
                </div>
                <div className={styles.rateField}>
                  <label className={styles.label}>Ставка студії ₴/год</label>
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    step="10"
                    value={formStudioRate}
                    onChange={e => setFormStudioRate(e.target.value)}
                    placeholder="напр. 90"
                  />
                </div>
              </div>

              <label className={styles.label}>Діє з дати</label>
              <input
                className={styles.input}
                type="date"
                value={formValidFrom}
                onChange={e => setFormValidFrom(e.target.value)}
              />

              {error && <div className={styles.errorMsg}>{error}</div>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setModal({ open: false })}>Скасувати</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Збереження...' : 'Зберегти'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
