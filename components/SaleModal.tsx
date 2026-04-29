'use client'
import { useState, useEffect, useMemo, useCallback, useId } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createClient } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
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
  price_paid: z.number().min(0),
  amount_given: z.number().min(0),
  payment_method: z.enum(['cash', 'fop', 'personal_card']),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.ticket_id && !data.trainer_id && data.payment_method === 'cash') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Оберіть тренера', path: ['trainer_id'] })
  }
})

type SaleFormValues = z.infer<typeof saleSchema>


export default function SaleModal({ onClose, onSaved, editSale }: Props) {
  const isEdit = !!editSale
  const titleId = useId()

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
  const [clientBalance, setClientBalance] = useState<number | null>(null)
  const [ticketChanged, setTicketChanged] = useState(false)

  const { client_id: clientId, ticket_id: ticketId, amount_given: amountGiven, price_paid: pricePaid, payment_method: payment, trainer_id: trainerId } = watch()

  const modalRef = useModalFocus(onClose)
  const depositDelta = useMemo(() => amountGiven - pricePaid, [amountGiven, pricePaid])

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

  const onSubmit = async (formData: SaleFormValues) => {
    setLoading(true)
    setError('')

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
        p_price_paid:     formData.price_paid,
        p_amount_given:   formData.amount_given,
        p_payment_method: formData.payment_method,
        p_notes:          formData.notes?.trim() || '',
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
      p_price_paid:     formData.price_paid,
      p_amount_given:   formData.amount_given,
      p_payment_method: formData.payment_method,
      p_notes:          formData.notes?.trim() || '',
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
              initialLabel={editSale?.client_name}
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
