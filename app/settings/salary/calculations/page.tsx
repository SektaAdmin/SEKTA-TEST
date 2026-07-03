'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  calcTrainerSalaryDetail,
  getTrainerCashBalance,
  getTrainerCashBalanceTotal,
  listTrainerPayments,
  insertTrainerPayment,
  updateTrainerPayment,
  deleteTrainerPayment,
  type TrainerSalaryDetailRow,
  type TrainerPayment,
  type TrainerCashBalance,
} from '@/lib/queries/trainer-rates'
import { listActiveTrainers } from '@/lib/queries/trainers'
import type { Trainer } from '@/types'
import DatePicker from '@/components/DatePicker'
import { formatMoney, formatDate, formatDateShort, formatTime } from '@/lib/formatters'
import { toYMD, isoToYMD, DOW_LABELS_SHORT } from '@/lib/dateUtils'
import { ticketTypeShortLabel, enrollmentStatusClass, enrollmentStatusLabel, paymentLabel, paymentClass } from '@/lib/badges'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
import { Pencil, Trash2, Download } from 'lucide-react'
import { exportSalaryPdf } from '@/lib/exportSalaryPdf'
import { toast } from 'sonner'
import { MSG } from '@/lib/messages'
import ss from '@/app/settings/settings.module.css'
import FilterSelect from '@/components/ui/FilterSelect'
import styles from './calculations.module.css'

const SALARY_TABS = [
  { href: '/settings/salary/rates', label: 'Ставки' },
  { href: '/settings/salary/calculations', label: 'Нарахування' },
]

function getMonthRange() {
  const d = new Date()
  const start = toYMD(new Date(d.getFullYear(), d.getMonth(), 1))
  const end = toYMD(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  return { start, end }
}

type DayGroup = {
  dateKey: string         // YYYY-MM-DD
  dateLabel: string       // "пт 22.05.2026"
  classes: TrainerSalaryDetailRow[]
  totalByType: Record<string, number>  // ticket_type → total clients
  totalTrainer: number
}

function buildDayGroups(rows: TrainerSalaryDetailRow[]): DayGroup[] {
  const map = new Map<string, DayGroup>()
  for (const r of rows) {
    const dateKey = isoToYMD(r.starts_at)
    if (!map.has(dateKey)) {
      const d = new Date(r.starts_at)
      const dow = DOW_LABELS_SHORT[d.getDay()]
      map.set(dateKey, {
        dateKey,
        dateLabel: `${dow} ${formatDate(r.starts_at)}`,
        classes: [],
        totalByType: {},
        totalTrainer: 0,
      })
    }
    const group = map.get(dateKey)!
    group.classes.push(r)
    group.totalByType[r.ticket_type] = (group.totalByType[r.ticket_type] ?? 0) + r.total_clients
    group.totalTrainer += r.total_trainer
  }
  return Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey))
}

export default function SalaryCalculationsPage() {
  const pathname = usePathname()
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [selectedTrainerId, setSelectedTrainerId] = useState('')
  const [dateFrom, setDateFrom] = useState(() => getMonthRange().start)
  const [dateTo, setDateTo] = useState(() => getMonthRange().end)
  const [rows, setRows] = useState<TrainerSalaryDetailRow[]>([])
  const [cashBalance, setCashBalance] = useState<TrainerCashBalance | null>(null)
  const [cashBalanceTotal, setCashBalanceTotal] = useState<number>(0)
  const [payments, setPayments] = useState<TrainerPayment[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())
  const [cashExpanded, setCashExpanded] = useState(false)
  const [paymentModal, setPaymentModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState<TrainerPayment | null>(null)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)
  const [paymentType, setPaymentType] = useState<'advance' | 'final'>('final')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'fop' | 'personal_card'>('cash')
  const [paymentCashHolder, setPaymentCashHolder] = useState<string>('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  useEffect(() => {
    listActiveTrainers(supabase).then(r => {
      setTrainers(r.data)
      if (r.data.length > 0) setSelectedTrainerId(r.data[0].id)
    })
  }, [])

  const fetchAll = useCallback(async () => {
    if (!selectedTrainerId) return
    setLoading(true)
    const startISO = `${dateFrom}T00:00:00`
    const endISO = `${dateTo}T23:59:59`
    const [detail, cash, pays, cashTotal] = await Promise.all([
      calcTrainerSalaryDetail(supabase, selectedTrainerId, startISO, endISO),
      getTrainerCashBalance(supabase, selectedTrainerId, dateFrom, dateTo),
      listTrainerPayments(supabase, selectedTrainerId, dateFrom, dateTo),
      getTrainerCashBalanceTotal(supabase, selectedTrainerId),
    ])
    setRows(detail.data)
    setCashBalance(cash.data)
    setPayments(pays.data)
    setCashBalanceTotal(cashTotal.data)
    setExpandedDays(new Set())
    setExpandedClasses(new Set())
    setLoading(false)
  }, [selectedTrainerId, dateFrom, dateTo])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Grouped by day, sorted desc
  const dayGroups = useMemo(() => buildDayGroups(rows), [rows])

  // Dynamic ticket type columns — only types present in period data
  const ticketTypes = useMemo(() => {
    const seen = new Set<string>()
    for (const r of rows) seen.add(r.ticket_type)
    return Array.from(seen).sort()
  }, [rows])

  // Total per type for the footer
  const totalByType = useMemo(() => {
    const result: Record<string, number> = {}
    for (const r of rows) result[r.ticket_type] = (result[r.ticket_type] ?? 0) + r.total_clients
    return result
  }, [rows])

  const totalTrainer = useMemo(() => rows.reduce((s, r) => s + r.total_trainer, 0), [rows])
  const totalPaidPeriod = useMemo(() => payments.reduce((s, p) => s + Number(p.paid_amount), 0), [payments])
  const cashOnHand = cashBalance?.total ?? 0
  const toPay = totalTrainer - cashOnHand - totalPaidPeriod

  function toggleDay(dateKey: string) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      next.has(dateKey) ? next.delete(dateKey) : next.add(dateKey)
      return next
    })
  }

  function toggleClass(classId: string) {
    setExpandedClasses(prev => {
      const next = new Set(prev)
      next.has(classId) ? next.delete(classId) : next.add(classId)
      return next
    })
  }

  function openPaymentModal() {
    setEditingPayment(null)
    setPaymentDate(toYMD(new Date()))
    setPaymentAmount(String(Math.max(0, Math.round(toPay))))
    setPaymentNotes('')
    setPaymentError(null)
    setPaymentType('final')
    setPaymentMethod('cash')
    setPaymentCashHolder(selectedTrainerId)
    setPaymentModal(true)
  }

  function openEditModal(p: TrainerPayment) {
    setEditingPayment(p)
    setPaymentDate(p.payment_date)
    setPaymentAmount(String(p.paid_amount))
    setPaymentNotes(p.notes ?? '')
    setPaymentType(p.payment_type)
    setPaymentMethod((p.payment_method ?? 'cash') as 'cash' | 'fop' | 'personal_card')
    setPaymentCashHolder((p as any).cash_holder ?? '')
    setPaymentError(null)
    setPaymentModal(true)
  }

  async function handleSavePayment() {
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) { setPaymentError('Введіть суму виплати'); return }
    if (!paymentDate) { setPaymentError('Оберіть дату'); return }
    setSaving(true)
    setPaymentError(null)
    if (editingPayment) {
      const { error } = await updateTrainerPayment(supabase, editingPayment.id, {
        paid_amount: amount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        cash_holder: paymentMethod === 'cash' ? (paymentCashHolder || null) : null,
        payment_type: paymentType,
        notes: paymentNotes || null,
      })
      setSaving(false)
      if (error) { setPaymentError(error); return }
    } else {
      const { error } = await insertTrainerPayment(supabase, {
        trainer_id: selectedTrainerId,
        period_start: dateFrom,
        period_end: dateTo,
        calculated_amount: totalTrainer,
        paid_amount: amount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        cash_holder: paymentMethod === 'cash' ? (paymentCashHolder || null) : null,
        payment_type: paymentType,
        notes: paymentNotes || null,
      })
      setSaving(false)
      if (error) { setPaymentError(error); return }
    }
    setPaymentModal(false)
    fetchAll()
  }

  async function handleDeletePayment(id: string) {
    const { error } = await deleteTrainerPayment(supabase, id)
    if (error) { toast.error(MSG.toast.deleteFailed); return }
    setDeletingPaymentId(null)
    fetchAll()
  }

  async function handleExportPdf() {
    if (!selectedTrainerId || rows.length === 0) return
    const trainer = trainers.find(t => t.id === selectedTrainerId)
    setExporting(true)
    try {
      await exportSalaryPdf({
        trainerName: trainer?.name ?? selectedTrainerId,
        dateFrom,
        dateTo,
        rows,
        payments,
        cashBalance,
        totalTrainer,
        totalPaidPeriod,
        cashBalanceTotal,
        toPay,
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div className={ss.topbar}>
          <h1 className="page-title">Нарахування тренерів</h1>
          {rows.length > 0 && (
            <button
              className={styles.exportBtn}
              onClick={handleExportPdf}
              disabled={exporting}
              title="Завантажити PDF"
            >
              <Download size={15} />
              {exporting ? 'Генерація...' : 'PDF'}
            </button>
          )}
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
        <div className={styles.filterBar}>
          {trainers.length > 0 && (
            <FilterSelect
              value={selectedTrainerId}
              onChange={setSelectedTrainerId}
              placeholder="Тренер"
              options={trainers.map(t => ({ value: t.id, label: t.name }))}
              allowEmpty={false}
            />
          )}
          <span className={styles.filterLabel}>Від</span>
          <DatePicker value={dateFrom} onChange={setDateFrom} />
          <span className={styles.filterLabel}>До</span>
          <DatePicker value={dateTo} onChange={setDateTo} />
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-dots"><span /><span /><span /></div>
        ) : (
          <div className={styles.content}>
            <section className={styles.section}>
              <h2 className="section-title">Заняття</h2>
              {rows.length === 0 ? (
                <div className={ss.empty}>{MSG.empty.salaryClasses}</div>
              ) : (
                <>
                  {/* ── DESKTOP TABLE ── */}
                  <div className={`data-table-wrap ${styles.tableDesktop}`}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: 24 }}></th>
                          <th>Дата</th>
                          <th style={{ width: 120 }}>Статус</th>
                          {ticketTypes.map(t => (
                            <th key={t} className={styles.numCol}>{ticketTypeShortLabel(t)}</th>
                          ))}
                          <th className={styles.numCol}>Нараховано</th>
                        </tr>
                        <tr className={styles.periodTotalsRow}>
                          <td></td>
                          <td className={styles.grayCell}>Всього за період</td>
                          <td></td>
                          {ticketTypes.map(t => (
                            <td key={t} className={styles.numCell}>{totalByType[t] ?? 0} чол.</td>
                          ))}
                          <td className={styles.amtCell}>{formatMoney(totalTrainer)}</td>
                        </tr>
                      </thead>
                      <tbody>
                        {dayGroups.map(day => {
                          const dayExpanded = expandedDays.has(day.dateKey)
                          return (
                            <>
                              {/* Day row */}
                              <tr
                                key={day.dateKey}
                                className={`${styles.dayRow} ${dayExpanded ? styles.dayRowExpanded : ''}`}
                                onClick={() => toggleDay(day.dateKey)}
                              >
                                <td className={styles.expandCell}>
                                  <span className={`${styles.expandIcon} ${dayExpanded ? styles.expandIconOpen : ''}`}>▶</span>
                                </td>
                                <td className={styles.dayLabel}>{day.dateLabel}</td>
                                <td></td>
                                {ticketTypes.map(t => (
                                  <td key={t} className={styles.numCell}>
                                    {day.totalByType[t] != null
                                      ? <>{day.totalByType[t]} чол.</>
                                      : <span className={styles.dash}>—</span>
                                    }
                                  </td>
                                ))}
                                <td className={`${styles.amtCell} ${day.totalTrainer < 0 ? styles.amtNegative : ''}`}>{formatMoney(day.totalTrainer)}</td>
                              </tr>

                              {/* Class rows */}
                              {dayExpanded && day.classes.map(r => {
                                const classExpanded = expandedClasses.has(r.class_id)
                                return (
                                  <>
                                    <tr
                                      key={r.class_id}
                                      className={`${styles.classRow} ${classExpanded ? styles.classRowExpanded : ''}`}
                                      onClick={e => { e.stopPropagation(); toggleClass(r.class_id) }}
                                    >
                                      <td className={styles.expandCell}>
                                        <span className={`${styles.expandIcon} ${classExpanded ? styles.expandIconOpen : ''}`}>▶</span>
                                      </td>
                                      <td>
                                        <span className={styles.classIndent}>
                                          <span>{formatTime(r.starts_at)}</span>
                                          {r.hall_name && <span className={styles.grayCell}> · {r.hall_name}</span>}
                                        </span>
                                      </td>
                                      <td></td>
                                      {ticketTypes.map(t => (
                                        <td key={t} className={styles.numCell}>
                                          {t === r.ticket_type
                                            ? <>{r.total_clients} чол.</>
                                            : null
                                          }
                                        </td>
                                      ))}
                                      <td className={`${styles.amtCell} ${r.total_trainer < 0 ? styles.amtNegative : ''}`}>{formatMoney(r.total_trainer)}</td>
                                    </tr>

                                    {/* Client rows */}
                                    {classExpanded && r.enrollments.map(e => (
                                      <tr key={e.client_id} className={styles.clientRow}>
                                        <td></td>
                                        <td className={styles.clientName}>{e.client_name}</td>
                                        <td>
                                          <span className={enrollmentStatusClass(e.status)}>
                                            {enrollmentStatusLabel(e.status)}
                                          </span>
                                        </td>
                                        {ticketTypes.map(t => <td key={t} />)}
                                        <td className={`${styles.amtCell} ${e.trainer_amount < 0 ? styles.amtNegative : ''}`}>{formatMoney(e.trainer_amount)}</td>
                                      </tr>
                                    ))}
                                  </>
                                )
                              })}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* ── MOBILE CARDS ── */}
                  <div className={styles.cardList}>
                    {dayGroups.map(day => {
                      const dayExpanded = expandedDays.has(day.dateKey)
                      return (
                        <div key={day.dateKey} className={styles.dayCard}>
                          <div className={styles.dayCardHeader} onClick={() => toggleDay(day.dateKey)}>
                            <div className={styles.dayCardLeft}>
                              <span className={`${styles.expandIcon} ${dayExpanded ? styles.expandIconOpen : ''}`}>▶</span>
                              <span className={styles.dayLabel}>{day.dateLabel}</span>
                            </div>
                            <div className={styles.dayCardMeta}>
                              {ticketTypes.map(t => day.totalByType[t] != null && (
                                <span key={t} className={styles.grayCell}>
                                  {ticketTypeShortLabel(t)}: {day.totalByType[t]}
                                </span>
                              ))}
                              <span className={styles.cardAmt}>{formatMoney(day.totalTrainer)}</span>
                            </div>
                          </div>

                          {dayExpanded && (
                            <div className={styles.dayCardBody}>
                              {day.classes.map(r => {
                                const classExpanded = expandedClasses.has(r.class_id)
                                return (
                                  <div key={r.class_id} className={styles.classCard} onClick={() => toggleClass(r.class_id)}>
                                    <div className={styles.cardRow}>
                                      <div className={styles.cardLeft}>
                                        <span className={`${styles.expandIcon} ${classExpanded ? styles.expandIconOpen : ''}`}>▶</span>
                                        <span className="badge badge-type">{ticketTypeShortLabel(r.ticket_type)}</span>
                                        <span className={styles.cardDatetime}>{formatTime(r.starts_at)}</span>
                                        {r.hall_name && <span className={styles.grayCell}>{r.hall_name}</span>}
                                      </div>
                                      <div className={styles.cardRight}>
                                        <span className={styles.cardAmt}>{formatMoney(r.total_trainer)}</span>
                                        <span className={styles.grayCell}>{r.total_clients} чол.</span>
                                      </div>
                                    </div>
                                    {classExpanded && (
                                      <div className={styles.clientList}>
                                        {r.enrollments.map(e => (
                                          <div key={e.client_id} className={styles.clientItem}>
                                            <span>{e.client_name}</span>
                                            <div className={styles.clientRight}>
                                              <span className={enrollmentStatusClass(e.status)}>
                                                {enrollmentStatusLabel(e.status)}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <div className={styles.cardTotal}>
                      <span>Нараховано тренеру</span>
                      <span>{formatMoney(totalTrainer)}</span>
                    </div>
                  </div>
                </>
              )}
            </section>

            <section className={styles.section}>
              <h2 className="section-title">Підсумок</h2>
              <div className={styles.summary}>
                <div className={styles.summaryRow}>
                  <span>Нараховано тренеру:</span>
                  <strong>{formatMoney(totalTrainer)}</strong>
                </div>
                <div className={styles.summaryRow}>
                  <button className={styles.cashToggle} onClick={() => setCashExpanded(o => !o)}>
                    <span className={`${styles.expandIcon} ${cashExpanded ? styles.expandIconOpen : ''}`}>▶</span>
                    Готівка на руках:
                  </button>
                  <strong className={cashBalanceTotal > 0 ? styles.cashAmt : ''}>{formatMoney(cashBalanceTotal)}</strong>
                </div>
                {cashExpanded && cashBalance && (
                  <div className={styles.cashDetail}>
                    {cashBalance.cash_sales.length > 0 && (
                      <>
                        <div className={styles.cashHeader}>Cash продажі</div>
                        {cashBalance.cash_sales.map(s => (
                          <div key={s.id} className={styles.cashItem}>
                            <span className={styles.grayCell}>{formatDateShort(s.created_at)} {formatTime(s.created_at)}</span>
                            <span>{s.client_name}</span>
                            <span>{s.ticket_name ?? '—'}</span>
                            <span className={styles.cashItemAmt}>+{formatMoney(s.amount)}</span>
                          </div>
                        ))}
                      </>
                    )}
                    {cashBalance.expenses.length > 0 && (
                      <>
                        <div className={styles.cashHeader}>Витрати</div>
                        {cashBalance.expenses.map(e => (
                          <div key={e.id} className={styles.cashItem}>
                            <span className={styles.grayCell}>{formatDateShort(e.created_at)} {formatTime(e.created_at)}</span>
                            <span>{e.description ?? '—'}</span>
                            <span></span>
                            <span className={styles.cashItemExpense}>−{formatMoney(e.amount)}</span>
                          </div>
                        ))}
                      </>
                    )}
                    {cashBalance.salary_payments.length > 0 && (
                      <>
                        <div className={styles.cashHeader}>Виплати ЗП</div>
                        {cashBalance.salary_payments.map(p => (
                          <div key={p.id} className={styles.cashItem}>
                            <span className={styles.grayCell}>{formatDate(p.payment_date)}</span>
                            <span>Виплата тренеру</span>
                            <span></span>
                            <span className={styles.cashItemExpense}>−{formatMoney(p.amount)}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
                <div className={styles.summaryRow}>
                  <span>Виплачено за період:</span>
                  <strong>{formatMoney(totalPaidPeriod)}</strong>
                </div>
                <div className={`${styles.summaryRow} ${styles.summaryRowTotal}`}>
                  <span>До виплати:</span>
                  <strong className={toPay > 0 ? styles.toPayAmt : ''}>{formatMoney(Math.max(0, toPay))}</strong>
                </div>
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className="section-title">Виплати</h2>
                <button className="btn-primary" onClick={openPaymentModal}>+ Зафіксувати виплату</button>
              </div>
              {payments.length === 0 ? (
                <div className={ss.empty}>{MSG.empty.salaryPayments}</div>
              ) : (
                <div className={`data-table-wrap ${styles.tableDesktop}`}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Тип</th>
                        <th>Метод</th>
                        <th>Період</th>
                        <th className={styles.numCol}>Нараховано</th>
                        <th className={styles.numCol}>Виплачено</th>
                        <th>Примітка</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id}>
                          <td>{formatDate(p.payment_date)}</td>
                          <td>
                            <span className={`badge ${p.payment_type === 'advance' ? 'badge-type' : 'badge-completed'}`}>
                              {p.payment_type === 'advance' ? 'Аванс' : 'Фінальна'}
                            </span>
                          </td>
                          <td>
                            <span className={paymentClass((p.payment_method ?? 'cash') as any)}>
                              {paymentLabel((p.payment_method ?? 'cash') as any)}
                            </span>
                          </td>
                          <td className={styles.grayCell}>{formatDate(p.period_start)} – {formatDate(p.period_end)}</td>
                          <td className={styles.numCell}>{formatMoney(Number(p.calculated_amount))}</td>
                          <td className={styles.amtCell}>{formatMoney(Number(p.paid_amount))}</td>
                          <td className={styles.grayCell}>{p.notes ?? '—'}</td>
                          <td>
                            <div className={styles.payActions}>
                              <button className={styles.payActionBtn} onClick={() => openEditModal(p)} title="Редагувати">
                                <Pencil size={14} />
                              </button>
                              <button className={`${styles.payActionBtn} ${styles.payActionDanger}`} onClick={() => setDeletingPaymentId(p.id)} title="Видалити">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className={styles.totalRow}>
                        <td colSpan={4}>Виплачено всього</td>
                        <td className={styles.totalAmt}>{formatMoney(totalPaidPeriod)}</td>
                        <td></td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <div className={styles.cardList}>
                {payments.map(p => (
                  <div key={p.id} className={styles.payCard}>
                    <div className={styles.cardRow}>
                      <span>{formatDate(p.payment_date)}</span>
                      <div className={styles.payActions}>
                        <span className={styles.amtCell}>{formatMoney(Number(p.paid_amount))}</span>
                        <button className={styles.payActionBtn} onClick={() => openEditModal(p)} title="Редагувати">
                          <Pencil size={14} />
                        </button>
                        <button className={`${styles.payActionBtn} ${styles.payActionDanger}`} onClick={() => setDeletingPaymentId(p.id)} title="Видалити">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className={styles.cardMeta}>
                      <span className={`badge ${p.payment_type === 'advance' ? 'badge-type' : 'badge-completed'}`}>
                        {p.payment_type === 'advance' ? 'Аванс' : 'Фінальна'}
                      </span>
                      <span className={paymentClass((p.payment_method ?? 'cash') as any)}>
                        {paymentLabel((p.payment_method ?? 'cash') as any)}
                      </span>
                      <span className={styles.grayCell}>{formatDate(p.period_start)} – {formatDate(p.period_end)}</span>
                    </div>
                    {p.notes && <div className={styles.grayCell}>{p.notes}</div>}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {paymentModal && (
        <ModalShell
          title={editingPayment ? 'Редагувати виплату' : 'Зафіксувати виплату'}
          onClose={() => setPaymentModal(false)}
          footer={
            <ModalFooter
              onCancel={() => setPaymentModal(false)}
              onSave={handleSavePayment}
              loading={saving}
            />
          }
        >
          <div className={styles.modalHint}>
            Нараховано тренеру: <strong>{formatMoney(totalTrainer)}</strong>
            {cashOnHand > 0 && <> · Готівка за період: <strong>{formatMoney(cashOnHand)}</strong></>}
            {cashBalanceTotal > 0 && cashBalanceTotal !== cashOnHand && <> · Всього на руках: <strong>{formatMoney(cashBalanceTotal)}</strong></>}
          </div>

          <div>
            <label className={styles.fieldLabel}>Метод виплати</label>
            <div className={styles.typeToggle}>
              {(['cash', 'fop', 'personal_card'] as const).map(m => (
                <button
                  key={m}
                  className={`${styles.typeBtn} ${paymentMethod === m ? styles.typeBtnActive : ''}`}
                  onClick={() => setPaymentMethod(m)}
                >
                  {m === 'cash' ? 'Готівка' : m === 'fop' ? 'ФОП' : 'Картка'}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === 'cash' && (
            <FormField id="pay-cash-holder" label="З чиєї готівки">
              <select
                id="pay-cash-holder"
                value={paymentCashHolder}
                onChange={e => setPaymentCashHolder(e.target.value)}
              >
                <option value="">— Оберіть —</option>
                {trainers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </FormField>
          )}

          <div>
            <label className={styles.fieldLabel}>Тип виплати</label>
            <div className={styles.typeToggle}>
              <button
                className={`${styles.typeBtn} ${paymentType === 'final' ? styles.typeBtnActive : ''}`}
                onClick={() => setPaymentType('final')}
              >Фінальна</button>
              <button
                className={`${styles.typeBtn} ${paymentType === 'advance' ? styles.typeBtnActive : ''}`}
                onClick={() => setPaymentType('advance')}
              >Аванс</button>
            </div>
          </div>

          <FormField id="pay-amount" label="Виплачено ₴">
            <input
              id="pay-amount"
              type="number" min="0" step="10"
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField id="pay-date" label="Дата виплати">
            <input
              id="pay-date"
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
            />
          </FormField>

          <FormField id="pay-notes" label="Примітка">
            <input
              id="pay-notes"
              type="text"
              value={paymentNotes}
              onChange={e => setPaymentNotes(e.target.value)}
              placeholder="необов'язково"
            />
          </FormField>

          {paymentError && <div className={styles.errorMsg}>{paymentError}</div>}
        </ModalShell>
      )}

      {deletingPaymentId && (
        <ModalShell
          title="Видалити виплату?"
          onClose={() => setDeletingPaymentId(null)}
          footer={
            <ModalFooter
              onCancel={() => setDeletingPaymentId(null)}
              onSave={() => handleDeletePayment(deletingPaymentId)}
              saveLabel="Видалити"
              loading={false}
            />
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>
            Виплату буде видалено. Цю дію неможливо скасувати.
          </p>
        </ModalShell>
      )}
    </>
  )
}
