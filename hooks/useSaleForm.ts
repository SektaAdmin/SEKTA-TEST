'use client'
import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { fetchClientBalance } from '@/hooks/useClientBalance'
import { nowDatetimeLocal, isoToDatetimeLocal } from '@/lib/formatters'
import { VM } from '@/lib/validation-messages'
import type { Ticket, PaymentMethod } from '@/types'
import type { EditSaleSnapshot } from '@/components/SaleModal'

const saleSchema = z.object({
  client_id: z.string().min(1, VM.required.selectClient),
  ticket_id: z.string().optional().or(z.literal('')),
  trainer_id: z.string().optional().or(z.literal('')),
  cash_holder: z.string().optional().or(z.literal('')),
  price_paid: z.number().min(0),
  amount_given: z.number(),
  payment_method: z.enum(['cash', 'fop', 'personal_card', 'deposit']),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  const liveMethod = data.payment_method !== 'deposit'
  // Тренер обов'язковий при готівковій оплаті абонемента
  if (data.ticket_id && !data.trainer_id && data.payment_method === 'cash') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: VM.required.selectTrainer, path: ['trainer_id'] })
  }
  // D-4: жива оплата абонемента мусить мати «дав клієнт» > 0.
  // «Дав 0» = оплата з депозиту → для цього є метод 'deposit', не cash/fop/card.
  if (data.ticket_id && liveMethod && data.amount_given <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: VM.invalid.amountGivenPositive, path: ['amount_given'] })
  }
  // Операція з депозитом без абонемента не може бути нульовою
  if (!data.ticket_id && data.amount_given === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: VM.invalid.amountNonZero, path: ['amount_given'] })
  }
})

export type SaleFormValues = z.infer<typeof saleSchema>

/**
 * Зводить значення форми до того, що пишеться в sales.
 * Закон: Δдепозит = amount_given − price_paid (його застосовує create_sale/update_sale).
 *
 * - Абонемент + 'deposit': списання з депозиту → ag=0, pp=сума списання, Δ=−pp.
 * - Абонемент + жива оплата: pp=номінал, ag=скільки дав, Δ=ag−pp (решта→депозит / борг).
 * - Без абонемента: одне поле ±сума.
 *     +сума → поповнення (ag=сума, pp=0, Δ=+сума);
 *     −сума → списання/корекція (ag=0, pp=|сума|, Δ=−|сума|).
 */
export function resolveSubmitValues(formData: SaleFormValues) {
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

export function useSaleForm(editSale?: EditSaleSnapshot, preselectedClientBalance?: number | null) {
  const form = useForm<SaleFormValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      client_id: editSale?.client_id ?? '',
      ticket_id: editSale?.ticket_id ?? '',
      trainer_id: editSale?.trainer_id ?? '',
      cash_holder: editSale?.cash_holder ?? '',
      price_paid: editSale?.price_paid ?? 0,
      amount_given: editSale
        ? (editSale.ticket_id
            ? editSale.amount_given
            : (editSale.amount_given - editSale.price_paid))
        : 0,
      payment_method: editSale?.payment_method ?? 'cash',
      notes: editSale?.notes ?? '',
    },
  })

  const [clientBalance, setClientBalance] = useState<number | null>(preselectedClientBalance ?? null)
  const [ticketChanged, setTicketChanged] = useState(false)
  const [saleDatetime, setSaleDatetime] = useState(
    editSale ? isoToDatetimeLocal(editSale.created_at) : nowDatetimeLocal()
  )

  const pricePaid$ = useNumberField(editSale?.price_paid ?? 0)
  const amountGiven$ = useNumberField(
    editSale
      ? (editSale.ticket_id ? editSale.amount_given : (editSale.amount_given - editSale.price_paid))
      : 0
  )

  const loadClientBalance = useCallback(async (id: string) => {
    const balance = await fetchClientBalance(id)
    setClientBalance(balance ?? 0)
  }, [])

  /**
   * Вибір способу оплати. 'deposit' = гроші з балансу (ag=0, pp=сума списання).
   * Перехід на/з 'deposit' вирівнює amount_given під обраний абонемент.
   */
  function handlePaymentMethodChange(method: PaymentMethod, currentPricePaid: number) {
    form.setValue('payment_method', method)
    if (method === 'deposit') {
      form.setValue('amount_given', 0)
      amountGiven$.setText('0')
    } else {
      // Повертаємось до живої оплати — підставляємо номінал як «дав клієнт»
      form.setValue('amount_given', currentPricePaid)
      amountGiven$.setText(String(currentPricePaid))
    }
  }

  function handleTicketChange(id: string, tickets: Ticket[]) {
    form.setValue('ticket_id', id)
    setTicketChanged(true)
    if (!id) {
      // Без абонемента метод 'deposit' не має сенсу → повертаємо живу оплату
      if (form.getValues('payment_method') === 'deposit') form.setValue('payment_method', 'cash')
      form.setValue('price_paid', 0)
      form.setValue('amount_given', 0)
      pricePaid$.setText('0')
      amountGiven$.setText('0')
      return
    }
    const t = tickets.find(x => x.id === id)
    if (t) {
      form.setValue('price_paid', t.price)
      pricePaid$.setText(String(t.price))
      if (form.getValues('payment_method') === 'deposit') {
        form.setValue('amount_given', 0)
        amountGiven$.setText('0')
      } else {
        form.setValue('amount_given', t.price)
        amountGiven$.setText(String(t.price))
      }
    }
  }

  return {
    form,
    clientBalance,
    setClientBalance,
    ticketChanged,
    saleDatetime,
    setSaleDatetime,
    pricePaid$,
    amountGiven$,
    loadClientBalance,
    handlePaymentMethodChange,
    handleTicketChange,
  }
}
