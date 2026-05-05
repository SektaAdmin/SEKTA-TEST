'use client'
import { useState, useEffect, useMemo, useCallback, useId, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createClient } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
import { formatClientLabel, nowDatetimeLocal, isoToDatetimeLocal, datetimeLocalToDisplay, parseDisplayToDatetimeLocal } from '@/lib/formatters'
import ClientSearchCombobox from './ClientSearchCombobox'
import Button from '@/components/ui/Button'
import type { Client, Ticket, Trainer, PaymentMethod } from '@/types'

const supabase = createClient()

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Готівка',
  fop: 'ФОП',
  personal_card: 'Особиста карта',
}

function resolveSubmitValues(formData: SaleFormValues) {
  const isNoTicket = !formData.ticket_id
  return {
    submitAmountGiven: isNoTicket && formData.amount_given < 0 ? 0 : formData.amount_given,
    submitPricePaid:   isNoTicket && formData.amount_given < 0 ? Math.abs(formData.amount_given) : formData.price_paid,
  }
}

function useNumberField(initial: number) {
  const [text, setText] = useState(String(initial))
  function onChange(e: React.ChangeEvent<HTMLInputElement>, set: (n: number) => void) {
    setText(e.target.value)
    if (e.target.value === '' || e.target.value === '-') { set(0); return }
    const n = Number(e.target.value)
    if (!isNaN(n)) set(n)
  }
  function onBlur(set: (n: number) => void) {
    const n = Number(text)
    const val = text === '' || isNaN(n) ? 0 : n
    setText(String(val))
    set(val)
  }
  return { text, setText, onChange, onBlur }
}

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

const fieldCls = 'w-full px-3 py-[9px] bg-[var(--bg-3)] border border-[0.5px] border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text)] text-[13px] outline-none transition-colors duration-150 placeholder:text-[var(--text-3)] focus:border-[var(--accent)] disabled:opacity-50'
const labelCls = 'text-[11px] text-[var(--text-2)] tracking-[0.04em] uppercase'
const errorHintCls = 'text-[11px] text-[var(--danger)] mt-0.5'
const depositHintCls = 'text-[11px] font-medium tracking-[0.02em]'

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
      amount_given: editSale
        ? (editSale.ticket_id ? editSale.amount_given : (editSale.amount_given - editSale.price_paid))
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

  const pricePaid$ = useNumberField(editSale?.price_paid ?? 0)
  const amountGiven$ = useNumberField(
    editSale ? (editSale.ticket_id ? editSale.amount_given : (editSale.amount_given - editSale.price_paid)) : 0
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
    const { data } = await supabase.from('tickets').select('id,name,ticket_type,sessions,price').eq('is_active', true).order('name')
    setTickets(data ?? [])
  }

  async function ensureTrainers() {
    if (trainers.length > 0) return
    const { data } = await supabase.from('trainers').select('id,name').eq('is_active', true).order('name')
    setTrainers(data ?? [])
  }

  function handleDepositToggle(on: boolean) {
    setPayFromDeposit(on)
    if (on) {
      setValue('amount_given', 0); amountGiven$.setText('0'); setValue('payment_method', 'deposit')
    } else {
      setValue('amount_given', pricePaid); amountGiven$.setText(String(pricePaid)); setValue('payment_method', 'cash')
    }
  }

  function handleTicketChange(id: string) {
    setValue('ticket_id', id)
    setTicketChanged(true)
    if (!id) {
      setPayFromDeposit(false)
      setValue('price_paid', 0); setValue('amount_given', 0); setValue('payment_method', 'cash')
      pricePaid$.setText('0'); amountGiven$.setText('0')
      return
    }
    const t = tickets.find(x => x.id === id)
    if (t) {
      setValue('price_paid', t.price); pricePaid$.setText(String(t.price))
      if (payFromDeposit) { setValue('amount_given', 0); amountGiven$.setText('0') }
      else { setValue('amount_given', t.price); amountGiven$.setText(String(t.price)) }
    }
  }

  const onSubmit = async (formData: SaleFormValues) => {
    setLoading(true)
    setError('')
    const { submitAmountGiven, submitPricePaid } = resolveSubmitValues(formData)

    if (isEdit) {
      let ticketName: string | null = null
      let ticketPrice = 0; let sessions = 0; let ticketType: string | null = null

      if (formData.ticket_id) {
        const t = tickets.find(x => x.id === formData.ticket_id)
        if (t) {
          ticketName = t.name; ticketPrice = t.price; sessions = t.sessions; ticketType = t.ticket_type
        } else if (!ticketChanged && editSale!.ticket_name != null) {
          ticketName = editSale!.ticket_name; ticketPrice = editSale!.ticket_price ?? 0
          sessions = editSale!.sessions ?? 0; ticketType = editSale!.ticket_type ?? null
        } else {
          const { data: td } = await supabase.from('tickets').select('name,price,sessions,ticket_type').eq('id', formData.ticket_id).single()
          if (!td) { setError('Абонемент не знайдено'); setLoading(false); return }
          ticketName = td.name; ticketPrice = td.price; sessions = td.sessions; ticketType = td.ticket_type
        }
      }

      const { data, error } = await supabase.rpc('update_sale', {
        p_sale_id: editSale!.id, p_client_id: formData.client_id,
        p_ticket_id: formData.ticket_id || null, p_trainer_id: formData.trainer_id || null,
        p_ticket_name: ticketName, p_ticket_price: ticketPrice, p_sessions: sessions, p_ticket_type: ticketType,
        p_price_paid: submitPricePaid, p_amount_given: submitAmountGiven,
        p_payment_method: formData.payment_method, p_notes: formData.notes?.trim() || '',
        p_created_at: new Date(saleDatetime).toISOString(),
      })
      if (error || !data?.[0]?.success) { setError(error?.message ?? data?.[0]?.error_message ?? 'Помилка збереження'); setLoading(false); return }
      onSaved(); return
    }

    const { data, error } = await supabase.rpc('create_sale', {
      p_client_id: formData.client_id, p_ticket_id: formData.ticket_id || null,
      p_trainer_id: formData.trainer_id || null, p_price_paid: submitPricePaid,
      p_amount_given: submitAmountGiven, p_payment_method: formData.payment_method,
      p_notes: formData.notes?.trim() || '', p_created_at: new Date(saleDatetime).toISOString(),
    })
    if (error || !data?.[0]?.success) { setError(error?.message ?? data?.[0]?.error_message ?? 'Помилка збереження'); setLoading(false); return }
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        className="flex flex-col w-[400px] max-h-[90vh] bg-[var(--bg-2)] border border-[0.5px] border-[var(--border-hover)] rounded-[var(--radius)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[0.5px] border-[var(--border)]">
          <h2 id={titleId} className="text-[14px] font-medium text-[var(--text)] m-0">{isEdit ? 'Редагувати продажу' : 'Нова продажа'}</h2>
          <button onClick={onClose} aria-label="Закрити" className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors text-[14px] leading-none cursor-pointer bg-transparent border-none">✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">

            {/* Дата та час */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sale-datetime-text" className={labelCls}>Дата та час</label>
              <div className="flex gap-1.5 items-center relative">
                <input
                  id="sale-datetime-text"
                  type="text"
                  className={`${fieldCls} flex-1 min-w-0`}
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
                  className="shrink-0 self-stretch flex items-center justify-center px-2.5 bg-[var(--bg-3)] border border-[0.5px] border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text-2)] cursor-pointer transition-colors duration-150 hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50"
                  onClick={() => { try { datePickerRef.current?.showPicker() } catch { datePickerRef.current?.focus() } }}
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
                  onChange={e => { setSaleDatetime(e.target.value); setDisplayDatetime(datetimeLocalToDisplay(e.target.value)) }}
                  disabled={loading}
                  className="absolute opacity-0 w-px h-px pointer-events-none top-0 left-0"
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Клієнт */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sale-client" className={labelCls}>Клієнт</label>
              <ClientSearchCombobox
                inputId="sale-client"
                initialLabel={editSale?.client_name ?? (preselectedClient ? formatClientLabel(preselectedClient) : undefined)}
                onSelect={(client: Client) => { setValue('client_id', client.id); fetchClientBalance(client.id) }}
                onClear={() => { setValue('client_id', ''); setClientBalance(null) }}
                error={errors.client_id?.message}
                disabled={loading}
              />
              {clientId && clientBalance !== null && (
                <span className={`${depositHintCls} ${clientBalance > 0 ? 'text-[#22c55e]' : clientBalance < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-3)]'}`}>
                  Депозит: {clientBalance > 0 ? '+' : ''}{clientBalance.toLocaleString('uk-UA')} ₴
                </span>
              )}
            </div>

            {/* Абонемент */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sale-ticket" className={labelCls}>Абонемент</label>
              <select
                id="sale-ticket"
                className={`${fieldCls} cursor-pointer`}
                value={ticketId}
                onFocus={ensureTickets}
                onChange={e => handleTicketChange(e.target.value)}
                disabled={loading}
              >
                <option value="">— Оберіть абонемент —</option>
                {isEdit && ticketId && !tickets.find(t => t.id === ticketId) && (
                  <option value={ticketId}>{editSale!.ticket_name}</option>
                )}
                {tickets.map(t => <option key={t.id} value={t.id}>{t.name} — {t.price.toLocaleString('uk-UA')} ₴</option>)}
              </select>
            </div>

            {/* Таб: Звичайна оплата / Депозит */}
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                {[{ on: false, label: 'Звичайна оплата' }, { on: true, label: 'Депозит' }].map(({ on, label }) => (
                  <button
                    key={label}
                    type="button"
                    className={`flex-1 py-2 text-[12px] border border-[0.5px] rounded-[var(--radius-sm)] cursor-pointer transition-all duration-150 disabled:opacity-50 ${payFromDeposit === on ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-text)] font-medium' : 'bg-[var(--bg-3)] border-[var(--border)] text-[var(--text-2)] hover:border-[var(--accent)] hover:text-[var(--text)]'}`}
                    onClick={() => handleDepositToggle(on)}
                    disabled={loading}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {payFromDeposit && clientBalance !== null && clientBalance < pricePaid && (
                <span className={`${depositHintCls} text-[var(--danger)]`}>
                  На депозиті {clientBalance.toLocaleString('uk-UA')} ₴ — може не вистачити
                </span>
              )}
            </div>

            {/* Спосіб оплати */}
            {!isDeduction && !payFromDeposit && (
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Спосіб оплати</label>
                <div className="flex gap-1.5">
                  {(['cash', 'fop', 'personal_card'] as PaymentMethod[]).map(method => (
                    <button
                      key={method}
                      type="button"
                      className={`flex-1 py-2 text-[12px] border border-[0.5px] rounded-[var(--radius-sm)] cursor-pointer transition-all duration-150 disabled:opacity-50 ${payment === method ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-text)] font-medium' : 'bg-[var(--bg-3)] border-[var(--border)] text-[var(--text-2)] hover:border-[var(--accent)] hover:text-[var(--text)]'}`}
                      onClick={() => setValue('payment_method', method)}
                      disabled={loading}
                    >
                      {PAYMENT_LABELS[method]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Тренер */}
            {!isDeduction && payment === 'cash' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="sale-trainer" className={labelCls}>
                  Тренер {ticketId && <span className="text-[var(--accent)] text-[10px] ml-1">* обов'язково</span>}
                </label>
                <select
                  id="sale-trainer"
                  className={`${fieldCls} cursor-pointer`}
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
                {errors.trainer_id && <p className={errorHintCls} role="alert">{errors.trainer_id.message}</p>}
              </div>
            )}

            {/* Фактична сума */}
            {ticketId && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="sale-price-paid" className={labelCls}>
                  {payFromDeposit ? 'Сума списання (₴)' : 'Фактична сума (₴)'}
                </label>
                <input
                  id="sale-price-paid"
                  type="number"
                  className={fieldCls}
                  value={pricePaid$.text}
                  onFocus={e => e.target.select()}
                  onChange={e => pricePaid$.onChange(e, n => setValue('price_paid', n))}
                  onBlur={() => pricePaid$.onBlur(n => setValue('price_paid', n))}
                  min={0} step={1} disabled={loading}
                />
                {payFromDeposit && pricePaid > 0 && (
                  <span className={`${depositHintCls} text-[var(--danger)]`}>−{pricePaid.toLocaleString('uk-UA')} ₴ з депозиту</span>
                )}
              </div>
            )}

            {/* Сума від клієнта */}
            {!(ticketId && payFromDeposit) && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="sale-amount-given" className={labelCls}>
                  {ticketId ? 'Сума від клієнта (₴)' : 'Сума (₴)'}
                </label>
                <input
                  id="sale-amount-given"
                  type="number"
                  className={fieldCls}
                  value={amountGiven$.text}
                  onFocus={e => e.target.select()}
                  onChange={e => amountGiven$.onChange(e, n => setValue('amount_given', n))}
                  onBlur={() => amountGiven$.onBlur(n => setValue('amount_given', n))}
                  min={ticketId ? 0 : undefined} step={1} disabled={loading}
                />
                {!ticketId && (
                  <span className={`${depositHintCls} text-[var(--text-3)]`}>Позитивне — поповнення, негативне — списання</span>
                )}
                {ticketId && depositDelta !== 0 && (
                  <span className={`${depositHintCls} ${depositDelta > 0 ? 'text-[#22c55e]' : 'text-[var(--danger)]'}`}>
                    {depositDelta > 0 ? `+${depositDelta.toLocaleString('uk-UA')} ₴ на депозит` : `${depositDelta.toLocaleString('uk-UA')} ₴ з депозиту`}
                  </span>
                )}
                {!ticketId && amountGiven !== 0 && (
                  <span className={`${depositHintCls} ${amountGiven > 0 ? 'text-[#22c55e]' : 'text-[var(--danger)]'}`}>
                    {amountGiven > 0 ? `+${amountGiven.toLocaleString('uk-UA')} ₴ на депозит` : `${amountGiven.toLocaleString('uk-UA')} ₴ з депозиту`}
                  </span>
                )}
              </div>
            )}

            {/* Коментар */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sale-notes" className={labelCls}>Коментар</label>
              <textarea
                id="sale-notes"
                className={`${fieldCls} resize-y min-h-[60px] font-[var(--font)] leading-[1.4]`}
                {...register('notes')}
                placeholder={ticketId ? "Необов'язково" : 'Поповнення, виправлення помилки...'}
                rows={2}
                disabled={loading}
              />
              {errors.notes && <p className={errorHintCls} role="alert">{errors.notes.message}</p>}
            </div>

            {error && <p className="text-[12px] text-[var(--danger)] bg-[var(--danger-dim)] px-3 py-2 rounded-[var(--radius-sm)]" role="alert">{error}</p>}
          </div>

          <div className="flex gap-2 justify-end px-6 py-4 border-t border-[0.5px] border-[var(--border)]">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Скасувати</Button>
            <Button type="submit" variant="primary" loading={loading}>Зберегти</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
