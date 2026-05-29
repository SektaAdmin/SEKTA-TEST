'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  calcTrainerSalaryDetail,
  getTrainerCashBalance,
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
import { toYMD } from '@/lib/dateUtils'
import { ticketTypeShortLabel, enrollmentStatusClass, enrollmentStatusLabel, paymentLabel, paymentClass } from '@/lib/badges'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { MSG } from '@/lib/messages'
import ss from '@/app/settings/settings.module.css'
import styles from './calculations.module.css'

const SALARY_TABS = [
  { href: '/settings/salary/rates', label: 'Ставки' },
  { href: '/settings/salary/calculations', label: 'Нарахування' },
]

interface FilterSelectProps {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}
function FilterSelect({ value, onChange, placeholder, options }: FilterSelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger className={styles.fsTrigger} aria-label={placeholder}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className={styles.fsChevron} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className={styles.fsContent} position="popper" sideOffset={4}>
          <SelectPrimitive.Viewport>
            {options.map(o => (
              <SelectPrimitive.Item key={o.value} value={o.value} className={styles.fsItem}>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

function getMonthRange() {
  const d = new Date()
  const start = toYMD(new Date(d.getFullYear(), d.getMonth(), 1))
  const end = toYMD(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  return { start, end }
}

export default function SalaryCalculationsPage() {
  const pathname = usePathname()
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [selectedTrainerId, setSelectedTrainerId] = useState('')
  const [dateFrom, setDateFrom] = useState(() => getMonthRange().start)
  const [dateTo, setDateTo] = useState(() => getMonthRange().end)
  const [rows, setRows] = useState<TrainerSalaryDetailRow[]>([])
  const [cashBalance, setCashBalance] = useState<TrainerCashBalance | null>(null)
  const [payments, setPayments] = useState<TrainerPayment[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())
  const [cashExpanded, setCashExpanded] = useState(false)
  const [paymentModal, setPaymentModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState<TrainerPayment | null>(null)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)
  const [paymentType, setPaymentType] = useState<'advance' | 'final'>('final')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'fop' | 'personal_card'>('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  useEffect(() => {
    listActiveTrainers(supabase).then(data => {
      setTrainers(data)
      if (data.length > 0) setSelectedTrainerId(data[0].id)
    })
  }, [])

  const fetchAll = useCallback(async () => {
    if (!selectedTrainerId) return
    setLoading(true)
    const startISO = `${dateFrom}T00:00:00`
    const endISO = `${dateTo}T23:59:59`
    const [detail, cash, pays] = await Promise.all([
      calcTrainerSalaryDetail(supabase, selectedTrainerId, startISO, endISO),
      getTrainerCashBalance(supabase, selectedTrainerId, dateFrom, dateTo),
      listTrainerPayments(supabase, selectedTrainerId, dateFrom, dateTo),
    ])
    setRows(detail)
    setCashBalance(cash)
    setPayments(pays)
    setLoading(false)
  }, [selectedTrainerId, dateFrom, dateTo])

  useEffect(() => { fetchAll() }, [fetchAll])

  const totalTrainer = useMemo(() => rows.reduce((s, r) => s + r.total_trainer, 0), [rows])
  const totalStudio = useMemo(() => rows.reduce((s, r) => s + r.total_studio, 0), [rows])
  const totalPaidPeriod = useMemo(() => payments.reduce((s, p) => s + Number(p.paid_amount), 0), [payments])
  const cashOnHand = cashBalance?.total ?? 0
  const toPay = totalTrainer - cashOnHand - totalPaidPeriod

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
    setPaymentModal(true)
  }

  function openEditModal(p: TrainerPayment) {
    setEditingPayment(p)
    setPaymentDate(p.payment_date)
    setPaymentAmount(String(p.paid_amount))
    setPaymentNotes(p.notes ?? '')
    setPaymentType(p.payment_type)
    setPaymentMethod((p.payment_method ?? 'cash') as 'cash' | 'fop' | 'personal_card')
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
    if (error) { toast.error('Помилка видалення'); return }
    setDeletingPaymentId(null)
    fetchAll()
  }

  return (
    <>
      <div className="page-head">
        <div className={ss.topbar}>
          <h1 className="page-title">Нарахування тренерів</h1>
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
                  <div className={`data-table-wrap ${styles.tableDesktop}`}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th></th>
                          <th>Дата</th>
                          <th>Тип</th>
                          <th>Зал</th>
                          <th className={styles.numCol}>Людей</th>
                          <th className={styles.numCol}>Нараховано</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => {
                          const expanded = expandedClasses.has(r.class_id)
                          return (
                            <>
                              <tr key={r.class_id} className={`${styles.classRow} ${expanded ? styles.classRowExpanded : ''}`} onClick={() => toggleClass(r.class_id)}>
                                <td className={styles.expandCell}>
                                  <span className={`${styles.expandIcon} ${expanded ? styles.expandIconOpen : ''}`}>▶</span>
                                </td>
                                <td>
                                  <span className={styles.dateMain}>{formatDateShort(r.starts_at)}</span>
                                  <span className={styles.dateTime}> {formatTime(r.starts_at)}</span>
                                </td>
                                <td><span className="badge badge-type">{ticketTypeShortLabel(r.ticket_type)}</span></td>
                                <td className={styles.grayCell}>{r.hall_name ?? '—'}</td>
                                <td className={styles.numCell}>{r.total_clients}</td>
                                <td className={styles.amtCell}>{formatMoney(r.total_trainer)}</td>
                              </tr>
                              {expanded && r.enrollments.map(e => (
                                <tr key={e.client_id} className={styles.clientRow}>
                                  <td></td>
                                  <td colSpan={3} className={styles.clientName}>{e.client_name}</td>
                                  <td className={styles.numCell}>
                                    <span className={enrollmentStatusClass(e.status)}>
                                      {enrollmentStatusLabel(e.status)}
                                    </span>
                                  </td>
                                  <td className={styles.amtCell}>{formatMoney(e.trainer_amount)}</td>
                                </tr>
                              ))}
                            </>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className={styles.totalRow}>
                          <td colSpan={5}>Нараховано тренеру</td>
                          <td className={styles.totalAmt}>{formatMoney(totalTrainer)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className={styles.cardList}>
                    {rows.map(r => {
                      const expanded = expandedClasses.has(r.class_id)
                      return (
                        <div key={r.class_id} className={styles.classCard} onClick={() => toggleClass(r.class_id)}>
                          <div className={styles.cardRow}>
                            <div className={styles.cardLeft}>
                              <span className="badge badge-type">{ticketTypeShortLabel(r.ticket_type)}</span>
                              <span className={styles.cardDatetime}>{formatDateShort(r.starts_at)} {formatTime(r.starts_at)}</span>
                              {r.hall_name && <span className={styles.grayCell}>{r.hall_name}</span>}
                            </div>
                            <div className={styles.cardRight}>
                              <span className={styles.cardAmt}>{formatMoney(r.total_trainer)}</span>
                              <span className={styles.grayCell}>{r.total_clients} чол.</span>
                            </div>
                          </div>
                          {expanded && (
                            <div className={styles.clientList}>
                              {r.enrollments.map(e => (
                                <div key={e.client_id} className={styles.clientItem}>
                                  <span>{e.client_name}</span>
                                  <div className={styles.clientRight}>
                                    <span className={enrollmentStatusClass(e.status)}>
                                      {enrollmentStatusLabel(e.status)}
                                    </span>
                                    <span>{formatMoney(e.trainer_amount)}</span>
                                  </div>
                                </div>
                              ))}
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
                  <strong className={cashOnHand > 0 ? styles.cashAmt : ''}>{formatMoney(cashOnHand)}</strong>
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
                <div className={`${styles.summaryRow} ${styles.summaryStudio}`}>
                  <span>Виручка студії (цей період):</span>
                  <strong>{formatMoney(totalStudio)}</strong>
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
          width={380}
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
            {cashOnHand > 0 && <> · Готівка: <strong>{formatMoney(cashOnHand)}</strong></>}
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

          <div>
            <label className={styles.fieldLabel}>Виплачено ₴</label>
            <input
              className={styles.modalInput}
              type="number" min="0" step="10"
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className={styles.fieldLabel}>Дата виплати</label>
            <input
              className={styles.modalInput}
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
            />
          </div>

          <div>
            <label className={styles.fieldLabel}>Примітка</label>
            <input
              className={styles.modalInput}
              type="text"
              value={paymentNotes}
              onChange={e => setPaymentNotes(e.target.value)}
              placeholder="необов'язково"
            />
          </div>

          {paymentError && <div className={styles.errorMsg}>{paymentError}</div>}
        </ModalShell>
      )}

      {deletingPaymentId && (
        <ModalShell
          title="Видалити виплату?"
          onClose={() => setDeletingPaymentId(null)}
          width={360}
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
