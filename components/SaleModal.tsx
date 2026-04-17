'use client'
import { useState, useRef, useEffect, useMemo, useCallback, useId } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createClient } from '@/lib/supabase'
import type { Client, Ticket, Trainer, SaleFormData, PaymentMethod } from '@/types'
import styles from './SaleModal.module.css'

// Supabase client at module level — not recreated on each render
const supabase = createClient()

export interface EditSaleSnapshot {
  id: string
  client_id: string
  client_name: string
  ticket_id: string | null
  ticket_name: string | null
  ticket_price: number | null
  sessions: number | null
  trainer_id: string | null
  trainer_name: string | null
  price_paid: number
  amount_given: number
  payment_method: PaymentMethod
  notes: string | null
}

interface Props {
  onClose: () => void
  onSaved: () => void
  editSale?: EditSaleSnapshot
}

const saleSchema = z.object({
  client_id: z.string().min(1, 'Оберіть клієнта'),
  ticket_id: z.string().optional().or(z.literal('')),
  trainer_id: z.string().optional().or(z.literal('')),
  price_paid: z.number({ invalid_type_error: 'Вкажіть число' }).min(0),
  amount_given: z.number({ invalid_type_error: 'Вкажіть число' }).min(0),
  payment_method: z.enum(['cash', 'fop', 'personal_card']),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.ticket_id && !data.trainer_id && data.payment_method === 'cash') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Оберіть тренера', path: ['trainer_id'] })
  }
})

type SaleFormValues = z.infer<typeof saleSchema>

function clientLabel(c: Client): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
  return name || c.phone || c.id
}

export default function SaleModal({ onClose, onSaved, editSale }: Props) {
  const isEdit = !!editSale
  const titleId = useId()
  const listboxId = useId()

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<SaleFormValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      client_id: editSale?.client_id ?? '',
      ticket_id: editSale?.ticket_id ?? '',
      trainer_id: editSale?.trainer_id ?? '',
      price_paid: editSale?.price_paid ?? 0,
      amount_given: editSale?.amount_given ?? 0,
      payment_method: editSale?.payment_method ?? 'cash',
      notes: editSale?.notes ?? '',
    }
  })

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [clientSearch, setClientSearch] = useState(editSale?.client_name ?? '')
  const [clientResults, setClientResults] = useState<Client[]>([])
  const [clientOpen, setClientOpen] = useState(false)
  const [clientBalance, setClientBalance] = useState<number | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  const [ticketChanged, setTicketChanged] = useState(false)

  const { client_id: clientId, ticket_id: ticketId, amount_given: amountGiven, price_paid: pricePaid, payment_method: payment, trainer_id: trainerId } = watch()

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  // Stable ref for onClose so focus-trap effect doesn't re-run on parent re-renders
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const depositDelta = useMemo(() => amountGiven - pricePaid, [amountGiven, pricePaid])

  // Focus trap + Escape key
  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return

    // Focus first focusable element on mount
    modal.querySelector<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'
    )?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCloseRef.current(); return }
      if (e.key !== 'Tab') return

      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ))
      if (!focusable.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, []) // intentionally empty — runs once on mount, onClose accessed via ref

  const fetchClientBalance = useCallback(async (id: string) => {
    const { data } = await supabase.from('clients').select('balance').eq('id', id).single()
    setClientBalance(data?.balance ?? 0)
  }, [])

  useEffect(() => {
    if (editSale?.client_id) fetchClientBalance(editSale.client_id)
  }, [editSale?.client_id, fetchClientBalance])

  async function searchClients(q: string) {
    const trimmed = q.trim()
    if (!trimmed) { setClientResults([]); return }

    const parts = trimmed.split(/\s+/)

    if (parts.length === 1) {
      const p = parts[0]
      const { data } = await supabase
        .from('clients')
        .select('id,first_name,last_name,phone')
        .or(`first_name.ilike.%${p}%,last_name.ilike.%${p}%,phone.ilike.%${p}%`)
        .order('last_name')
        .limit(10)
      setClientResults(data ?? [])
    } else {
      const [a, b] = parts
      const [r1, r2] = await Promise.all([
        supabase.from('clients').select('id,first_name,last_name,phone')
          .ilike('first_name', `%${a}%`).ilike('last_name', `%${b}%`)
          .order('last_name').limit(10),
        supabase.from('clients').select('id,first_name,last_name,phone')
          .ilike('first_name', `%${b}%`).ilike('last_name', `%${a}%`)
          .order('last_name').limit(10),
      ])
      const seen = new Set<string>()
      setClientResults([...(r1.data ?? []), ...(r2.data ?? [])].filter(c => {
        if (seen.has(c.id)) return false
        seen.add(c.id)
        return true
      }))
    }
    setActiveIndex(-1)
  }

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

  function handleTicketChange(id: string) {
    setValue('ticket_id', id)
    setTicketChanged(true)
    if (!id) {
      setValue('price_paid', 0)
      setValue('amount_given', 0)
      return
    }
    const t = tickets.find(x => x.id === id)
    if (t) {
      setValue('price_paid', t.price)
      setValue('amount_given', t.price)
    }
  }

  function handleClientInput(value: string) {
    setClientSearch(value)
    setValue('client_id', '')
    setClientBalance(null)
    setClientOpen(true)
    setActiveIndex(-1)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => searchClients(value), 250)
  }

  const selectClient = useCallback((c: Client) => {
    setValue('client_id', c.id)
    setClientSearch(clientLabel(c))
    setClientOpen(false)
    setClientResults([])
    setActiveIndex(-1)
    fetchClientBalance(c.id)
  }, [setValue, fetchClientBalance])

  function handleClientBlur() {
    blurRef.current = setTimeout(() => setClientOpen(false), 150)
  }

  function handleClientFocus() {
    if (blurRef.current) clearTimeout(blurRef.current)
    if (clientSearch.trim() && !clientId) {
      setClientOpen(true)
      if (!clientResults.length) searchClients(clientSearch)
    }
  }

  function handleClientKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!clientOpen || !clientResults.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, clientResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      selectClient(clientResults[activeIndex])
    } else if (e.key === 'Escape') {
      setClientOpen(false)
    }
  }

  async function shiftBalance(id: string, delta: number): Promise<void> {
    if (delta === 0) return
    const { error } = await supabase.rpc('adjust_client_balance', { p_client_id: id, p_delta: delta })
    if (error) throw new Error(error.message)
  }

  async function updateClientBalance(newAmountGiven: number, newPricePaid: number) {
  if (isEdit && editSale!.client_id !== clientId) {
    // Смена клиента
    const oldDelta = editSale!.amount_given - editSale!.price_paid

    const { error: err1 } = await supabase.rpc('update_client_balance', {
      p_client_id: editSale!.client_id,
      p_amount: -oldDelta,          // ✅ Возвращаем старому клиенту (инверсия тут нужна)
      p_transaction_type: 'refund',
      p_description: 'Скасування продажи',
      p_related_sale_id: editSale!.id,
    })
    if (err1) throw new Error(`Помилка при поверненню коштів: ${err1.message}`)

    const newDelta = newAmountGiven - newPricePaid
    const { error: err2 } = await supabase.rpc('update_client_balance', {
      p_client_id: clientId,
      p_amount: newDelta,           // ✅ БЕЗ инверсии
      p_transaction_type: 'purchase',
      p_description: 'Передача продажи',
      p_related_sale_id: editSale!.id,
    })
    if (err2) throw new Error(`Помилка при додаванню коштів: ${err2.message}`)

  } else if (isEdit) {
    // Редактирование без смены клиента — пересчитываем разницу дельт
    const oldDelta = editSale!.amount_given - editSale!.price_paid
    const newDelta = newAmountGiven - newPricePaid
    const correction = newDelta - oldDelta  // Только изменение

    if (correction === 0) return

    const { error } = await supabase.rpc('update_client_balance', {
      p_client_id: clientId,
      p_amount: correction,         // ✅ Только коррекция, без инверсии
      p_transaction_type: 'adjustment',
      p_description: 'Редагування продажи',
      p_related_sale_id: editSale!.id,
    })
    if (error) throw new Error(error.message)

  } else {
    // Новая продажа
    const newDelta = newAmountGiven - newPricePaid

    const { error } = await supabase.rpc('update_client_balance', {
      p_client_id: clientId,
      p_amount: newDelta,           // ✅ БЕЗ инверсии
      p_transaction_type: ticketId ? 'purchase' : 'deposit_topup',
      p_description: ticketId
        ? `Покупка ${tickets.find(t => t.id === ticketId)?.name || 'абонемента'}`
        : 'Поповнення депозиту',
      p_related_sale_id: null,
    })
    if (error) throw new Error(error.message)
  }
}

  async function saveDepositOnly(formData: SaleFormValues): Promise<string | null> {
    const depositData = {
      client_id: formData.client_id,
      ticket_id: null,
      trainer_id: formData.trainer_id || null,
      ticket_name: null,
      ticket_price: 0,
      sessions: 0,
      price_paid: 0,
      amount_given: formData.amount_given,
      payment_method: formData.payment_method,
      notes: formData.notes?.trim() || '',
    }
    const { error } = isEdit
      ? await supabase.from('sales').update(depositData).eq('id', editSale!.id)
      : await supabase.from('sales').insert(depositData)
    return error?.message ?? null
  }

  async function saveSaleWithTicket(
    formData: SaleFormValues,
    ticketData: { name: string; price: number; sessions: number }
  ): Promise<string | null> {
    const data: SaleFormData & { ticket_name: string; ticket_price: number; sessions: number } = {
      client_id: formData.client_id,
      ticket_id: formData.ticket_id!,
      trainer_id: formData.trainer_id || null,
      ticket_name: ticketData.name,
      ticket_price: ticketData.price,
      sessions: ticketData.sessions,
      price_paid: formData.price_paid,
      amount_given: formData.amount_given,
      payment_method: formData.payment_method,
      notes: formData.notes?.trim() || '',
    }
    const { error } = isEdit
      ? await supabase.from('sales').update(data).eq('id', editSale!.id)
      : await supabase.from('sales').insert(data)
    return error?.message ?? null
  }

  const onSubmit = async (formData: SaleFormValues) => {
    setLoading(true)
    setError('')

    if (!formData.ticket_id) {
      const err = await saveDepositOnly(formData)
      if (err) { setError(err); setLoading(false); return }
      try {
        await updateClientBalance(formData.amount_given, 0)
      } catch (e) {
        setError('Запис збережено, але баланс не оновлено: ' + (e as Error).message)
        setLoading(false)
        return
      }
      onSaved()
      return
    }

    // Resolve ticket snapshot: loaded list → edit snapshot → DB fetch
    let ticketData: { name: string; price: number; sessions: number } | null =
      tickets.find(t => t.id === formData.ticket_id) ?? null

    if (!ticketData) {
      if (isEdit && !ticketChanged && editSale!.ticket_name && editSale!.ticket_price != null && editSale!.sessions != null) {
        ticketData = { name: editSale!.ticket_name, price: editSale!.ticket_price, sessions: editSale!.sessions }
      } else {
        const { data: td } = await supabase
          .from('tickets').select('id,name,price,sessions').eq('id', formData.ticket_id).single()
        if (!td) { setError('Абонемент не знайдено'); setLoading(false); return }
        ticketData = td
      }
    }

    const err = await saveSaleWithTicket(formData, ticketData)
    if (err) { setError(err); setLoading(false); return }

    try {
      await updateClientBalance(formData.amount_given, formData.price_paid)
    } catch (e) {
      setError('Продажу збережено, але баланс не оновлено: ' + (e as Error).message)
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
            <div className={styles.clientWrap}>
              <input
                id="sale-client"
                type="text"
                value={clientSearch}
                onChange={e => handleClientInput(e.target.value)}
                onFocus={handleClientFocus}
                onBlur={handleClientBlur}
                onKeyDown={handleClientKeyDown}
                placeholder="Пошук за іменем або телефоном..."
                autoComplete="off"
                role="combobox"
                aria-expanded={clientOpen}
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-activedescendant={activeIndex >= 0 ? `client-opt-${activeIndex}` : undefined}
                disabled={loading}
              />
              {clientOpen && clientSearch.trim() && (
                <div
                  id={listboxId}
                  className={styles.clientDropdown}
                  role="listbox"
                  aria-label="Результати пошуку"
                >
                  {clientResults.length === 0 ? (
                    <div className={styles.clientEmpty}>Нічого не знайдено</div>
                  ) : clientResults.map((c, i) => (
                    <div
                      key={c.id}
                      id={`client-opt-${i}`}
                      className={`${styles.clientOption}${i === activeIndex ? ` ${styles.clientOptionActive}` : ''}`}
                      onMouseDown={() => selectClient(c)}
                      role="option"
                      aria-selected={i === activeIndex}
                    >
                      {clientLabel(c)}
                      {c.phone && <span className={styles.clientPhone}>{c.phone}</span>}
                    </div>
                  ))}
                </div>
              )}
              {errors.client_id && (
                <p className={styles.errorHint} role="alert">{errors.client_id.message}</p>
              )}
            </div>
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

          {/* Фактична сума */}
          {ticketId && (
            <div className={styles.field}>
              <label htmlFor="sale-price-paid">Фактична сума (₴)</label>
              <input
                id="sale-price-paid"
                type="number"
                value={pricePaid}
                onChange={e => setValue('price_paid', e.target.value === '' ? 0 : Number(e.target.value))}
                min={0}
                step={1}
                disabled={loading}
              />
            </div>
          )}

          {/* Сума від клієнта / поповнення депозиту */}
          <div className={styles.field}>
            <label htmlFor="sale-amount-given">
              {ticketId ? 'Сума від клієнта (₴)' : 'Сума поповнення депозиту (₴)'}
            </label>
            <input
              id="sale-amount-given"
              type="number"
              value={amountGiven}
              onChange={e => setValue('amount_given', e.target.value === '' ? 0 : Number(e.target.value))}
              min={0}
              step={1}
              disabled={loading}
            />
            {ticketId && depositDelta !== 0 && (
              <span className={`${styles.depositHint} ${depositDelta > 0 ? styles.depositPos : styles.depositNeg}`}>
                {depositDelta > 0
                  ? `+${depositDelta.toLocaleString('uk-UA')} ₴ на депозит`
                  : `${depositDelta.toLocaleString('uk-UA')} ₴ з депозиту`}
              </span>
            )}
            {!ticketId && amountGiven > 0 && (
              <span className={`${styles.depositHint} ${styles.depositPos}`}>
                +{amountGiven.toLocaleString('uk-UA')} ₴ на депозит
              </span>
            )}
          </div>

          {/* Спосіб оплати */}
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

          {/* Тренер (тільки для готівки) */}
          {payment === 'cash' && (
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

          {/* Коментар */}
          <div className={styles.field}>
            <label htmlFor="sale-notes">Коментар</label>
            <textarea
              id="sale-notes"
              {...register('notes')}
              placeholder="Необов'язково"
              rows={2}
              disabled={loading}
            />
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
