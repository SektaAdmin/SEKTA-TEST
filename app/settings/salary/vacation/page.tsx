'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  getTrainerVacationStartDate,
  updateTrainerVacationStartDate,
  listTrainerVacations,
  insertTrainerVacation,
  deactivateTrainerVacation,
  listVacationPayments,
  getTrainerSalaryByQuarters,
  type TrainerVacation,
  type VacationPayment,
} from '@/lib/queries/trainer-vacations'
import { insertTrainerPayment, deleteTrainerPayment } from '@/lib/queries/trainer-rates'
import { listActiveTrainers } from '@/lib/queries/trainers'
import type { Trainer } from '@/types'
import DatePicker from '@/components/DatePicker'
import { formatMoney, formatDate } from '@/lib/formatters'
import { toYMD, ymdToDisplay } from '@/lib/dateUtils'
import {
  buildVacationQuarters,
  buildVacationRows,
  daysInclusive,
  pluralDays,
  VACATION_DAYS_PER_QUARTER,
  type VacationQuarterRow,
} from '@/lib/vacation'
import { paymentLabel, paymentClass } from '@/lib/badges'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
import FilterSelect from '@/components/ui/FilterSelect'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { MSG } from '@/lib/messages'
import ss from '@/app/settings/settings.module.css'
import cs from '../calculations/calculations.module.css'
import styles from './vacation.module.css'

const SALARY_TABS = [
  { href: '/settings/salary/rates', label: 'Ставки' },
  { href: '/settings/salary/calculations', label: 'Нарахування' },
  { href: '/settings/salary/vacation', label: 'Відпускні' },
]

type PayMethod = 'cash' | 'fop' | 'personal_card'

function periodLabel(start: string, end: string) {
  return `${ymdToDisplay(start)} – ${ymdToDisplay(end)}`
}

export default function SalaryVacationPage() {
  const pathname = usePathname()
  const today = toYMD(new Date())
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [trainerId, setTrainerId] = useState('')
  const [startDate, setStartDate] = useState<string | null>(null)
  const [startDraft, setStartDraft] = useState('')
  const [vacations, setVacations] = useState<TrainerVacation[]>([])
  const [payments, setPayments] = useState<VacationPayment[]>([])
  const [salaries, setSalaries] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [savingStart, setSavingStart] = useState(false)

  // Модалка відпустки
  const [vacModal, setVacModal] = useState(false)
  const [vacFrom, setVacFrom] = useState('')
  const [vacTo, setVacTo] = useState('')
  const [vacNotes, setVacNotes] = useState('')
  const [vacError, setVacError] = useState<string | null>(null)
  const [deletingVacation, setDeletingVacation] = useState<TrainerVacation | null>(null)

  // Модалка виплати
  const [payQuarter, setPayQuarter] = useState<VacationQuarterRow | null>(null)
  const [payMethod, setPayMethod] = useState<PayMethod>('cash')
  const [payCashHolder, setPayCashHolder] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [payError, setPayError] = useState<string | null>(null)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listActiveTrainers(supabase).then(r => {
      setTrainers(r.data)
      if (r.data.length > 0) setTrainerId(r.data[0].id)
    })
  }, [])

  const quarters = useMemo(
    () => (startDate ? buildVacationQuarters(startDate, today) : []),
    [startDate, today]
  )

  const fetchAll = useCallback(async () => {
    if (!trainerId) return
    setLoading(true)
    const [start, vacs, pays] = await Promise.all([
      getTrainerVacationStartDate(supabase, trainerId),
      listTrainerVacations(supabase, trainerId),
      listVacationPayments(supabase, trainerId),
    ])
    const qs = start.data ? buildVacationQuarters(start.data, toYMD(new Date())) : []
    const sal = await getTrainerSalaryByQuarters(supabase, trainerId, qs)
    const error = start.error ?? vacs.error ?? pays.error ?? sal.error
    if (error) toast.error(error)
    setStartDate(start.data)
    setStartDraft(start.data ?? '')
    setVacations(vacs.data)
    setPayments(pays.data)
    setSalaries(sal.data)
    setLoading(false)
  }, [trainerId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const rows = useMemo(
    () => buildVacationRows(quarters, salaries, vacations, payments),
    [quarters, salaries, vacations, payments]
  )

  async function handleSaveStart() {
    if (!startDraft) return
    setSavingStart(true)
    const { error } = await updateTrainerVacationStartDate(supabase, trainerId, startDraft)
    setSavingStart(false)
    if (error) { toast.error(error); return }
    toast.success(MSG.toast.saved)
    fetchAll()
  }

  function openVacationModal() {
    setVacFrom(today)
    setVacTo(today)
    setVacNotes('')
    setVacError(null)
    setVacModal(true)
  }

  async function handleSaveVacation() {
    if (!vacFrom || !vacTo) { setVacError('Оберіть дати відпустки'); return }
    if (vacTo < vacFrom) { setVacError('Дата завершення раніше за дату початку'); return }
    setSaving(true)
    const { error } = await insertTrainerVacation(supabase, {
      trainer_id: trainerId,
      date_from: vacFrom,
      date_to: vacTo,
      notes: vacNotes.trim() || null,
    })
    setSaving(false)
    if (error) { setVacError(error); return }
    setVacModal(false)
    fetchAll()
  }

  async function handleDeleteVacation(v: TrainerVacation) {
    const { error } = await deactivateTrainerVacation(supabase, v.id)
    if (error) { toast.error(MSG.toast.deleteFailed); return }
    setDeletingVacation(null)
    fetchAll()
  }

  function openPayModal(q: VacationQuarterRow) {
    setPayQuarter(q)
    setPayMethod('cash')
    setPayCashHolder(trainerId)
    setPayAmount(String(Math.max(0, q.accrued - q.paid)))
    setPayDate(today)
    setPayNotes('')
    setPayError(null)
  }

  async function handleSavePayment() {
    if (!payQuarter) return
    const amount = Math.round(Number(payAmount))
    if (!amount || amount <= 0) { setPayError('Введіть суму виплати'); return }
    if (!payDate) { setPayError('Оберіть дату'); return }
    setSaving(true)
    const { error } = await insertTrainerPayment(supabase, {
      trainer_id: trainerId,
      period_start: payQuarter.start,
      period_end: payQuarter.end,
      calculated_amount: payQuarter.accrued,
      paid_amount: amount,
      payment_date: payDate,
      payment_method: payMethod,
      cash_holder: payMethod === 'cash' ? (payCashHolder || null) : null,
      payment_type: 'vacation',
      notes: payNotes.trim() || null,
    })
    setSaving(false)
    if (error) { setPayError(error); return }
    setPayQuarter(null)
    fetchAll()
  }

  async function handleDeletePayment(id: string) {
    const { error } = await deleteTrainerPayment(supabase, id)
    if (error) { toast.error(MSG.toast.deleteFailed); return }
    setDeletingPaymentId(null)
    fetchAll()
  }

  function quarterAction(q: VacationQuarterRow) {
    if (q.isCurrent) return <span className="badge badge-type">Поточний</span>
    if (q.accrued > 0 && q.paid >= q.accrued) {
      return <span className="badge badge-completed">Виплачено</span>
    }
    if (q.accrued <= 0) return <span className={cs.grayCell}>—</span>
    return <button className="btn-secondary" onClick={() => openPayModal(q)}>Виплатити</button>
  }

  return (
    <>
      <div className="page-head">
        <div className={ss.topbar}>
          <h1 className="page-title">Відпускні тренерів</h1>
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
        <div className={cs.filterBar}>
          {trainers.length > 0 && (
            <FilterSelect
              value={trainerId}
              onChange={setTrainerId}
              placeholder="Тренер"
              options={trainers.map(t => ({ value: t.id, label: t.name }))}
              allowEmpty={false}
            />
          )}
          <span className={cs.filterLabel}>Квартали від</span>
          <DatePicker value={startDraft} onChange={setStartDraft} placeholder="Дата старту" />
          {startDraft && startDraft !== (startDate ?? '') && (
            <button className="btn-primary" onClick={handleSaveStart} disabled={savingStart}>
              {savingStart ? 'Збереження...' : 'Зберегти'}
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className={cs.content} role="status" aria-label="Завантаження...">
            <div className="skeleton-bone" style={{ width: 240 }} />
            <div className="skeleton-bone" style={{ width: '100%', height: 160 }} />
          </div>
        ) : !startDate ? (
          <div className={cs.content}>
            <div className={ss.empty}>{MSG.empty.vacationNoStart}</div>
          </div>
        ) : (
          <div className={cs.content}>
            <section className={cs.section}>
              <div className={cs.sectionHeader}>
                <h2 className="section-title">Квартали</h2>
              </div>
              <p className={styles.formula}>
                Відпускні = ЗП за квартал ÷ робочих днів × {VACATION_DAYS_PER_QUARTER}.
                Робочі дні — календарні дні кварталу мінус дні відпустки.
              </p>

              <div className={`data-table-wrap ${cs.tableDesktop}`}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Період</th>
                      <th className={cs.numCol}>Відпустка</th>
                      <th className={cs.numCol}>Робочих днів</th>
                      <th className={cs.numCol}>ЗП за період</th>
                      <th className={cs.numCol}>Відпускні</th>
                      <th className={cs.numCol}>Виплачено</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(q => (
                      <tr key={q.start}>
                        <td className={cs.grayCell}>{q.index}</td>
                        <td>{periodLabel(q.start, q.end)}</td>
                        <td className={cs.numCell}>
                          {q.vacationDays > 0 ? `${q.vacationDays} ${pluralDays(q.vacationDays)}` : <span className={cs.dash}>—</span>}
                        </td>
                        <td className={cs.numCell}>{q.workedDays}</td>
                        <td className={cs.amtCell}>{formatMoney(q.salary)}</td>
                        <td className={cs.amtCell}>{formatMoney(q.accrued)}</td>
                        <td className={cs.amtCell}>
                          {q.paid > 0 ? formatMoney(q.paid) : <span className={cs.dash}>—</span>}
                        </td>
                        <td className={styles.actionCell}>{quarterAction(q)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={cs.cardList}>
                {rows.map(q => (
                  <div key={q.start} className={cs.payCard}>
                    <div className={cs.cardRow}>
                      <span>{q.index}. {periodLabel(q.start, q.end)}</span>
                      <span className={cs.amtCell}>{formatMoney(q.accrued)}</span>
                    </div>
                    <div className={cs.cardMeta}>
                      <span className={cs.grayCell}>ЗП {formatMoney(q.salary)}</span>
                      <span className={cs.grayCell}>· {q.workedDays} роб. {pluralDays(q.workedDays)}</span>
                      {q.vacationDays > 0 && (
                        <span className={cs.grayCell}>· відпустка {q.vacationDays} {pluralDays(q.vacationDays)}</span>
                      )}
                    </div>
                    <div className={cs.cardRow}>
                      <span className={cs.grayCell}>
                        {q.paid > 0 ? `Виплачено ${formatMoney(q.paid)}` : ''}
                      </span>
                      {quarterAction(q)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={cs.section}>
              <div className={cs.sectionHeader}>
                <h2 className="section-title">Відпустки</h2>
                <button className="btn-primary" onClick={openVacationModal}>+ Додати відпустку</button>
              </div>
              {vacations.length === 0 ? (
                <div className={ss.empty}>{MSG.empty.vacations}</div>
              ) : (
                <div className={styles.list}>
                  {vacations.map(v => {
                    const days = daysInclusive(v.date_from, v.date_to)
                    return (
                      <div key={v.id} className={styles.listRow}>
                        <div className={styles.listMain}>
                          <span>{periodLabel(v.date_from, v.date_to)}</span>
                          <span className={cs.grayCell}>{days} {pluralDays(days)}{v.notes ? ` · ${v.notes}` : ''}</span>
                        </div>
                        <button
                          className={`${cs.payActionBtn} ${cs.payActionDanger}`}
                          onClick={() => setDeletingVacation(v)}
                          title="Видалити"
                          aria-label="Видалити відпустку"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className={cs.section}>
              <h2 className="section-title">Виплати відпускних</h2>
              {payments.length === 0 ? (
                <div className={ss.empty}>{MSG.empty.vacationPayments}</div>
              ) : (
                <div className={styles.list}>
                  {payments.map(p => (
                    <div key={p.id} className={styles.listRow}>
                      <div className={styles.listMain}>
                        <span>
                          {formatDate(p.payment_date)} · <strong className={cs.amtCell}>{formatMoney(Number(p.paid_amount))}</strong>
                        </span>
                        <span className={styles.listMeta}>
                          <span className={paymentClass(p.payment_method as PayMethod)}>{paymentLabel(p.payment_method as PayMethod)}</span>
                          <span className={cs.grayCell}>за {periodLabel(p.period_start, p.period_end)}{p.notes ? ` · ${p.notes}` : ''}</span>
                        </span>
                      </div>
                      <button
                        className={`${cs.payActionBtn} ${cs.payActionDanger}`}
                        onClick={() => setDeletingPaymentId(p.id)}
                        title="Видалити"
                        aria-label="Видалити виплату"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {vacModal && (
        <ModalShell
          title="Додати відпустку"
          onClose={() => setVacModal(false)}
          footer={<ModalFooter onCancel={() => setVacModal(false)} onSave={handleSaveVacation} loading={saving} />}
        >
          <FormField id="vac-from" label="З">
            <DatePicker value={vacFrom} onChange={setVacFrom} />
          </FormField>
          <FormField id="vac-to" label="По (включно)">
            <DatePicker value={vacTo} onChange={setVacTo} />
          </FormField>
          {vacFrom && vacTo && vacTo >= vacFrom && (
            <div className={cs.modalHint}>
              {daysInclusive(vacFrom, vacTo)} {pluralDays(daysInclusive(vacFrom, vacTo))} відпустки
            </div>
          )}
          <FormField id="vac-notes" label="Примітка">
            <input
              id="vac-notes"
              type="text"
              value={vacNotes}
              onChange={e => setVacNotes(e.target.value)}
              placeholder="необов'язково"
            />
          </FormField>
          {vacError && <div className={cs.errorMsg}>{vacError}</div>}
        </ModalShell>
      )}

      {payQuarter && (
        <ModalShell
          title="Виплатити відпускні"
          onClose={() => setPayQuarter(null)}
          footer={<ModalFooter onCancel={() => setPayQuarter(null)} onSave={handleSavePayment} loading={saving} />}
        >
          <div className={cs.modalHint}>
            Квартал {payQuarter.index} ({periodLabel(payQuarter.start, payQuarter.end)}):
            нараховано <strong>{formatMoney(payQuarter.accrued)}</strong>
            {payQuarter.paid > 0 && <> · вже виплачено <strong>{formatMoney(payQuarter.paid)}</strong></>}
          </div>

          <div>
            <label className={cs.fieldLabel}>Метод виплати</label>
            <div className={cs.typeToggle}>
              {(['cash', 'fop', 'personal_card'] as const).map(m => (
                <button
                  key={m}
                  className={`${cs.typeBtn} ${payMethod === m ? cs.typeBtnActive : ''}`}
                  onClick={() => setPayMethod(m)}
                >
                  {paymentLabel(m)}
                </button>
              ))}
            </div>
          </div>

          {payMethod === 'cash' && (
            <FormField id="vac-pay-holder" label="З чиєї готівки">
              <select id="vac-pay-holder" value={payCashHolder} onChange={e => setPayCashHolder(e.target.value)}>
                <option value="">— Оберіть —</option>
                {trainers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </FormField>
          )}

          <FormField id="vac-pay-amount" label="Виплачено ₴">
            <input
              id="vac-pay-amount"
              type="number" min="0" step="1"
              value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField id="vac-pay-date" label="Дата виплати">
            <DatePicker value={payDate} onChange={setPayDate} />
          </FormField>

          <FormField id="vac-pay-notes" label="Примітка">
            <input
              id="vac-pay-notes"
              type="text"
              value={payNotes}
              onChange={e => setPayNotes(e.target.value)}
              placeholder="необов'язково"
            />
          </FormField>

          {payError && <div className={cs.errorMsg}>{payError}</div>}
        </ModalShell>
      )}

      {deletingVacation && (
        <ModalShell
          title="Видалити відпустку?"
          onClose={() => setDeletingVacation(null)}
          footer={
            <ModalFooter
              onCancel={() => setDeletingVacation(null)}
              onSave={() => handleDeleteVacation(deletingVacation)}
              saveLabel="Видалити"
              loading={false}
            />
          }
        >
          <p className={styles.confirmText}>
            Відпустку {periodLabel(deletingVacation.date_from, deletingVacation.date_to)} буде видалено,
            робочі дні кварталу перерахуються.
          </p>
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
          <p className={styles.confirmText}>Виплату буде видалено. Цю дію неможливо скасувати.</p>
        </ModalShell>
      )}
    </>
  )
}
