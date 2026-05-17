'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { listTrainerRates, upsertTrainerRate, deleteTrainerRate } from '@/lib/queries/trainer-rates'
import { listActiveTrainers } from '@/lib/queries/trainers'
import type { TrainerRate } from '@/lib/queries/trainer-rates'
import type { Trainer } from '@/types'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import styles from './rates.module.css'

const TICKET_TYPE_LABELS: Record<string, string> = {
  group: 'Груп',
  individual: 'Індив',
  individualduo: 'Дует',
  individualtrio: 'Тріо',
  hallrental: 'Оренда залу',
  smallhallrental: 'Мал. зал',
  pylonrental: 'Пілон',
  striprental: 'Стріп',
}

type ModalState =
  | { open: false }
  | { open: true; mode: 'add' }
  | { open: true; mode: 'edit'; rate: TrainerRate }

type DeleteConfirm = { open: false } | { open: true; rate: TrainerRate }

export default function TrainerRatesPage() {
  const [rates, setRates] = useState<TrainerRate[]>([])
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>({ open: false })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formTrainerId, setFormTrainerId] = useState<string>('')
  const [formTicketType, setFormTicketType] = useState('')
  const [formRate, setFormRate] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [ratesData, trainersData] = await Promise.all([
      listTrainerRates(supabase),
      listActiveTrainers(supabase),
    ])
    setRates(ratesData)
    setTrainers(trainersData)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function openAdd() {
    setFormTrainerId('')
    setFormTicketType('')
    setFormRate('')
    setError(null)
    setModal({ open: true, mode: 'add' })
  }

  function openEdit(rate: TrainerRate) {
    setFormTrainerId(rate.trainer_id ?? '')
    setFormTicketType(rate.ticket_type)
    setFormRate(String(rate.rate))
    setError(null)
    setModal({ open: true, mode: 'edit', rate })
  }

  async function handleSave() {
    const rateNum = parseFloat(formRate)
    if (isNaN(rateNum) || rateNum < 0) { setError('Введіть коректну ставку'); return }
    if (!formTicketType) { setError('Оберіть тип заняття'); return }
    setSaving(true)
    setError(null)
    const payload = {
      ...(modal.open && modal.mode === 'edit' ? { id: modal.rate.id } : {}),
      trainer_id: formTrainerId === '' ? null : formTrainerId,
      ticket_type: formTicketType,
      rate: rateNum,
    }
    const { error: err } = await upsertTrainerRate(supabase, payload)
    setSaving(false)
    if (err) { setError(err); return }
    setModal({ open: false })
    fetchData()
  }

  async function handleDelete() {
    if (!deleteConfirm.open) return
    setDeleting(true)
    await deleteTrainerRate(supabase, deleteConfirm.rate.id)
    setDeleting(false)
    setDeleteConfirm({ open: false })
    fetchData()
  }

  function rateLabel(rate: TrainerRate) {
    if (!rate.trainer_id) return '(глобальна)'
    return rate.trainer_name ?? '—'
  }

  function ticketLabel(type: string) {
    return TICKET_TYPE_LABELS[type] ?? type
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Ставки тренерів</h1>
          <div className={styles.topbarActions}>
            <a href="/accounting/trainers/salary" className={styles.backLink}>← Нарахування</a>
            <button className={styles.addBtn} onClick={openAdd}>+ Додати ставку</button>
          </div>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Завантаження...</div>
          ) : rates.length === 0 ? (
            <div className={styles.empty}>Ставки не задано. Додайте першу ставку.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Тип заняття</th>
                    <th>Тренер</th>
                    <th>Ставка ₴/год</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map(r => (
                    <tr key={r.id} className={styles.row} onClick={() => openEdit(r)}>
                      <td><span className={styles.typeChip}>{ticketLabel(r.ticket_type)}</span></td>
                      <td className={r.trainer_id ? '' : styles.global}>{rateLabel(r)}</td>
                      <td className={styles.rateCell}>{Number(r.rate).toLocaleString('uk-UA')} ₴</td>
                      <td className={styles.deleteCell}>
                        <button
                          className={styles.deleteBtn}
                          onClick={e => { e.stopPropagation(); setDeleteConfirm({ open: true, rate: r }) }}
                          aria-label="Видалити"
                        >×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Add/Edit modal */}
      {modal.open && (
        <div className={styles.overlay} onClick={() => setModal({ open: false })}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {modal.mode === 'add' ? 'Додати ставку' : 'Редагувати ставку'}
              </h2>
              <button className={styles.closeBtn} onClick={() => setModal({ open: false })}>×</button>
            </div>

            <div className={styles.modalBody}>
              <label className={styles.label}>Тип заняття</label>
              <select
                className={styles.select}
                value={formTicketType}
                onChange={e => setFormTicketType(e.target.value)}
                disabled={modal.mode === 'edit'}
              >
                <option value="">— Оберіть —</option>
                {Object.entries(TICKET_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>

              <label className={styles.label}>Тренер</label>
              <select
                className={styles.select}
                value={formTrainerId}
                onChange={e => setFormTrainerId(e.target.value)}
                disabled={modal.mode === 'edit'}
              >
                <option value="">Глобальна (для всіх)</option>
                {trainers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              <label className={styles.label}>Ставка ₴/год</label>
              <input
                className={styles.input}
                type="number"
                min="0"
                step="10"
                value={formRate}
                onChange={e => setFormRate(e.target.value)}
                placeholder="наприклад 200"
                autoFocus
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

      {/* Delete confirmation */}
      {deleteConfirm.open && (
        <div className={styles.overlay} onClick={() => setDeleteConfirm({ open: false })}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Видалити ставку?</h2>
              <button className={styles.closeBtn} onClick={() => setDeleteConfirm({ open: false })}>×</button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.confirmText}>
                Видалити ставку <strong>{ticketLabel(deleteConfirm.rate.ticket_type)}</strong> для{' '}
                <strong>{rateLabel(deleteConfirm.rate)}</strong>?
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setDeleteConfirm({ open: false })}>Скасувати</button>
              <button className={styles.dangerBtn} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Видалення...' : 'Видалити'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
