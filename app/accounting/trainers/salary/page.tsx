'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  calcTrainerSalary,
  listTrainerPayments,
  insertTrainerPayment,
  type TrainerSalaryRow,
  type TrainerPayment,
} from '@/lib/queries/trainer-rates'
import { listActiveTrainers } from '@/lib/queries/trainers'
import type { Trainer } from '@/types'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import MonthNav from '@/components/MonthNav'
import { ticketTypeShortLabel } from '@/lib/badges'
import styles from './salary.module.css'

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    startDate: `${year}-${String(month + 1).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`,
  }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

function formatPeriod(start: string, end: string) {
  return `${formatDate(start)} – ${formatDate(end)}`
}

type PaymentModal = { open: false } | { open: true }

export default function TrainerSalaryPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>('')
  const [salaryRows, setSalaryRows] = useState<TrainerSalaryRow[]>([])
  const [payments, setPayments] = useState<TrainerPayment[]>([])
  const [loadingSalary, setLoadingSalary] = useState(false)
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [paymentModal, setPaymentModal] = useState<PaymentModal>({ open: false })
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const { start, end, startDate, endDate } = useMemo(() => getMonthRange(year, month), [year, month])

  useEffect(() => {
    listActiveTrainers(supabase).then(data => {
      setTrainers(data)
      if (data.length > 0) setSelectedTrainerId(data[0].id)
    })
  }, [])

  const fetchSalary = useCallback(async () => {
    if (!selectedTrainerId) return
    setLoadingSalary(true)
    const data = await calcTrainerSalary(supabase, selectedTrainerId, start, end)
    setSalaryRows(data)
    setLoadingSalary(false)
  }, [selectedTrainerId, start, end])

  const fetchPayments = useCallback(async () => {
    if (!selectedTrainerId) return
    setLoadingPayments(true)
    const data = await listTrainerPayments(supabase, selectedTrainerId, startDate, endDate)
    setPayments(data)
    setLoadingPayments(false)
  }, [selectedTrainerId, startDate, endDate])

  useEffect(() => {
    fetchSalary()
    fetchPayments()
  }, [fetchSalary, fetchPayments])

  const totalCalculated = useMemo(
    () => salaryRows.reduce((sum, r) => sum + r.amount, 0),
    [salaryRows]
  )
  const totalPaid = useMemo(
    () => payments.reduce((sum, p) => sum + Number(p.paid_amount), 0),
    [payments]
  )
  const hasNoRate = salaryRows.some(r => r.rate === null)

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  function openPaymentModal() {
    const today = new Date()
    setPaymentDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)
    setPaymentAmount(String(totalCalculated))
    setPaymentNotes('')
    setPaymentError(null)
    setPaymentModal({ open: true })
  }

  async function handleSavePayment() {
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) { setPaymentError('Введіть суму виплати'); return }
    if (!paymentDate) { setPaymentError('Оберіть дату'); return }
    setSaving(true)
    setPaymentError(null)
    const { error } = await insertTrainerPayment(supabase, {
      trainer_id: selectedTrainerId,
      period_start: startDate,
      period_end: endDate,
      calculated_amount: totalCalculated,
      paid_amount: amount,
      payment_date: paymentDate,
      notes: paymentNotes || null,
    })
    setSaving(false)
    if (error) { setPaymentError(error); return }
    setPaymentModal({ open: false })
    fetchPayments()
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Нарахування тренерів</h1>
          <div className={styles.topbarActions}>
            <a href="/accounting/trainers" className={styles.navLink}>← Тренери</a>
            <a href="/accounting/trainers/rates" className={styles.navLink}>Ставки →</a>
          </div>
        </div>

        <div className={styles.filterBar}>
          <MonthNav month={month} year={year} onPrev={prevMonth} onNext={nextMonth} />
          {trainers.length > 0 && (
            <select
              className={styles.trainerSelect}
              value={selectedTrainerId}
              onChange={e => setSelectedTrainerId(e.target.value)}
            >
              {trainers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className={styles.content}>
          {/* Salary section */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Розрахунок</h2>
            {loadingSalary ? (
              <div className={styles.empty}>Завантаження...</div>
            ) : salaryRows.length === 0 ? (
              <div className={styles.empty}>Проведених занять за цей місяць немає</div>
            ) : (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Тип заняття</th>
                        <th>Годин</th>
                        <th>Ставка</th>
                        <th>Сума</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salaryRows.map(r => (
                        <tr key={r.ticket_type}>
                          <td>
                            <span className={styles.typeChip}>
                              {ticketTypeShortLabel(r.ticket_type)}
                            </span>
                          </td>
                          <td className={styles.num}>{r.sessions_total}</td>
                          <td className={r.rate === null ? styles.noRate : styles.rateVal}>
                            {r.rate === null ? 'не задано' : `${Number(r.rate).toLocaleString('uk-UA')} ₴/год`}
                          </td>
                          <td className={styles.amount}>
                            {r.rate === null ? '—' : `${r.amount.toLocaleString('uk-UA')} ₴`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className={styles.totalRow}>
                        <td colSpan={3}>Нараховано</td>
                        <td className={styles.totalAmount}>{totalCalculated.toLocaleString('uk-UA')} ₴</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {hasNoRate && (
                  <p className={styles.noRateHint}>
                    Для деяких типів занять ставка не задана.{' '}
                    <a href="/accounting/trainers/rates" className={styles.ratesLink}>Налаштувати ставки</a>
                  </p>
                )}
              </>
            )}
          </section>

          {/* Payments section */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Виплати</h2>
              <button className={styles.addPaymentBtn} onClick={openPaymentModal}>
                + Зафіксувати виплату
              </button>
            </div>
            {loadingPayments ? (
              <div className={styles.empty}>Завантаження...</div>
            ) : payments.length === 0 ? (
              <div className={styles.empty}>Виплат за цей місяць немає</div>
            ) : (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Період</th>
                        <th>Нараховано</th>
                        <th>Виплачено</th>
                        <th>Примітка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id}>
                          <td className={styles.dateCell}>{formatDate(p.payment_date)}</td>
                          <td className={styles.periodCell}>{formatPeriod(p.period_start, p.period_end)}</td>
                          <td className={styles.num}>{Number(p.calculated_amount).toLocaleString('uk-UA')} ₴</td>
                          <td className={styles.paidAmount}>{Number(p.paid_amount).toLocaleString('uk-UA')} ₴</td>
                          <td className={styles.notes}>{p.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className={styles.totalRow}>
                        <td colSpan={3}>Виплачено всього</td>
                        <td className={styles.paidAmount}>{totalPaid.toLocaleString('uk-UA')} ₴</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {/* Payment modal */}
      {paymentModal.open && (
        <div className={styles.overlay} onClick={() => setPaymentModal({ open: false })}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Зафіксувати виплату</h2>
              <button className={styles.closeBtn} onClick={() => setPaymentModal({ open: false })}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalHint}>
                Нараховано за місяць: <strong>{totalCalculated.toLocaleString('uk-UA')} ₴</strong>
              </div>

              <label className={styles.label}>Виплачено ₴</label>
              <input
                className={styles.input}
                type="number"
                min="0"
                step="10"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                autoFocus
              />

              <label className={styles.label}>Дата виплати</label>
              <input
                className={styles.input}
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
              />

              <label className={styles.label}>Примітка</label>
              <input
                className={styles.input}
                type="text"
                value={paymentNotes}
                onChange={e => setPaymentNotes(e.target.value)}
                placeholder="наприклад: аванс"
              />

              {paymentError && <div className={styles.errorMsg}>{paymentError}</div>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setPaymentModal({ open: false })}>Скасувати</button>
              <button className={styles.saveBtn} onClick={handleSavePayment} disabled={saving}>
                {saving ? 'Збереження...' : 'Зберегти'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
