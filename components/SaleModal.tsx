'use client'
import { useState, useEffect, useMemo, useCallback, useId, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createClient } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
import { formatClientLabel, nowDatetimeLocal, isoToDatetimeLocal, datetimeLocalToDisplay, parseDisplayToDatetimeLocal } from '@/lib/formatters'
import ClientSearchCombobox from './ClientSearchCombobox'
import type { Client, Ticket, Trainer, SaleFormData, PaymentMethod } from '@/types'
import styles from './SaleModal.module.css'

const supabase = createClient()

export interface EditSaleSnapshot {
  id: string
  client_id: string
  client_name: string
  ticket_id: string | null
  ticket_name: string | null
  ticket_price: number | null
  ticket_type: string | null
  sessions: number | null
  trainer_id: string | null
  trainer_name: string | null
  price_paid: number
  amount_given: number
  payment_method: PaymentMethod
  notes: string | null
  created_at: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
  editSale?: EditSaleSnapshot
  preselectedClient?: Client
}

const saleSchema = z.object({
  client_id: z.string().min(1, 'Оберіть клієнта'),
  ticket_id: z.string().optional().or(z.literal('')),
  trainer_id: z.string().optional().or(z.literal('')),
  price_paid: z.number().min(0),
  amount_given: z.number(),
  payment_method: z.enum(['cash', 'fop', 'personal_card', 'deposit']),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.ticket_id && !data.trainer_id && data.payment_method === 'cash') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Оберіть тренера', path: ['trainer_id'] })
  }
  if (!data.ticket_id && data.amount_given === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Сума не може бути 0', path: ['amount_given'] })
  }

})

type SaleFormValues = z.infer<typeof saleSchema>


export default function SaleModal({ onClose, onSaved, editSale, preselectedClient }: Props) {
  const isEdit = !!editSale
  const titleId = useId()

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<SaleFormValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      client_id: editSale?.client_id ?? preselectedClient?.id ?? '',
      ticket_id: editSale?.ticket_id ?? '',
      trainer_id: editSale?.trainer_id ?? '',
      price_paid: editSale?.price_paid ?? 0,
      // For no-ticket edits, reconstruct the signed amount (amount_given - price_paid)
      amount_given: editSale
        ? (editSale.ticket_id
            ? editSale.amount_given
            : (editSale.amount_given - editSale.price_paid))
        : 0,
      payment_method: editSale?.payment_method ?? 'cash',
      notes: editSale?.notes ?? '',
    }
  })

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [clientBalance, setClientBalance] = useState<number | null>(preselectedClient?.balance ?? null)
  const [ticketChanged, setTicketChanged] = useState(false)
  const [payFromDeposit, setPayFromDeposit] = useState(editSale?.payment_method === 'deposit')
  const [saleDatetime, setSaleDatetime] = useState<string>(
    editSale ? isoToDatetimeLocal(editSale.created_at) : nowDatetimeLocal()
  )
  const [displayDatetime, setDisplayDatetime] = useState<string>(
    datetimeLocalToDisplay(editSale ? isoToDatetimeLocal(editSale.created_at) : nowDatetimeLocal())
  )
  const datePickerRef = useRef<HTMLInputElement>(null)

  const [pricePaidText, setPricePaidText] = useState(String(editSale?.price_paid ?? 0))
  const [amountGivenText, setAmountGivenText] = useState(
    String(editSale
      ? (editSale.ticket_id ? editSale.amount_given : (editSale.amount_given - editSale.price_paid))
      : 0)
  )

  const { client_id: clientId, ticket_id: ticketId, amount_given: amountGiven, price_paid: pricePaid, payment_method: payment, trainer_id: trainerId } = watch()

  const modalRef = useModalFocus(onClose)
  const depositDelta = useMemo(() => amountGiven - pricePaid, [amountGiven, pricePaid])
  const isDeduction = !ticketId && amountGiven < 0

  const fetchClientBalance = useCallback(async (id: string) => {
    const { data } = await supabase.from('clients').select('balance').eq('id', id).single()
    setClientBalance(data?.balance ?? 0)
  }, [])

  useEffect(() => {
    if (editSale?.client_id) fetchClientBalance(editSale.client_id)
  }, [editSale?.client_id, fetchClientBalance])

  async function ensureTickets() {
    if (tickets.length > 0) return
    const { data } = await supabase
      .from('tickets')
      .select('id,name,ticket_type,sessions,price')
      .eq('is_active', true)
      .order('name')
    setTickets(data ?? [])
  }

  async function ensureTrainers() {
    if (trainers.length > 0) return
    const { data } = await supabase
      .from('trainers')
      .select('id,name')
      .eq('is_active', true)
      .order('name')
    setTrainers(data ?? [])
  }

  function handleDepositToggle(on: boolean) {
    setPayFromDeposit(on)
    if (on) {
      setValue('amount_given', 0)
      setAmountGivenText('0')
      setValue('payment_method', 'deposit')
    } else {
      setValue('amount_given', pricePaid)
      setAmountGivenText(String(pricePaid))
      setValue('payment_method', 'cash')
    }
  }

  function handleTicketChange(id: string) {
    setValue('ticket_id', id)
    setTicketChanged(true)
    if (!id) {
      setPayFromDeposit(false)
      setValue('price_paid', 0)
      setValue('amount_given', 0)
      setValue('payment_method', 'cash')
      setPricePaidText('0')
      setAmountGivenText('0')
      return
    }
    const t = tickets.find(x => x.id === id)
    if (t) {
      setValue('price_paid', t.price)
      setPricePaidText(String(t.price))
      if (payFromDeposit) {
        setValue('amount_given', 0)
        setAmountGivenText('0')
      } else {
        setValue('amount_given', t.price)
        setAmountGivenText(String(t.price))
      }
    }
  }

  const onSubmit = async (formData: SaleFormValues) => {
    setLoading(true)
    setError('')

    // For no-ticket ops, amount_given holds a signed value.
    // Convert: positive → (amount_given=val, price_paid=0); negative → (amount_given=0, price_paid=abs(val))
    const isNoTicket = !formData.ticket_id
    const submitAmountGiven = isNoTicket && formData.amount_given < 0 ? 0 : formData.amount_given
    const submitPricePaid   = isNoTicket && formData.amount_given < 0 ? Math.abs(formData.amount_given) : formData.price_paid

    // ── EDIT: single atomic RPC ───────────────────────────────────────────
    if (isEdit) {
      let ticketName: string | null = null
      let ticketPrice = 0
      let sessions = 0
      let ticketType: string | null = null

      if (formData.ticket_id) {
        const t = tickets.find(x => x.id === formData.ticket_id)
        if (t) {
          ticketName = t.name; ticketPrice = t.price; sessions = t.sessions; ticketType = t.ticket_type
        } else if (!ticketChanged && editSale!.ticket_name != null) {
          ticketName = editSale!.ticket_name
          ticketPrice = editSale!.ticket_price ?? 0
          sessions = editSale!.sessions ?? 0
          ticketType = editSale!.ticket_type ?? null
        } else {
          const { data: td } = await supabase
            .from('tickets').select('name,price,sessions,ticket_type').eq('id', formData.ticket_id).single()
          if (!td) { setError('Абонемент не знайдено'); setLoading(false); return }
          ticketName = td.name; ticketPrice = td.price; sessions = td.sessions; ticketType = td.ticket_type
        }
      }

      const { data, error } = await supabase.rpc('update_sale', {
        p_sale_id:        editSale!.id,
        p_client_id:      formData.client_id,
        p_ticket_id:      formData.ticket_id || null,
        p_trainer_id:     formData.trainer_id || null,
        p_ticket_name:    ticketName,
        p_ticket_price:   ticketPrice,
        p_sessions:       sessions,
        p_ticket_type:    ticketType,
        p_price_paid:     submitPricePaid,
        p_amount_given:   submitAmountGiven,
        p_payment_method: formData.payment_method,
        p_notes:          formData.notes?.trim() || '',
        p_created_at:     new Date(saleDatetime).toISOString(),
      })

      if (error || !data?.[0]?.success) {
        setError(error?.message ?? data?.[0]?.error_message ?? 'Помилка збереження')
        setLoading(false)
        return
      }

      onSaved()
      return
    }

    // ── CREATE: single atomic RPC (insert + balance in one transaction) ───
    const { data, error } = await supabase.rpc('create_sale', {
      p_client_id:      formData.client_id,
      p_ticket_id:      formData.ticket_id || null,
      p_trainer_id:     formData.trainer_id || null,
      p_price_paid:     submitPricePaid,
      p_amount_given:   submitAmountGiven,
      p_payment_method: formData.payment_method,
      p_notes:          formData.notes?.trim() || '',
      p_created_at:     new Date(saleDatetime).toISOString(),
    })

    if (error || !data?.[0]?.success) {
      setError(error?.message ?? data?.[0]?.error_message ?? 'Помилка збереження')
      setLoading(false)
      return
    }

    onSaved()
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId}>{isEdit ? 'Редагувати продажу' : 'Нова продажа'}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
        </div>

        <div className={styles.body}>

          {/* Клієнт */}
          <div className={styles.field}>
            <label htmlFor="sale-client">Клієнт</label>
            <ClientSearchCombobox
              inputId="sale-client"
              initialLabel={editSale?.client_name ?? (preselectedClient ? formatClientLabel(preselectedClient) : undefined)}
              onSelect={(client: Client) => {
                setValue('client_id', client.id)
                fetchClientBalance(client.id)
              }}
              onClear={() => {
                setValue('client_id', '')
                setClientBalance(null)
              }}
              error={errors.client_id?.message}
              disabled={loading}
            />
            {clientId && clientBalance !== null && (
              <span className={`${styles.depositHint} ${clientBalance > 0 ? styles.depositPos : clientBalance < 0 ? styles.depositNeg : styles.depositZero}`}>
                Депозит: {clientBalance > 0 ? '+' : ''}{clientBalance.toLocaleString('uk-UA')} ₴
              </span>
            )}
          </div>

          {/* Абонемент */}
          <div className={styles.field}>
            <label htmlFor="sale-ticket">Абонемент</label>
            <select
              id="sale-ticket"
              value={ticketId}
              onFocus={ensureTickets}
              onChange={e => handleTicketChange(e.target.value)}
              disabled={loading}
            >
              <option value="">— Оберіть абонемент —</option>
              {isEdit && ticketId && !tickets.find(t => t.id === ticketId) && (
                <option value={ticketId}>{editSale!.ticket_name}</option>
              )}
              {tickets.map(t => (
                <option key={t.id} value={t.id}>{t.name} — {t.price.toLocaleString('uk-UA')} ₴</option>
              ))}
            </select>
          </div>

          {/* Оплата з депозиту */}
          {ticketId && (
            <div className={styles.checkboxField}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={payFromDeposit}
                  onChange={e => handleDepositToggle(e.target.checked)}
                  disabled={loading}
                />
                Оплата з депозиту
              </label>
              {payFromDeposit && clientBalance !== null && clientBalance < pricePaid && (
                <span className={`${styles.depositHint} ${styles.depositNeg}`}>
                  На депозиті {clientBalance.toLocaleString('uk-UA')} ₴ — може не вистачити
                </span>
              )}
            </div>
          )}

          {/* Фактична сума */}
          {ticketId && (
            <div className={styles.field}>
              <label htmlFor="sale-price-paid">
                {payFromDeposit ? 'Сума списання (₴)' : 'Фактична сума (₴)'}
              </label>
              <input
                id="sale-price-paid"
                type="number"
                value={pricePaidText}
                onFocus={e => e.target.select()}
                onChange={e => {
                  setPricePaidText(e.target.value)
                  const n = Number(e.target.value)
                  if (e.target.value !== '' && !isNaN(n)) setValue('price_paid', n)
                  else if (e.target.value === '') setValue('price_paid', 0)
                }}
                onBlur={() => {
                  const n = Number(pricePaidText)
                  const val = pricePaidText === '' || isNaN(n) ? 0 : n
                  setPricePaidText(String(val))
                  setValue('price_paid', val)
                }}
                min={0}
                step={1}
                disabled={loading}
              />
              {payFromDeposit && pricePaid > 0 && (
                <span className={`${styles.depositHint} ${styles.depositNeg}`}>
                  −{pricePaid.toLocaleString('uk-UA')} ₴ з депозиту
                </span>
              )}
            </div>
          )}

          {/* Сума від клієнта / операція з депозитом */}
          {!(ticketId && payFromDeposit) && <div className={styles.field}>
            <label htmlFor="sale-amount-given">
              {ticketId ? 'Сума від клієнта (₴)' : 'Сума (₴)'}
            </label>
            <input
              id="sale-amount-given"
              type="number"
              value={amountGivenText}
              onFocus={e => e.target.select()}
              onChange={e => {
                setAmountGivenText(e.target.value)
                if (e.target.value === '' || e.target.value === '-') {
                  setValue('amount_given', 0)
                } else {
                  const n = Number(e.target.value)
                  if (!isNaN(n)) setValue('amount_given', n)
                }
              }}
              onBlur={() => {
                const n = Number(amountGivenText)
                const val = amountGivenText === '' || isNaN(n) ? 0 : n
                setAmountGivenText(String(val))
                setValue('amount_given', val)
              }}
              min={ticketId ? 0 : undefined}
              step={1}
              disabled={loading}
            />
            {!ticketId && (
              <span className={styles.depositHint} style={{ color: 'var(--text-3)' }}>
                Позитивне — поповнення, негативне — списання
              </span>
            )}
            {ticketId && depositDelta !== 0 && (
              <span className={`${styles.depositHint} ${depositDelta > 0 ? styles.depositPos : styles.depositNeg}`}>
                {depositDelta > 0
                  ? `+${depositDelta.toLocaleString('uk-UA')} ₴ на депозит`
                  : `${depositDelta.toLocaleString('uk-UA')} ₴ з депозиту`}
              </span>
            )}
            {!ticketId && amountGiven !== 0 && (
              <span className={`${styles.depositHint} ${amountGiven > 0 ? styles.depositPos : styles.depositNeg}`}>
                {amountGiven > 0
                  ? `+${amountGiven.toLocaleString('uk-UA')} ₴ на депозит`
                  : `${amountGiven.toLocaleString('uk-UA')} ₴ з депозиту`}
              </span>
            )}
          </div>}

          {/* Спосіб оплати */}
          {!isDeduction && !payFromDeposit && (
            <div className={styles.field}>
              <label htmlFor="sale-payment">Спосіб оплати</label>
              <select
                id="sale-payment"
                value={payment}
                onChange={e => setValue('payment_method', e.target.value as PaymentMethod)}
                disabled={loading}
              >
                <option value="cash">Готівка</option>
                <option value="fop">ФОП</option>
                <option value="personal_card">Особиста карта</option>
              </select>
            </div>
          )}

          {/* Тренер (тільки для готівки) */}
          {!isDeduction && payment === 'cash' && (
            <div className={styles.field}>
              <label htmlFor="sale-trainer">
                Тренер {ticketId && <span className={styles.required}>* обов'язково</span>}
              </label>
              <select
                id="sale-trainer"
                value={trainerId}
                onFocus={ensureTrainers}
                onChange={e => setValue('trainer_id', e.target.value)}
                disabled={loading}
              >
                <option value="">— Оберіть тренера —</option>
                {isEdit && trainerId && !trainers.find(t => t.id === trainerId) && (
                  <option value={trainerId}>{editSale!.trainer_name}</option>
                )}
                {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {errors.trainer_id && (
                <p className={styles.errorHint} role="alert">{errors.trainer_id.message}</p>
              )}
            </div>
          )}

          {/* Дата і час */}
          <div className={styles.field}>
            <label htmlFor="sale-datetime-text">Дата та час</label>
            <div className={styles.datetimeRow}>
              <input
                id="sale-datetime-text"
                type="text"
                value={displayDatetime}
                onChange={e => {
                  setDisplayDatetime(e.target.value)
                  const parsed = parseDisplayToDatetimeLocal(e.target.value)
                  if (parsed) setSaleDatetime(parsed)
                }}
                placeholder="ДД.ММ.РРРР ГГ:ХХ"
                disabled={loading}
              />
              <button
                type="button"
                className={styles.calendarBtn}
                onClick={() => {
                  try { datePickerRef.current?.showPicker() }
                  catch { datePickerRef.current?.focus() }
                }}
                disabled={loading}
                aria-label="Відкрити календар"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="3" width="14" height="12" rx="1.5"/>
                  <line x1="5" y1="1" x2="5" y2="5"/><line x1="11" y1="1" x2="11" y2="5"/>
                  <line x1="1" y1="7" x2="15" y2="7"/>
                </svg>
              </button>
              <input
                ref={datePickerRef}
                type="datetime-local"
                value={saleDatetime}
                onChange={e => {
                  setSaleDatetime(e.target.value)
                  setDisplayDatetime(datetimeLocalToDisplay(e.target.value))
                }}
                disabled={loading}
                className={styles.datetimeHidden}
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Коментар / Причина */}
          <div className={styles.field}>
            <label htmlFor="sale-notes">
              Коментар
            </label>
            <textarea
              id="sale-notes"
              {...register('notes')}
              placeholder={ticketId ? "Необов'язково" : 'Поповнення, виправлення помилки...'}
              rows={2}
              disabled={loading}
            />
            {errors.notes && (
              <p className={styles.errorHint} role="alert">{errors.notes.message}</p>
            )}
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={loading}>Скасувати</button>
          <button className={styles.btnSave} onClick={handleSubmit(onSubmit)} disabled={loading}>
            {loading ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  )
}
